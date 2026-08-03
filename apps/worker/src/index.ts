/**
 * @barber/worker — in-repo background processor.
 *
 * Every 15 minutes it runs three idempotent scans (design/worker):
 *   1. outbox        — deliver queued transactional-outbox notifications.
 *   2. reminderScan  — send PT-BR reminders for imminent appointments.
 *   3. paymentReconcile — recover Pix payments marked pending past the
 *      safety net (covers webhooks the provider never delivered).
 *
 * Scan implementations land with the worker work unit (Phase 5). This file
 * only establishes the loop contract and processes a tick.
 */

export interface ScanResult {
  scan: "outbox" | "reminder" | "payment-reconcile";
  handled: number;
  ranAt: Date;
}

/** Bootstrap no-op scans; replaced by real workers in the worker work unit. */
export async function outboxScan(): Promise<ScanResult> {
  return { scan: "outbox", handled: 0, ranAt: new Date() };
}

export async function reminderScan(): Promise<ScanResult> {
  return { scan: "reminder", handled: 0, ranAt: new Date() };
}

export async function paymentReconcileScan(): Promise<ScanResult> {
  return { scan: "payment-reconcile", handled: 0, ranAt: new Date() };
}

export async function runCronCycle(): Promise<ScanResult[]> {
  return Promise.all([outboxScan(), reminderScan(), paymentReconcileScan()]);
}

/** Schedule the cycle every `intervalMs`, flushing immediately on start. */
export function startCron(
  intervalMs: number,
  runner: () => Promise<ScanResult[]> = runCronCycle,
  logger: Console = console,
): () => void {
  void runner().then((results) => logger.log("[worker] tick", results));
  const timer = setInterval(() => {
    void runner().then((results) => logger.log("[worker] tick", results));
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}

const CRON_INTERVAL_MS = 15 * 60 * 1000;

if (import.meta.url === `file://${process.argv[1]}`) {
  startCron(CRON_INTERVAL_MS);
}