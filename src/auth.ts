import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

import {
  assertLoginClientAllowed,
  reserveLoginAttempt,
  LoginRateLimitError,
  recordUnknownLoginAttempt,
  resolveLoginAttemptFingerprint,
} from "@/lib/auth/login-rate-limit";
import { readSelflifyConfigSync } from "@/lib/config/service";
import { verifyAdminPassword } from "@/lib/auth/passwords";

const credentialsSchema = z.object({
  login: z.string().trim().min(1),
  password: z.string().min(1),
});

function readAuthSecret(): string {
  if (process.env.AUTH_SECRET) {
    return process.env.AUTH_SECRET;
  }

  return readSelflifyConfigSync().sessionSecret;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  secret: readAuthSecret(),
  providers: [
    Credentials({
      credentials: {
        login: { label: "Login", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const parsed = credentialsSchema.safeParse(credentials);

        if (!parsed.success) {
          return null;
        }

        const fingerprint = resolveLoginAttemptFingerprint(request);

        let attempt: ReturnType<typeof reserveLoginAttempt>;
        let config: ReturnType<typeof readSelflifyConfigSync>;
        try {
          assertLoginClientAllowed(fingerprint);
          config = readSelflifyConfigSync();
          if (parsed.data.login !== config.admin.login || !config.admin.passwordHash) {
            recordUnknownLoginAttempt(fingerprint);
            return null;
          }
          attempt = reserveLoginAttempt(config.admin.login, fingerprint);
        } catch (error) {
          if (error instanceof LoginRateLimitError) {
            return null;
          }

          throw error;
        }

        try {
          const valid = await verifyAdminPassword(parsed.data.password, config.admin.passwordHash);

          if (!valid) {
            attempt.fail();
            return null;
          }

          attempt.succeed();

          return {
            id: "selflify-admin",
            name: config.admin.login,
            email: null,
            adminConfiguredAt: config.admin.configuredAt,
          };
        } finally {
          attempt.release();
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.name) {
        token.name = user.name;
      }

      if (user && "adminConfiguredAt" in user) {
        token.adminConfiguredAt = user.adminConfiguredAt ?? null;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.name = token.name;
        session.user.adminConfiguredAt =
          typeof token.adminConfiguredAt === "string" ? token.adminConfiguredAt : null;
      }

      return session;
    },
  },
});
