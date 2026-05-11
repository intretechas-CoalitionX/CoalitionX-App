import { getStore } from "@netlify/blobs";
import type { Config, Context } from "@netlify/functions";

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

/* ══ Cache helpers — 1 h TTL for CRM data ════════════════════ */
function cacheKey(account: string) {
  let h = 0;
  for (const c of account.toLowerCase()) { h = Math.imul(31, h) + c.charCodeAt(0) | 0; }
  return `hs:${Math.abs(h).toString(36)}`;
}
async function getCached(key: string): Promise<unknown | null> {
  try {
    const store = getStore("api-cache");
    const raw   = await store.get(key);
    if (!raw) return null;
    const { data, expires_at } = JSON.parse(raw);
    return Date.now() < expires_at ? data : null;
  } catch { return null; }
}
async function setCache(key: string, data: unknown, ttlMs: number): Promise<void> {
  try { await getStore("api-cache").set(key, JSON.stringify({ data, expires_at: Date.now() + ttlMs })); } catch { /**/ }
}

/* ══ OAuth token ══════════════════════════════════════════════ */
type TokenData = { access_token: string; refresh_token: string; expires_at: number };
async function getValidToken(): Promise<string> {
  const store = getStore("hubspot");
  const raw   = await store.get("tokens");
  if (!raw) throw new Error("HubSpot not connected. Authorise via Admin portal.");
  let data: TokenData = JSON.parse(raw);
  if (Date.now() >= data.expires_at - 120_000) {
    const r = await fetch("https://api.hubapi.com/oauth/v1/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id:  Netlify.env.get("HUBSPOT_CLIENT_ID")!,
        client_secret: Netlify.env.get("HUBSPOT_CLIENT_SECRET")!,
        refresh_token: data.refresh_token
      }).toString()
    });
    if (!r.ok) throw new Error("HubSpot token refresh failed. Re-authorise in Admin portal.");
    const fresh = await r.json() as { access_token: string; refresh_token: string; expires_in: number };
    data = { access_token: fresh.access_token, refresh_token: fresh.refresh_token, expires_at: Date.now() + (fresh.expires_in - 60) * 1000 };
    await store.set("tokens", JSON.stringify(data));
  }
  return data.access_token;
}

/* ══ HubSpot API ══════════════════════════════════════════════ */
type CrmObject = { id: string; properties?: Record<string, string | null> };
function json(s: number, b: Record<string, unknown>) { return Response.json(b, { status: s }); }

async function hubspot(path: string, token: string, init: RequestInit = {}) {
  const r = await fetch(`https://api.hubapi.com${path}`, {
    ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) }
  });
  const t = await r.text(); const b = t ? JSON.parse(t) : {};
  if (!r.ok) throw new Error(b.message || "HubSpot API failed.");
  return b;
}

async function searchObject(type: "companies" | "contacts", filters: Array<Record<string, string>>, props: string[], token: string) {
  if (!filters.length) return null;
  const r = await hubspot(`/crm/v3/objects/${type}/search`, token, {
    method: "POST", body: JSON.stringify({ filterGroups: filters.map(f => ({ filters: [f] })), properties: props, limit: 1 })
  });
  return (r.results?.[0] || null) as CrmObject | null;
}
async function getObject(type: "companies" | "contacts", id: string, props: string[], token: string) {
  if (!id) return null;
  return await hubspot(`/crm/v3/objects/${type}/${id}?properties=${props.join(",")}`, token) as CrmObject;
}
async function assocIds(type: "companies" | "contacts", id: string, target: "notes" | "tasks", token: string) {
  try {
    const r = await hubspot(`/crm/v4/objects/${type}/${id}/associations/${target}?limit=10`, token);
    return (r.results || []).map((i: { toObjectId?: number; to?: { id?: string } }) => String(i.toObjectId || i.to?.id || "")).filter(Boolean);
  } catch { return []; }
}
async function batchRead(type: "notes" | "tasks", ids: string[], props: string[], token: string) {
  const uids = [...new Set(ids)].slice(0, 8); if (!uids.length) return [];
  const r = await hubspot(`/crm/v3/objects/${type}/batch/read`, token, {
    method: "POST", body: JSON.stringify({ properties: props, inputs: uids.map(id => ({ id })) })
  });
  return (r.results || []) as CrmObject[];
}
function c(v?: string | null) { return (v || "").replace(/\s+/g, " ").trim(); }
function noteSummary(n: CrmObject) { const b = c(n.properties?.hs_note_body); return `${c(n.properties?.hs_timestamp) ? c(n.properties?.hs_timestamp) + ": " : ""}${b.slice(0, 280)}`; }
function taskSummary(t: CrmObject) { return `${c(t.properties?.hs_task_subject) || "Task"} (${c(t.properties?.hs_task_status) || "?"})${c(t.properties?.hs_task_body) ? " - " + c(t.properties?.hs_task_body).slice(0, 220) : ""}`; }
function prompts(company: CrmObject | null, contact: CrmObject | null, notes: string[], tasks: string[]) {
  const o: string[] = [];
  if (company?.properties?.lifecyclestage) o.push(`Lifecycle: "${company.properties.lifecyclestage}" — calibrate outreach type.`);
  if (contact?.properties?.jobtitle)       o.push(`Role: ${contact.properties.jobtitle} — open with role-specific pain.`);
  if (notes.length) o.push("Review notes before sending. Echo known pains.");
  if (tasks.length) o.push("Check open tasks before adding more follow-ups.");
  if (!o.length)    o.push("No CRM context. Treat as net-new account.");
  return o;
}

