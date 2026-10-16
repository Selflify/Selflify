import { readSelflifyConfig } from "@/lib/config/service";
import { mcpProtectedMetadata } from "@/lib/mcp/oauth-urls";
import { oauthHeaders } from "@/lib/mcp/oauth-http";

export const dynamic = "force-dynamic";
export async function GET() {
  return Response.json(mcpProtectedMetadata(await readSelflifyConfig()), { headers: oauthHeaders });
}
