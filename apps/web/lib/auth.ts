/**
 * Auth.js v5 full configuration (task 3.1) — node runtime only.
 *
 * Extends the edge-safe `authConfig` with the Credentials provider (bcrypt
 * password check against the DB) and the Google sign-in hook that
 * auto-provisions new Google users as `client` with a consent record. The
 * `jwt` callback picks up `role` + `barbershopId` from the user object
 * produced here, so every session carries the tenant scoping data.
 */
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { type Role } from "@barber/contracts";
import type { User } from "next-auth";
import { authConfig } from "./auth.config";
import { getPrisma } from "./db";
import { authenticateCredentials } from "./credentials";
import { provisionOAuthUser } from "./oauth";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    ...authConfig.providers,
    Credentials({
      async authorize(credentials) {
        return (await authenticateCredentials(getPrisma(), credentials)) as unknown as User;
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account }) {
      if (account?.provider === "google") {
        const provisioned = await provisionOAuthUser(getPrisma(), {
          email: user.email ?? "",
          name: user.name,
        });
        const extended = user as { role?: Role; barbershopId?: string | null };
        extended.role = provisioned.role;
        extended.barbershopId = provisioned.barbershopId;
      }
      return true;
    },
  },
});