/* ══ Handler ══════════════════════════════════════════════════ */
export default async (req: Request, context: Context) => {
  if (!await verifyToken(req)) return json(401, { error: "Unauthorised." });

  const url = new URL(req.url);
  const account      = url.searchParams.get("account")?.trim()      || "";
  const contactEmail = url.searchParams.get("contactEmail")?.trim() || "";
  const contactId    = url.searchParams.get("contactId")?.trim()    || "";
  const companyId    = url.searchParams.get("companyId")?.trim()    || "";
  const prospectName = url.searchParams.get("prospectName")?.trim() || "";

  if (!account && !contactEmail && !contactId && !companyId) return json(400, { error: "Provide account or contact identifier." });

  // ── Check 1-hour CRM cache ─────────────────────────────────
  const key    = cacheKey(account || contactId || companyId);
  const cached = await getCached(key);
  if (cached) return Response.json({ ...(cached as object), cached: true });

  let token: string;
  try { token = await getValidToken(); }
  catch (e) { return json(503, { error: e instanceof Error ? e.message : "HubSpot not connected." }); }

  try {
    const cProps = ["name","domain","industry","lifecyclestage","hubspot_owner_id","description","notes_last_contacted"];
    const pProps = ["email","firstname","lastname","jobtitle","lifecyclestage","hubspot_owner_id","associatedcompanyid","notes_last_contacted"];

    const company = companyId
      ? await getObject("companies", companyId, cProps, token)
      : await searchObject("companies", account ? [{ propertyName: "name", operator: "CONTAINS_TOKEN", value: account }] : [], cProps, token);

    const nameParts = prospectName.split(/\s+/).filter(Boolean);
    const contact   = contactId
      ? await getObject("contacts", contactId, pProps, token)
      : await searchObject("contacts", [
          ...(contactEmail ? [{ propertyName: "email",     operator: "EQ",             value: contactEmail }] : []),
          ...(nameParts[0]  ? [{ propertyName: "firstname", operator: "CONTAINS_TOKEN", value: nameParts[0] }] : [])
        ], pProps, token);

    const noteIds = [...(company ? await assocIds("companies", company.id, "notes", token) : []),
                     ...(contact ? await assocIds("contacts",  contact.id, "notes", token) : [])];
    const taskIds = [...(company ? await assocIds("companies", company.id, "tasks", token) : []),
                     ...(contact ? await assocIds("contacts",  contact.id, "tasks", token) : [])];

    const notes = (await batchRead("notes", noteIds, ["hs_note_body","hs_timestamp"], token)).map(noteSummary).filter(Boolean).slice(0, 6);
    const tasks = (await batchRead("tasks", taskIds, ["hs_task_subject","hs_task_status","hs_task_body","hs_timestamp"], token)).map(taskSummary).filter(Boolean).slice(0, 6);

    const result = {
      message: company || contact ? "HubSpot intelligence loaded." : "No matching record found.",
      company: company ? { id: company.id, ...company.properties } : null,
      contact: contact ? { id: contact.id, ...contact.properties } : null,
      notes, tasks, prompts: prompts(company, contact, notes, tasks)
    };

    // Cache for 1 h — CRM data is relatively stable within a session
    await setCache(key, result, 3_600_000);

    return json(200, { ...result, cached: false });
  } catch (e) {
    return json(502, { error: e instanceof Error ? e.message : "HubSpot request failed." });
  }
};

export const config: Config = { path: "/api/hubspot-intelligence" };
