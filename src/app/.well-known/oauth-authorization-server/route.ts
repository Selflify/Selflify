import { readSelflifyConfig } from "@/lib/config/service";
import { mcpAuthorizationMetadata } from "@/lib/mcp/oauth-urls";
import { oauthHeaders } from "@/lib/mcp/oauth-http";

export const dynamic = "force-dynamic";
export async function GET() {
  return Response.json(mcpAuthorizationMetadata(await readSelflifyConfig()), {
    headers: oauthHeaders,
  });
}
