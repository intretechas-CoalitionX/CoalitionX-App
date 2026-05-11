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
    const email = parts[0]; const day = parts[1]; const hmac = parts.slice(2).join(":");
    const today = Math.floor(Date.now() / 86_400_000);
    if (day !== today.toString() && day !== (today - 1).toString()) return false;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${email}:${day}`));
    const expected = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
    return hmac === expected;
  } catch { return false; }
}

/* ══ Cache helpers — 4 h TTL for news ════════════════════════ */
function cacheKey(account: string, vertical: string, keywords: string) {
  const str = `${account}|${vertical}|${keywords}`.toLowerCase();
  let h = 0;
  for (const c of str) { h = Math.imul(31, h) + c.charCodeAt(0) | 0; }
  return `news:${Math.abs(h).toString(36)}`;
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

/* ══ RSS parsing ══════════════════════════════════════════════ */
type NewsItem = { title: string; link: string; pubDate: string; source: string; angle: string };

function textBetween(v: string, s: string, e: string) {
  const i = v.indexOf(s); if (i < 0) return "";
  const j = v.indexOf(e, i + s.length); if (j < 0) return "";
  return v.slice(i + s.length, j);
}
function decode(v: string) {
  return v.replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
function stripRedirect(link: string) {
  try { const u = new URL(link); return u.searchParams.get("url") || link; } catch { return link; }
}
function buildAngle(title: string, account: string, vertical: string) {
  const l = title.toLowerCase();
  if (l.includes("launch") || l.includes("new"))      return `Use as product-roadmap opener: ask if ${account} is reviewing validation or NPI options for the next ${vertical} launch.`;
  if (l.includes("supplier") || l.includes("factory")) return `Use as supply-chain opener: connect to localisation, qualification and Intretech's FATP footprint.`;
  if (l.includes("market") || l.includes("growth"))   return `Use as industry-value opener: link ${vertical} growth to quality, capacity and speed-to-market pressure.`;
  return `Warm relevant reason to reach out — tie back to Intretech capabilities for ${vertical}.`;
}
function parseRss(xml: string, account: string, vertical: string): NewsItem[] {
  return xml.split("<item>").slice(1, 13).map(item => ({
    title:   decode(textBetween(item, "<title>", "</title>")).trim(),
    link:    stripRedirect(decode(textBetween(item, "<link>", "</link>")).trim()),
    pubDate: decode(textBetween(item, "<pubDate>", "</pubDate>")).trim(),
    source:  decode(textBetween(item, "<source", "</source>").replace(/^.*?>/, "")).trim(),
    angle:   buildAngle(decode(textBetween(item, "<title>", "</title>")).trim(), account, vertical)
  })).filter(i => i.title && i.link);
}

/* ══ Handler ══════════════════════════════════════════════════ */
export default async (req: Request) => {
  if (!await verifyToken(req)) return Response.json({ error: "Unauthorised." }, { status: 401 });

  const url      = new URL(req.url);
  const account  = (url.searchParams.get("account")  || "").trim().slice(0, 100);
  const vertical = (url.searchParams.get("vertical") || "manufacturing").trim().slice(0, 80);
  const keywords = (url.searchParams.get("keywords") || "").trim().slice(0, 200);

  if (!account) return Response.json({ error: "Account name is required." }, { status: 400 });

  // ── Check 4-hour cache ─────────────────────────────────────
  const key    = cacheKey(account, vertical, keywords);
  const cached = await getCached(key);
  if (cached) return Response.json({ ...(cached as object), cached: true });

  // ── Fetch Google News RSS ──────────────────────────────────
  const query  = `${account} ${vertical} ${keywords} when:30d`;
  const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-GB&gl=GB&ceid=GB:en`;

  const res = await fetch(rssUrl, { headers: { "User-Agent": "Intretech SDR GTM Workbench/2.0" } });
  if (!res.ok) return Response.json({ error: "Unable to fetch news." }, { status: 502 });

  const xml   = await res.text();
  const items = parseRss(xml, account, vertical);
  const data  = { account, vertical, items };

  // Cache for 4 h — news doesn't change minute-to-minute
  await setCache(key, data, 4 * 3_600_000);

  return Response.json({ ...data, cached: false });
};

export const config: Config = { path: "/api/account-news" };
