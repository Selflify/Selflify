import { NextRequest, NextResponse } from "next/server";

import { readOptionalSession } from "@/lib/auth/session";
import { readSelflifyConfig } from "@/lib/config/service";
import { listPreviewDeployPage, DEFAULT_DEPLOY_PAGE_SIZE } from "@/lib/sites/service";

function parseNumber(value: string | null, fallback: number): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return parsed;
}

function readSiteSlug(params: unknown): string | null {
  if (typeof params !== "object" || params === null || !("site" in params)) {
    return null;
  }

  const slug = (params as { site?: unknown }).site;
  return typeof slug === "string" ? slug : null;
}

export async function GET(
  request: NextRequest,
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

  const url = new URL(request.url);
  const page = await listPreviewDeployPage(config, site, {
    query: url.searchParams.get("q") ?? "",
    offset: parseNumber(url.searchParams.get("offset"), 0),
    limit: parseNumber(url.searchParams.get("limit"), DEFAULT_DEPLOY_PAGE_SIZE),
  });

  return NextResponse.json(page, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
