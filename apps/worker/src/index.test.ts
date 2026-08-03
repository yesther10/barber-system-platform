import { describe, expect, it } from "vitest";
import { runCronCycle } from "./index.js";

describe("worker cron cycle", () => {
  it("runs all three scans and reports a handled count", async () => {
    const results = await runCronCycle();
    expect(results.map((r) => r.scan)).toEqual([
      "outbox",
      "reminder",
      "payment-reconcile",
    ]);
    expect(results.every((r) => r.handled >= 0)).toBe(true);
  });
});