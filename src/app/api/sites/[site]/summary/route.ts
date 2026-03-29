import { NextRequest, NextResponse } from "next/server";

import { readOptionalSession } from "@/lib/auth/session";
import { readSelflifyConfig } from "@/lib/config/service";
import { getSiteSummary } from "@/lib/sites/service";

function readSiteSlug(params: unknown): string | null {
  if (typeof params !== "object" || params === null || !("site" in params)) {
    return null;
  }

  const slug = (params as { site?: unknown }).site;
  return typeof slug === "string" ? slug : null;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<unknown> },
) {
  const session = await readOptionalSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const config = await readSelflifyConfig();
  const slug = readSiteSlug(await context.params);

  if (!slug) {
    return NextResponse.json({ error: "Site not found." }, { status: 404 });
  }

  const site = config.sites.find((entry) => entry.slug === slug);

  if (!site) {
    return NextResponse.json({ error: "Site not found." }, { status: 404 });
  }

  const summary = await getSiteSummary(config, site);

  return NextResponse.json(
    {
      deployCount: summary.deployCount,
      totalSizeLabel: summary.totalSizeLabel,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
