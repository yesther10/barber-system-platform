/**
 * Consent-gated client registration (user-auth spec, task 3.2).
 *
 * The registration contract (RegisterInput) only accepts `consent: true`,
 * so a signup without explicit LGPD consent fails validation BEFORE any
 * account is created. A missing/false consent is surfaced as a precise
 * `ConsentRequiredError`; every other validation problem is an
 * `InvalidInputError`. The created account is always a `client` with the
 * consent timestamp and policy version recorded on the row.
 */
import { RegisterInput, type RegisterResult } from "@barber/contracts";
import { hashPassword } from "./password";

/** Thrown when the payload fails the registration contract. */
export class InvalidInputError extends Error {
  readonly code = "INVALID_INPUT" as const;
}

/** Thrown when LGPD consent was not explicitly given — no account is created. */
export class ConsentRequiredError extends Error {
  readonly code = "CONSENT_REQUIRED" as const;

  constructor(message = "LGPD consent must be explicitly given") {
    super(message);
    this.name = "ConsentRequiredError";
  }
}

/** Thrown when the email already has an account. */
export class EmailAlreadyRegisteredError extends Error {
  readonly code = "EMAIL_TAKEN" as const;
}

/** Minimal user store surface needed by registration (prisma-compatible). */
export interface RegisterUserStore {
  user: {
    findUnique(args: { where: { email: string } }): Promise<{ id: string } | null>;
    create(args: {
      data: {
        email: string;
        passwordHash: string;
        name: string;
        phone?: string;
        role: "CLIENT";
        consentAcceptedAt: Date;
        consentPolicyVersion: string;
      };
    }): Promise<{ id: string; email: string }>;
  };
}

/** Registers a client account, refusing registration when consent is missing. */
export async function registerClient(
  db: RegisterUserStore,
  input: unknown,
  now: Date = new Date(),
): Promise<RegisterResult> {
  const parsed = RegisterInput.safeParse(input);
  if (!parsed.success) {
    const consentMissing = parsed.error.issues.some((issue) => issue.path[0] === "consent");
    if (consentMissing) throw new ConsentRequiredError();
    throw new InvalidInputError("Invalid registration payload");
  }

  const existing = await db.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) throw new EmailAlreadyRegisteredError("Email is already registered");

  const passwordHash = await hashPassword(parsed.data.password);
  const created = await db.user.create({
    data: {
      email: parsed.data.email,
      passwordHash,
      name: parsed.data.name,
      phone: parsed.data.phone,
      role: "CLIENT",
      consentAcceptedAt: now,
      consentPolicyVersion: parsed.data.consentPolicyVersion,
    },
  });
  return { id: created.id, email: created.email, role: "client" };
}
