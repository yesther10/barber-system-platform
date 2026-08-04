import { z } from "zod";

/** Platform roles. Every user belongs to exactly one role, scoped to one tenant. */
export const Role = z.enum(["client", "barber", "barbershop_admin"]);

export type Role = z.infer<typeof Role>;

/**
 * Registration payload. LGPD consent MUST be explicitly given — the schema
 * only accepts the literal `true`, so a signup with consent unchecked fails
 * validation before any account is created (user-auth spec).
 */
export const RegisterInput = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  phone: z.string().min(8).optional(),
  consent: z.literal(true),
  consentPolicyVersion: z.string().min(1),
});

export type RegisterInput = z.infer<typeof RegisterInput>;

/** Result of a successful registration — always a `client` until invited. */
export const RegisterResult = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  role: z.literal("client"),
});

export type RegisterResult = z.infer<typeof RegisterResult>;

export const LoginInput = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginInput = z.infer<typeof LoginInput>;

/** Session payload attached by Auth.js — carries role and tenant for scoping. */
export const SessionUser = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  name: z.string().min(1).nullable(),
  role: Role,
  barbershopId: z.string().min(1).nullable(),
});

export type SessionUser = z.infer<typeof SessionUser>;

/** Admin invites a barber by email; the tenant comes from the session. */
export const InviteInput = z.object({
  email: z.string().email(),
});

export type InviteInput = z.infer<typeof InviteInput>;

/** Single-use signed invite token (issued per email, consumed once). */
export const InviteToken = z.string().min(20);

export type InviteToken = z.infer<typeof InviteToken>;

/**
 * Invite acceptance payload. Like registration, explicit LGPD consent is
 * mandatory — a barber who accepts an invite is signing up for an account,
 * so the same consent gate applies (user-auth spec).
 */
export const InviteAcceptInput = z.object({
  token: InviteToken,
  name: z.string().min(1),
  password: z.string().min(8),
  phone: z.string().min(8).optional(),
  consent: z.literal(true),
  consentPolicyVersion: z.string().min(1),
});

export type InviteAcceptInput = z.infer<typeof InviteAcceptInput>;
