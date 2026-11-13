import { requireAdminSession } from "@/lib/auth/guards";
import { containerRunner } from "@/lib/containers/client";

export async function GET(_request: Request, { params }: { params: Promise<{ site: string }> }) {
  const { config } = await requireAdminSession();
  const { site } = await params;
  const release = config.sites.find((entry) => entry.slug === site)?.container?.active;
  const headers = {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (!release) return new Response("Container release not found.", { status: 404, headers });
  try {
    const { logs } = await containerRunner.logs(release.id);
    return new Response(logs || "No logs yet.", { headers });
  } catch {
    return new Response("Could not read container logs.", { status: 502, headers });
  }
}
