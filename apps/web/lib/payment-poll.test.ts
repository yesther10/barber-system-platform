import { describe, expect, it, vi } from "vitest";
import { createStatusPoller } from "./payment-poll";

const statusView = (paymentStatus: "pending" | "paid" | "expired") => ({
  appointmentId: "appt_1",
  paymentStatus,
  appointmentStatus: "pending",
});

const instantSleep = () => vi.fn().mockResolvedValue(undefined);

describe("createStatusPoller", () => {
  it("returns paid as soon as the status is paid, without sleeping", async () => {
    const fetchStatus = vi.fn().mockResolvedValue(statusView("paid"));
    const sleep = instantSleep();
    const poller = createStatusPoller({ maxAttempts: 10, baseDelayMs: 2000, backoff: 1.5 });

    const result = await poller.poll({ fetchStatus, sleep });

    expect(result).toEqual({ status: "paid", view: statusView("paid") });
    expect(fetchStatus).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("returns expired as soon as the status is expired", async () => {
    const fetchStatus = vi.fn().mockResolvedValue(statusView("expired"));
    const sleep = instantSleep();
    const poller = createStatusPoller({ maxAttempts: 10, baseDelayMs: 2000, backoff: 1.5 });

    const result = await poller.poll({ fetchStatus, sleep });

    expect(result).toEqual({ status: "expired", view: statusView("expired") });
    expect(fetchStatus).toHaveBeenCalledTimes(1);
  });

  it("keeps polling while pending and waits with 2s base and 1.5x backoff", async () => {
    const fetchStatus = vi
      .fn()
      .mockResolvedValueOnce(statusView("pending"))
      .mockResolvedValueOnce(statusView("pending"))
      .mockResolvedValueOnce(statusView("paid"));
    const sleep = instantSleep();
    const poller = createStatusPoller({ maxAttempts: 10, baseDelayMs: 2000, backoff: 1.5 });

    const result = await poller.poll({ fetchStatus, sleep });

    expect(result).toEqual({ status: "paid", view: statusView("paid") });
    expect(fetchStatus).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([2000, 3000]);
  });

  it("stops after maxAttempts and reports timeout when the status never resolves", async () => {
    const fetchStatus = vi.fn().mockResolvedValue(statusView("pending"));
    const sleep = instantSleep();
    const poller = createStatusPoller({ maxAttempts: 3, baseDelayMs: 10, backoff: 1.5 });

    const result = await poller.poll({ fetchStatus, sleep });

    expect(result).toEqual({ status: "timeout" });
    expect(fetchStatus).toHaveBeenCalledTimes(3);
  });

  it("uses the default terminal rule (paid/expired) when none is provided", async () => {
    const fetchStatus = vi.fn().mockResolvedValue(statusView("pending"));
    const sleep = instantSleep();
    const poller = createStatusPoller({ maxAttempts: 1, baseDelayMs: 10, backoff: 1.5 });

    const result = await poller.poll({ fetchStatus, sleep });

    expect(result).toEqual({ status: "timeout" });
  });
});