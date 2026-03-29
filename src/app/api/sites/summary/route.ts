import { NextResponse } from "next/server";

import { readOptionalSession } from "@/lib/auth/session";
import { readSelflifyConfig } from "@/lib/config/service";
import { getAllSiteSummaries, getDiskUsage } from "@/lib/sites/service";

export async function GET() {
  const session = await readOptionalSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const config = await readSelflifyConfig();
  const [sites, diskUsage] = await Promise.all([getAllSiteSummaries(config), getDiskUsage(config)]);
  const totalDeploys = sites.reduce((count, site) => count + site.deployCount, 0);

  return NextResponse.json(
    {
      siteCount: config.sites.length,
      totalDeploys,
      totalBytes: diskUsage.totalBytes,
      usedBytes: diskUsage.usedBytes,
      availableBytes: diskUsage.availableBytes,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
