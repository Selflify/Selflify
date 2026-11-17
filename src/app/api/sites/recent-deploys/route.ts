import { NextResponse } from "next/server";

import { isActiveAdminSession } from "@/lib/auth/guards";
import { readOptionalSession } from "@/lib/auth/session";
import { readSelflifyConfig } from "@/lib/config/service";
import { listRecentDeploys } from "@/lib/sites/service";

export async function GET() {
  const session = await readOptionalSession();
  const config = await readSelflifyConfig();

  if (!isActiveAdminSession(session, config)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const items = await listRecentDeploys(config, 5);

  return NextResponse.json(
    { items },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
