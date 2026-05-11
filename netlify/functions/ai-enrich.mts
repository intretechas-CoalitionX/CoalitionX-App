import Anthropic from "@anthropic-ai/sdk";
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
    const decoded = atob(token);
    const parts   = decoded.split(":");
    if (parts.length < 3) return false;
    const email    = parts[0];
    const dayBucket = parts[1];
    const givenHmac = parts.slice(2).join(":");
    const today    = Math.floor(Date.now() / 86_400_000);
    if (dayBucket !== today.toString() && dayBucket !== (today - 1).toString()) return false;
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const sig     = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${email}:${dayBucket}`));
    const expected = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
    return givenHmac === expected;
  } catch { return false; }
}

/* ══ Rate limiter — max 20 AI calls/hour per IP ═══════════════ */
async function checkRate(ip: string): Promise<boolean> {
  try {
    const store  = getStore("rate-limits");
    const key    = `ai:${ip}:${Math.floor(Date.now() / 3_600_000)}`;
    const raw    = await store.get(key);
    const count  = raw ? parseInt(raw) + 1 : 1;
    if (count > 20) return false;
    await store.set(key, count.toString(), { ttl: 3700 });
    return true;
  } catch { return true; } // fail-open so a Blobs hiccup never blocks users
}

/* ══ Cache helpers — 24 h TTL ═════════════════════════════════ */
function cacheKey(input: Record<string, string>) {
  const str = [input.accountName, input.vertical, input.role, input.signal]
    .map(s => (s || "").toLowerCase().trim()).join("|");
  let h = 0;
  for (const c of str) { h = Math.imul(31, h) + c.charCodeAt(0) | 0; }
  return `enrich:${Math.abs(h).toString(36)}`;
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
  try {
    const store = getStore("api-cache");
    await store.set(key, JSON.stringify({ data, expires_at: Date.now() + ttlMs }));
  } catch { /* non-fatal */ }
}

/* ══ Input sanitiser — guards against prompt injection ════════ */
function clean(str: unknown, max = 200): string {
  return String(str || "")
    .replace(/[<>]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/ignore\s+(all|previous|above|prior|instructions)/gi, "")
    .replace(/\b(you are now|act as|system:|assistant:|human:)\b/gi, "")
    .trim()
    .slice(0, max);
}

/* ══ Anthropic system prompt ══════════════════════════════════ */
const SYSTEM = `You are a senior B2B intelligence analyst for Intretech — a global end-to-end electronics manufacturer and engineering partner. Capabilities: R&D engineering (EE/ME/FW/SW), SMT/PCBA, injection moulding, tooling, validation (EVT/DVT/PVT), FATP in China/Malaysia/Mexico/Hungary, smart manufacturing (UMS, OEE), automation (500+ engineers), OEM/ODM/JDM. Every insight must be specific to the named company, not generic.`;

type EnrichRequest = {
  accountName?: string; vertical?: string; role?: string;
  signal?: string; prospect?: string; notes?: string; linkedin?: string;
};

/* ══ Handler ══════════════════════════════════════════════════ */
export default async (req: Request) => {
  if (req.method !== "POST") return Response.json({ error: "Use POST." }, { status: 405 });

  if (!await verifyToken(req)) return Response.json({ error: "Unauthorised." }, { status: 401 });

  const ip = req.headers.get("x-nf-client-connection-ip") ||
             req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  if (!await checkRate(ip)) return Response.json({ error: "Rate limit exceeded. Try again in an hour." }, { status: 429 });

  const apiKey = Netlify.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return Response.json({ error: "AI enrichment not configured." }, { status: 503 });

  let body: EnrichRequest;
  try { body = await req.json(); }
  catch { return Response.json({ error: "Invalid JSON body." }, { status: 400 }); }

  // Sanitise all inputs
  const account  = clean(body.accountName, 100);
  const vertical = clean(body.vertical,    80);
  const role     = clean(body.role,        80);
  const signal   = clean(body.signal,      100);
  const prospect = clean(body.prospect,    80);
  const notes    = clean(body.notes,       300);

  if (!account) return Response.json({ error: "accountName is required." }, { status: 400 });

  // ── Check cache first ──────────────────────────────────────
  const key    = cacheKey({ accountName: account, vertical, role, signal });
  const cached = await getCached(key);
  if (cached) return Response.json({ enriched: cached, account, cached: true });

  // ── Build minimal prompt (fewer tokens = lower cost) ───────
  const prompt = `Account: ${account} | Vertical: ${vertical} | Role: ${role} | Signal: ${signal} | Prospect: ${prospect} | Notes: ${notes}

Return ONLY valid JSON:
{"companySnapshot":"2-3 sentence overview","productMatchInsight":"specific Intretech capability match","strategyPriority":"single most important angle","openingHook":"one compelling cold-open line","newsAngle":"search terms and topics to monitor (comma-separated keywords)","hubspotNotes":"what to log in CRM","discoveryQuestions":["q1","q2","q3","q4"],"riskFlags":["r1","r2","r3"]}`;

  try {
    const client  = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model:      "claude-3-5-haiku-20241022",
      max_tokens: 900,       // tight cap — reduces cost ~30 %
      system:     SYSTEM,
      messages:   [{ role: "user", content: prompt }]
    });

    const raw     = message.content[0].type === "text" ? message.content[0].text.trim() : "{}";
    const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    const enriched = JSON.parse(cleaned);

    // Cache for 24 h — same account+vertical+role+signal combo won't hit Claude again today
    await setCache(key, enriched, 86_400_000);

    return Response.json({ enriched, account, cached: false });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "AI enrichment failed." }, { status: 502 });
  }
};

export const config: Config = { path: "/api/ai-enrich" };
