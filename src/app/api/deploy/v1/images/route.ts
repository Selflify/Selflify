import { z } from "zod";

import { readSelflifyConfig } from "@/lib/config/service";
import { siteSlugPattern } from "@/lib/config/schema";
import { ContainerError } from "@/lib/containers/runner-contract";
import { imageReferenceSchema } from "@/lib/containers/schema";
import { authorizeContainerDeploy, publishContainer } from "@/lib/containers/service";
import { ConfigConflictError } from "@/lib/operations";
import { getStableUrl } from "@/lib/sites/service";

const requestSchema = z
  .object({ site: z.string().regex(siteSlugPattern), image: imageReferenceSchema })
  .strict();

function respond(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  try {
    const reader = request.body?.getReader();
    if (!reader) return respond({ error: "Supply an image and site." }, 400);
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 4096) {
        await reader.cancel();
        return respond({ error: "Request is too large." }, 413);
      }
      chunks.push(value);
    }
    const { site, image } = requestSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    const authorization = request.headers.get("authorization");
    authorizeContainerDeploy(await readSelflifyConfig(), site, authorization);
    const release = await publishContainer(site, { image }, { authorization });
    const config = await readSelflifyConfig();
    const publishedSite = config.sites.find((entry) => entry.slug === site);
    if (!publishedSite) return respond({ error: "Site no longer exists." }, 404);
    return respond({ release, url: getStableUrl(config, publishedSite) });
  } catch (error) {
    if (error instanceof ContainerError) return respond({ error: error.message }, error.status);
    if (error instanceof ConfigConflictError) return respond({ error: error.message }, 409);
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return respond({ error: "Supply a site and an image pinned by digest." }, 400);
    }
    return respond(
      { error: "Could not publish the container. Check the panel operation status." },
      500,
    );
  }
}
