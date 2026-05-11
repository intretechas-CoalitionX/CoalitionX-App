import type { Config } from "@netlify/functions";

/* Scopes must match EXACTLY what is configured as Required in the HubSpot Public App */
const SCOPES = [
  "crm.dealsplits.read_write",
  "crm.extensions_calling_transcripts.read",
  "crm.extensions_calling_transcripts.write",
  "crm.import",
  "crm.lists.read",
  "crm.objects.carts.write",
  "crm.objects.commercepayments.read",
  "crm.objects.commercepayments.write",
  "crm.objects.companies.read",
  "crm.objects.companies.write",
  "crm.objects.contacts.read",
  "crm.objects.users.read",
  "crm.schemas.companies.read",
  "crm.schemas.companies.write",
  "crm.schemas.contacts.read",
  "crm.schemas.contacts.write",
  "crm.schemas.deals.read",
  "crm.schemas.deals.write"
].join(" ");

export default async (req: Request) => {
  const clientId = Netlify.env.get("HUBSPOT_CLIENT_ID");
  if (!clientId) {
    return new Response("HUBSPOT_CLIENT_ID not configured.", { status: 503 });
  }

  const redirectUri = "https://coalitionx.uk/api/hubspot-auth-callback";

  const params = new URLSearchParams({
    client_id:    clientId,
    redirect_uri: redirectUri,
    scope:        SCOPES
  });

  const oauthUrl = `https://app.hubspot.com/oauth/authorize?${params.toString()}`;
  return Response.redirect(oauthUrl, 302);
};

export const config: Config = {
  path: "/api/hubspot-auth-start"
};
