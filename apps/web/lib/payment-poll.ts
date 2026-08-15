/**
 * Payment status poller (booking design: poller decision).
 *
 * Pure controller: given a status-fetch function it polls with exponential
 * backoff until the payment reaches a terminal state (`paid`/`expired` by
 * default) or the attempt budget is exhausted. The UI maps a timeout to a
 * "still waiting" state with a manual retry — the poll never blocks forever.
 * `sleep` is injected so unit tests run without real timers.
 */
import type { PaymentStatusView } from "@barber/contracts";

export interface StatusPollerConfig {
  maxAttempts?: number;
  baseDelayMs?: number;
  backoff?: number;
  isTerminal?: (view: PaymentStatusView) => boolean;
}

export interface StatusPollerDeps {
  fetchStatus: () => Promise<PaymentStatusView>;
  sleep?: (ms: number) => Promise<void>;
}

export type PaymentPollResult =
  | { status: "paid"; view: PaymentStatusView }
  | { status: "expired"; view: PaymentStatusView }
  | { status: "timeout" };

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const isPaidOrExpired = (view: PaymentStatusView) =>
  view.paymentStatus === "paid" || view.paymentStatus === "expired";

export function createStatusPoller(config: StatusPollerConfig = {}) {
  const maxAttempts = config.maxAttempts ?? 10;
  const baseDelayMs = config.baseDelayMs ?? 2000;
  const backoff = config.backoff ?? 1.5;
  const isTerminal = config.isTerminal ?? isPaidOrExpired;

  return {
    async poll(deps: StatusPollerDeps): Promise<PaymentPollResult> {
      let delay = baseDelayMs;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const view = await deps.fetchStatus();
        if (isTerminal(view)) {
          return view.paymentStatus === "paid"
            ? { status: "paid", view }
            : { status: "expired", view };
        }
        if (attempt < maxAttempts) await (deps.sleep ?? defaultSleep)(delay);
        delay *= backoff;
      }
      return { status: "timeout" };
    },
  };
}