import type { Config } from "@netlify/functions";

/* ── HMAC-SHA256 token ───────────────────────────────────────
   Token = base64( email + ":" + dayBucket + ":" + hmacHex )
─────────────────────────────────────────────────────────── */
async function makeToken(email: string, secret: string): Promise<string> {
  const day     = Math.floor(Date.now() / 86_400_000).toString();
  const payload = `${email}:${day}`;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig  = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const hmac = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
  return btoa(`${payload}:${hmac}`);
}

/* Constant-time string comparison */
function safeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

type UserRecord = { email: string; name: string; workspace: string };

/* ── User store ──────────────────────────────────────────────
   APP_USERS_JSON = JSON array of { email, password, name, workspace }
   Falls back to legacy APP_USER_EMAIL / APP_USER_PASSWORD for
   backward-compat during migration.
─────────────────────────────────────────────────────────── */
function loadUsers(): Array<{ email: string; password: string; name: string; workspace: string }> {
  const raw = Netlify.env.get("APP_USERS_JSON");
  if (raw) {
    try { return JSON.parse(raw); } catch { /* fall through */ }
  }
  /* Legacy single-user fallback */
  const email    = Netlify.env.get("APP_USER_EMAIL") || "";
  const password = Netlify.env.get("APP_USER_PASSWORD") || "";
  const name     = Netlify.env.get("APP_USER_NAME") || "User";
  if (email && password) return [{ email: email.toLowerCase(), password, name, workspace: "intretech" }];
  return [];
}

export default async (req: Request) => {
  if (req.method !== "POST")
    return Response.json({ error: "Use POST." }, { status: 405 });

  let body: { email?: string; password?: string; workspace?: string };
  try { body = await req.json(); }
  catch { return Response.json({ error: "Invalid JSON." }, { status: 400 }); }

  const secret = Netlify.env.get("APP_SECRET");
  if (!secret) return Response.json({ error: "Auth not configured." }, { status: 503 });

  const users = loadUsers();
  if (!users.length) return Response.json({ error: "Auth not configured." }, { status: 503 });

  const email     = (body.email    || "").toLowerCase().trim();
  const password  = (body.password || "").trim();
  const workspace = (body.workspace || "intretech").toLowerCase().trim();

  /* Find matching user — workspace must match too */
  const user = users.find(u =>
    safeEq(u.email.toLowerCase(), email) &&
    safeEq(u.password, password) &&
    u.workspace === workspace
  );

  if (!user) {
    await new Promise(r => setTimeout(r, 400)); // slow brute-force
    return Response.json({ error: "Invalid credentials." }, { status: 401 });
  }

  const token = await makeToken(email, secret);
  return Response.json(
    { token, name: user.name, email: user.email, workspace: user.workspace },
    { headers: { "Cache-Control": "no-store", "Content-Type": "application/json" } }
  );
};

export const config: Config = { path: "/api/auth-login" };
