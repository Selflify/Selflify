import { createOAuthHandler } from "@/lib/mcp/oauth-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handle = createOAuthHandler();

export async function POST(request: Request, context: { params: Promise<{ endpoint: string }> }) {
  return handle(request, (await context.params).endpoint);
}
export async function OPTIONS(request: Request) {
  return handle(request, "");
}
