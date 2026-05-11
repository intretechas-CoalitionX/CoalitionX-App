import { getStore } from "@netlify/blobs";
import type { Config } from "@netlify/functions";

/* ══ Auth ══════════════════════════════════════════════════════ */
async function verifyToken(req: Request): Promise<boolean> {
  const secret = Netlify.env.get("APP_SECRET");
  if (!secret) return false;
  const auth  = req.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return false;
  try {
    const decoded = atob(token); const parts = decoded.split(":");
    if (parts.length < 3) return false;
    const email = parts[0]; const day = parts[1]; const hmac = parts.slice(2).join(":");
    const today = Math.floor(Date.now() / 86_400_000);
    if (day !== today.toString() && day !== (today - 1).toString()) return false;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${email}:${day}`));
    const exp = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
    return hmac === exp;
  } catch { return false; }
}

/* ══ OAuth token ══════════════════════════════════════════════ */
type TokenData = { access_token: string; refresh_token: string; expires_at: number };
async function getValidToken(): Promise<string> {
  const store = getStore("hubspot");
  const raw   = await store.get("tokens");
  if (!raw) throw new Error("HubSpot not connected.");
  let data: TokenData = JSON.parse(raw);
  if (Date.now() >= data.expires_at - 120_000) {
    const r = await fetch("https://api.hubapi.com/oauth/v1/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", client_id: Netlify.env.get("HUBSPOT_CLIENT_ID")!, client_secret: Netlify.env.get("HUBSPOT_CLIENT_SECRET")!, refresh_token: data.refresh_token }).toString()
    });
    if (!r.ok) throw new Error("HubSpot token refresh failed.");
    const f = await r.json() as { access_token: string; refresh_token: string; expires_in: number };
    data = { access_token: f.access_token, refresh_token: f.refresh_token, expires_at: Date.now() + (f.expires_in - 60) * 1000 };
    await store.set("tokens", JSON.stringify(data));
  }
  return data.access_token;
}

/* ══ HubSpot helpers ══════════════════════════════════════════ */
function json(s: number, b: Record<string, unknown>) { return Response.json(b, { status: s }); }

async function hs(path: string, token: string, init: RequestInit = {}) {
  const r = await fetch(`https://api.hubapi.com${path}`, {
    ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) }
  });
  const t = await r.text(); const b = t ? JSON.parse(t) : {};
  if (!r.ok) throw new Error(b.message || "HubSpot API failed.");
  return b;
}

type Payload = { action?: "note" | "task"; accountName?: string; prospectName?: string; contactEmail?: string; contactId?: string; companyId?: string; dueDate?: string; note?: string; taskTitle?: string };

async function upsertContact(p: Payload, token: string) {
  if (p.contactId) return p.contactId;
  if (!p.contactEmail) return "";
  const props: Record<string, string> = { email: p.contactEmail };
  if (p.prospectName) { const pts = p.prospectName.trim().split(/\s+/); props.firstname = pts[0]; props.lastname = pts.slice(1).join(" "); }
  try { return (await hs("/crm/v3/objects/contacts", token, { method: "POST", body: JSON.stringify({ properties: props }) })).id as string; }
  catch {
    const f = await hs(`/crm/v3/objects/contacts/${encodeURIComponent(p.contactEmail!)}?idProperty=email`, token);
    await hs(`/crm/v3/objects/contacts/${f.id}`, token, { method: "PATCH", body: JSON.stringify({ properties: props }) });
    return f.id as string;
  }
}

function assoc(cId: string, oId: string, type: "note" | "task") {
  const ca = type === "note" ? 202 : 204; const oa = type === "note" ? 190 : 192;
  const items = [];
  if (cId) items.push({ to: { id: cId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: ca }] });
  if (oId) items.push({ to: { id: oId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: oa }] });
  return items;
}

function duets(date?: string) {
  if (!date) return Date.now() + 3 * 86_400_000;
  const p = new Date(`${date}T09:00:00.000Z`).getTime();
  return isNaN(p) ? Date.now() + 3 * 86_400_000 : p;
}

/* ══ Handler ══════════════════════════════════════════════════ */
export default async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "Use POST." });
  if (!await verifyToken(req)) return json(401, { error: "Unauthorised." });

  let p: Payload;
  try { p = await req.json(); } catch { return json(400, { error: "Invalid JSON." }); }
  if (!p.note?.trim()) return json(400, { error: "Note body required." });

  // Basic input length cap
  if (p.note.length > 5000) return json(400, { error: "Note too long (max 5000 chars)." });

  let token: string;
  try { token = await getValidToken(); } catch (e) { return json(503, { error: e instanceof Error ? e.message : "HubSpot not connected." }); }

  try {
    const cId = await upsertContact(p, token);
    const oId = p.companyId || "";

    if (p.action === "task") {
      const task = await hs("/crm/v3/objects/tasks", token, {
        method: "POST",
        body: JSON.stringify({ properties: { hs_task_subject: p.taskTitle || `Follow up: ${p.accountName || "account"}`, hs_task_body: p.note, hs_task_status: "NOT_STARTED", hs_task_priority: "HIGH", hs_timestamp: String(duets(p.dueDate)) }, associations: assoc(cId, oId, "task") })
      });
      return json(200, { message: "HubSpot task created.", id: task.id });
    }

    const note = await hs("/crm/v3/objects/notes", token, {
      method: "POST",
      body: JSON.stringify({ properties: { hs_note_body: p.note, hs_timestamp: String(Date.now()) }, associations: assoc(cId, oId, "note") })
    });
    return json(200, { message: "HubSpot note logged.", id: note.id });
  } catch (e) {
    return json(502, { error: e instanceof Error ? e.message : "HubSpot request failed." });
  }
};

export const config: Config = { path: "/api/hubspot-log" };
