/**
 * Credentials sign-in core (user-auth spec, task 3.6).
 *
 * Extracted from the Auth.js `authorize` callback so the email/password
 * verification path is unit-testable without instantiating NextAuth. Returns
 * the session user (role + tenant) on success, null on any failure — unknown
 * email, wrong password, or an account without a password hash (Google-only).
 */
import { LoginInput, type SessionUser } from "@barber/contracts";
import { verifyPassword } from "./password";
import { toSessionUser } from "./session-user";

export interface CredentialsUserStore {
  user: {
    findUnique(args: { where: { email: string } }): Promise<{
      id: string;
      email: string;
      name: string | null;
      role: "CLIENT" | "BARBER" | "BARBERSHOP_ADMIN";
      barbershopId: string | null;
      passwordHash: string | null;
    } | null>;
  };
}

/** Verifies email/password and returns the session user, or null. */
export async function authenticateCredentials(
  db: CredentialsUserStore,
  input: unknown,
): Promise<SessionUser | null> {
  const parsed = LoginInput.safeParse(input);
  if (!parsed.success) return null;

  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  if (!user?.passwordHash) return null;

  const valid = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!valid) return null;

  return toSessionUser(user);
}
