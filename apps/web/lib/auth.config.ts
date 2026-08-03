/**
 * Auth.js edge-safe configuration (task 3.1).
 *
 * This file is imported by `middleware.ts`, so it MUST NOT touch Node-only
 * modules (Prisma, bcrypt) — the edge runtime can only decode the session
 * JWT. Providers that need a database (Credentials authorize, Google
 * provisioning) live in `lib/auth.ts`, used only by node route handlers.
 *
 * The Google provider is wired through env vars (AUTH_GOOGLE_ID/SECRET) and
 * is only enabled when both are present — Google credentials are an open
 * question (design.md), so a broken provider must never break the rest of
 * auth. Sessions are JWT-only and carry role + barbershopId, which the
 * session callback exposes to every server component and route handler.
 */
import "next-auth/jwt";
import type { DefaultSession, NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import type { Role } from "@barber/contracts";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      barbershopId: string | null;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: Role;
    barbershopId?: string | null;
  }
}

/** Returns the Google provider only when real credentials exist. */
function googleProvider() {
  const clientId = process.env.AUTH_GOOGLE_ID;
  const clientSecret = process.env.AUTH_GOOGLE_SECRET;
  if (!clientId || !clientSecret) return [];
  return [Google({ clientId, clientSecret })];
}

export const authConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [...googleProvider()],
  callbacks: {
    /** Copies the role/tenant claims from the sign-in user into the JWT. */
    jwt({ token, user }) {
      if (user) {
        const extended = user as { role?: Role; barbershopId?: string | null };
        token.id = user.id;
        token.role = extended.role;
        token.barbershopId = extended.barbershopId;
      }
      return token;
    },
    /** Exposes role + barbershopId on every session. */
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id ?? "";
        session.user.role = token.role ?? "client";
        session.user.barbershopId = token.barbershopId ?? null;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
