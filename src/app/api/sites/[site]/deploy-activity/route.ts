import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/guards";
import { getDeploymentSiteId } from "@/lib/deploy/permissions";

export async function GET(_request: Request, context: { params: Promise<{ site: string }> }) {
  const { config } = await requireAdminSession();
  const { site: slug } = await context.params;
  const site = config.sites.find((entry) => entry.slug === slug);
  if (!site) return NextResponse.json({ error: "Site not found." }, { status: 404 });
  const root = process.env.SELFLIFY_UPLOAD_STATE ?? "/upload-state";
  const tokenIds = config.deployTokens
    .filter((token) => token.siteId === getDeploymentSiteId(site))
    .map((token) => token.id);
  const usage = Object.fromEntries(
    await Promise.all(
      tokenIds.map(async (id) => {
        const value = await fs
          .readFile(path.join(root, `usage-${id}.json`), "utf8")
          .then((raw) => JSON.parse(raw) as { lastUsedAt: string })
          .catch(() => null);
        return [id, value?.lastUsedAt ?? null];
      }),
    ),
  );
  const filenames = await fs.readdir(root).catch(() => [] as string[]);
  const records = await Promise.all(
    filenames
      .filter((name) => /^[a-f0-9-]{36}\.json$/.test(name))
      .map(async (name) => {
        return fs
          .readFile(path.join(root, name), "utf8")
          .then(
            (raw) =>
              JSON.parse(raw) as {
                siteId: string;
                deploy: string;
                state: string;
                createdAt: string;
                publishedAt?: string;
                tokenId: string;
              },
          )
          .catch(() => null);
      }),
  );
  const events = records
    .filter((record) => record?.siteId === getDeploymentSiteId(site))
    .map((record) => ({
      deploy: record!.deploy,
      state: record!.state,
      at: record!.publishedAt ?? record!.createdAt,
    }))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 20);
  return NextResponse.json({ usage, events }, { headers: { "Cache-Control": "no-store" } });
}
