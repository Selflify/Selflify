import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user?: NonNullable<DefaultSession["user"]> & {
      adminConfiguredAt?: string | null;
    };
  }

  interface User {
    adminConfiguredAt?: string | null;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    adminConfiguredAt?: string | null;
  }
}
