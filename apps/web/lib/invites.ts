/**
 * Barber invitations (user-auth spec, task 3.4).
 *
 * A barbershop_admin creates an invite for an email; the returned token is a
 * signed, expiring HMAC payload over `{ inviteId, email }`. The invite row
 * stores a HASH of the token (never the token itself), so a leaked database
 * cannot be used to forge or replay invites.
 *
 * Single-use is enforced by the `consumedAt` marker on the Invite row:
 * acceptance runs in a transaction that re-checks the marker, then creates
 * the tenant-scoped `barber` user + profile and consumes the invite in one
 * atomic step. Presenting an already-consumed token is rejected, so the
 * spec scenario "Reused invite token" always fails.
 */
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { InviteAcceptInput } from "@barber/contracts";
import type { PrismaClient } from "@barber/db";
import { hashPassword } from "./password";
import { mapRoleToContract } from "./session-user";
import type { Role } from "@barber/contracts";

/** Invites are valid for 7 days. */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const SEP = ".";

/** Thrown when a token is malformed, expired, unknown, or already used. */
export class InviteTokenError extends Error {
  readonly code = "INVALID_INVITE_TOKEN" as const;
}

/** Thrown when an invite token was already consumed. */
export class InviteAlreadyUsedError extends Error {
  readonly code = "INVITE_ALREADY_USED" as const;

  constructor(message = "Invite token was already used") {
    super(message);
    this.name = "InviteAlreadyUsedError";
  }
}

/** Thrown when an invite acceptance is missing LGPD consent. */
export class InviteConsentRequiredError extends Error {
  readonly code = "CONSENT_REQUIRED" as const;
}

/** HMAC-SHA256 signature of the token body. */
function signature(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

/** SHA-256 digest of the token, stored on the Invite row (single-use ledger). */
export function hashToken(token: string): string {
  return createHmac("sha256", "invite-ledger").update(token).digest("hex");
}

/** Signs a single-use invite token for an invite row. */
export function signInviteToken(
  inviteId: string,
  email: string,
  secret: string,
  expiresInMs: number = INVITE_TTL_MS,
  now: number = Date.now(),
): string {
  const payload = JSON.stringify({ sub: inviteId, email, iat: now, exp: now + expiresInMs });
  const body = Buffer.from(payload).toString("base64url");
  return `${body}${SEP}${signature(body, secret)}`;
}

export interface VerifiedInvite {
  inviteId: string;
  email: string;
}

/** Verifies signature and expiry, returning the embedded invite id + email. */
export function verifyInviteToken(token: string, secret: string, now: number = Date.now()): VerifiedInvite {
  const pieces = token.split(SEP);
  if (pieces.length !== 2 || !pieces[0] || !pieces[1]) {
    throw new InviteTokenError("Malformed invite token");
  }
  const [body, sig] = pieces as [string, string];
  const expected = Buffer.from(signature(body, secret));
  const actual = Buffer.from(sig);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new InviteTokenError("Invalid invite token signature");
  }

  let payload: { sub?: unknown; email?: unknown; exp?: unknown };
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as typeof payload;
  } catch {
    throw new InviteTokenError("Malformed invite token");
  }
  if (typeof payload.exp !== "number" || payload.exp <= now) {
    throw new InviteTokenError("Invite token expired");
  }
  if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
    throw new InviteTokenError("Invalid invite token payload");
  }
  return { inviteId: payload.sub, email: payload.email };
}

/**
 * Creates an invite row and returns the signed single-use token. The token
 * is only delivered to the admin (email sending is worker territory, WU7).
 */
export async function createInvite(
  db: PrismaClient,
  input: { email: string; barbershopId: string; secret: string },
): Promise<string> {
  const inviteId = randomUUID();
  const token = signInviteToken(inviteId, input.email, input.secret);
  await db.invite.create({
    data: {
      id: inviteId,
      barbershopId: input.barbershopId,
      email: input.email,
      tokenHash: hashToken(token),
    },
  });
  return token;
}

export interface InviteAcceptResult {
  id: string;
  email: string;
  role: Role;
  barbershopId: string;
}

/**
 * Parses and validates the invite acceptance payload. Consent must be
 * literally `true` (contract) — a missing/false consent surfaces as a
 * precise `InviteConsentRequiredError`; other contract failures are
 * `InviteTokenError` (the acceptance is not a valid invite payload).
 */
export function parseInviteAcceptance(input: unknown) {
  const parsed = InviteAcceptInput.safeParse(input);
  if (!parsed.success) {
    const consentMissing = parsed.error.issues.some((issue) => issue.path[0] === "consent");
    if (consentMissing) throw new InviteConsentRequiredError();
    throw new InviteTokenError("Invalid invite acceptance payload");
  }
  return parsed.data;
}

/**
 * Accepts an invite: verifies the token, re-checks single-use inside the
 * transaction, creates the tenant-scoped `barber` user + profile, and
 * consumes the invite — atomically. A reused token is rejected.
 */
export async function acceptInvite(
  db: PrismaClient,
  input: unknown,
  secret: string,
  now: Date = new Date(),
): Promise<InviteAcceptResult> {
  const payload = parseInviteAcceptance(input);
  const verified = verifyInviteToken(payload.token, secret);
  const tokenHash = hashToken(payload.token);

  const passwordHash = await hashPassword(payload.password);
  return db.$transaction(async (tx) => {
    const invite = await tx.invite.findUnique({ where: { tokenHash } });
    if (!invite) throw new InviteTokenError("Unknown invite token");
    if (invite.consumedAt) throw new InviteAlreadyUsedError();
    if (invite.email !== verified.email || invite.id !== verified.inviteId) {
      throw new InviteTokenError("Invite token does not match the invite row");
    }

    const user = await tx.user.create({
      data: {
        email: invite.email,
        passwordHash,
        name: payload.name,
        phone: payload.phone,
        role: "BARBER",
        barbershopId: invite.barbershopId,
        consentAcceptedAt: now,
        consentPolicyVersion: payload.consentPolicyVersion,
      },
    });
    await tx.barber.create({
      data: { barbershopId: invite.barbershopId, userId: user.id, specialties: [] },
    });
    await tx.invite.update({ where: { id: invite.id }, data: { consumedAt: now } });

    return {
      id: user.id,
      email: user.email,
      role: mapRoleToContract(user.role),
      barbershopId: invite.barbershopId,
    };
  });
}
