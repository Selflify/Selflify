import { createMcpHandler } from "@/lib/mcp/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handle = createMcpHandler();
export { handle as POST, handle as GET, handle as DELETE };
