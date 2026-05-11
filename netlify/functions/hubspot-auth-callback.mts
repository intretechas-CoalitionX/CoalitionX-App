import { getStore } from "@netlify/blobs";
import type { Config } from "@netlify/functions";

type TokenData = {
  access_token:  string;
  refresh_token: string;
  expires_at:    number;   // ms epoch
};

export default async (req: Request) => {
  const url    = new URL(req.url);
  const code   = url.searchParams.get("code");
  const error  = url.searchParams.get("error");

  if (error) {
    return redirectResult(false, `HubSpot declined: ${error}`);
  }
  if (!code) {
    return redirectResult(false, "No authorisation code returned.");
  }

  const clientId     = Netlify.env.get("HUBSPOT_CLIENT_ID");
  const clientSecret = Netlify.env.get("HUBSPOT_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    return redirectResult(false, "OAuth credentials not configured.");
  }

  // Exchange code for tokens
  const body = new URLSearchParams({
    grant_type:    "authorization_code",
    client_id:     clientId,
    client_secret: clientSecret,
    redirect_uri:  "https://coalitionx.uk/api/hubspot-auth-callback",
    code
  });

  const tokenRes = await fetch("https://api.hubapi.com/oauth/v1/token", {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    body.toString()
  });

  if (!tokenRes.ok) {
    const txt = await tokenRes.text();
    return redirectResult(false, `Token exchange failed: ${txt}`);
  }

  const tokens = await tokenRes.json() as {
    access_token:  string;
    refresh_token: string;
    expires_in:    number;
  };

  const data: TokenData = {
    access_token:  tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at:    Date.now() + (tokens.expires_in - 60) * 1000
  };

  // Persist in Netlify Blobs
  const store = getStore("hubspot");
  await store.set("tokens", JSON.stringify(data));

  return redirectResult(true, "connected");
};

function redirectResult(ok: boolean, msg: string) {
  const hash = ok ? "#hs-connected" : `#hs-error=${encodeURIComponent(msg)}`;
  return Response.redirect(`https://coalitionx.uk/${hash}`, 302);
}

export const config: Config = {
  path: "/api/hubspot-auth-callback"
};
