import { NextResponse } from "next/server";

import { readOptionalSession } from "@/lib/auth/session";
import { readSelflifyConfig } from "@/lib/config/service";
import { listRecentDeploys } from "@/lib/sites/service";

export async function GET() {
  const session = await readOptionalSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const config = await readSelflifyConfig();
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
