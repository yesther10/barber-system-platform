/**
 * Google OAuth account provisioning (user-auth spec, task 3.1).
 *
 * A new Google sign-in auto-provisions a `client` account with an explicit
 * consent record (timestamp + current policy version) so the session can
 * start immediately. Returning users keep their existing role — Google
 * sign-in must never silently change a barber/admin role. The consent record
 * satisfies the LGPD capture requirement for the OAuth path.
 */
import { CURRENT_CONSENT_POLICY_VERSION } from "./consent";
import { toSessionUser } from "./session-user";
import type { SessionUser } from "@barber/contracts";

/** Minimal user store surface needed by provisioning (prisma-compatible). */
export interface OAuthUserStore {
  user: {
    findUnique(args: { where: { email: string } }): Promise<{
      id: string;
      email: string;
      name: string | null;
      role: "CLIENT" | "BARBER" | "BARBERSHOP_ADMIN";
      barbershopId: string | null;
    } | null>;
    create(args: {
      data: {
        email: string;
        name: string;
        role: "CLIENT";
        consentAcceptedAt: Date;
        consentPolicyVersion: string;
      };
    }): Promise<{
      id: string;
      email: string;
      name: string | null;
      role: "CLIENT" | "BARBER" | "BARBERSHOP_ADMIN";
      barbershopId: string | null;
    }>;
  };
}

/**
 * Returns the session user for a Google profile, creating a `client` account
 * with a consent record on first sign-in. Concurrent first sign-ins for the
 * same email resolve to the winner of the unique email race.
 */
export async function provisionOAuthUser(
  db: OAuthUserStore,
  profile: { email: string; name?: string | null },
  now: Date = new Date(),
): Promise<SessionUser> {
  const existing = await db.user.findUnique({ where: { email: profile.email } });
  if (existing) return toSessionUser(existing);

  try {
    const created = await db.user.create({
      data: {
        email: profile.email,
        name: profile.name ?? profile.email,
        role: "CLIENT",
        consentAcceptedAt: now,
        consentPolicyVersion: CURRENT_CONSENT_POLICY_VERSION,
      },
    });
    return toSessionUser(created);
  } catch {
    // Unique email race — the other sign-in won; return their account.
    const winner = await db.user.findUnique({ where: { email: profile.email } });
    if (winner) return toSessionUser(winner);
    throw new Error("Failed to provision OAuth user");
  }
}
