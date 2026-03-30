import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

import {
  assertLoginAllowed,
  clearLoginRateLimit,
  LoginRateLimitError,
  recordFailedLoginAttempt,
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

        try {
          assertLoginAllowed(parsed.data.login, fingerprint);
        } catch (error) {
          if (error instanceof LoginRateLimitError) {
            return null;
          }

          throw error;
        }

        const config = readSelflifyConfigSync();

        if (!config.admin.login || !config.admin.passwordHash) {
          recordFailedLoginAttempt(parsed.data.login, fingerprint);
          return null;
        }

        if (parsed.data.login !== config.admin.login) {
          recordFailedLoginAttempt(parsed.data.login, fingerprint);
          return null;
        }

        const valid = await verifyAdminPassword(parsed.data.password, config.admin.passwordHash);

        if (!valid) {
          recordFailedLoginAttempt(parsed.data.login, fingerprint);
          return null;
        }

        clearLoginRateLimit(parsed.data.login, fingerprint);

        return {
          id: "selflify-admin",
          name: config.admin.login,
          email: null,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.name) {
        token.name = user.name;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.name = token.name;
      }

      return session;
    },
  },
});
