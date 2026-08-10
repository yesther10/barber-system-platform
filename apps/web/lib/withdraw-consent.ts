import { WithdrawalInput } from "@barber/contracts";

export class InvalidWithdrawalInputError extends Error {
  readonly code = "INVALID_INPUT" as const;

  constructor(message = "Invalid consent withdrawal payload") {
    super(message);
    this.name = "InvalidWithdrawalInputError";
  }
}

export interface ConsentAwareUser {
  consentWithdrawnAt: Date | null;
}

export interface WithdrawConsentStore {
  user: {
    update(args: {
      where: { id: string };
      data: { consentWithdrawnAt: Date };
      select: { id: true; consentWithdrawnAt: true };
    }): Promise<{ id: string; consentWithdrawnAt: Date | null }>;
  };
}

export function hasWithdrawnConsent(user: ConsentAwareUser): boolean {
  return user.consentWithdrawnAt !== null;
}

export async function withdrawConsent(
  db: WithdrawConsentStore,
  userId: string,
  input: unknown,
  now: Date = new Date(),
) {
  const parsed = WithdrawalInput.safeParse(input);
  if (!parsed.success) throw new InvalidWithdrawalInputError();

  const updated = await db.user.update({
    where: { id: userId },
    data: { consentWithdrawnAt: now },
    select: { id: true, consentWithdrawnAt: true },
  });

  return {
    userId: updated.id,
    withdrawnAt: updated.consentWithdrawnAt?.toISOString() ?? now.toISOString(),
  };
}
