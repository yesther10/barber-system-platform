import { describe, expect, it } from "vitest";
import {
  buildNotificationEmail,
  computeRetryBackoff,
  type NotificationEmailDetails,
} from "./notifications.js";

const details: NotificationEmailDetails = {
  appointmentId: "apt_1",
  appointmentStatus: "confirmed",
  barberName: "Carlos",
  clientEmail: "cliente@example.com",
  clientName: "Marina",
  paymentStatus: "paid",
  serviceName: "Corte",
  startsAt: new Date("2026-10-07T13:00:00.000Z"),
  timezone: "America/Sao_Paulo",
};

describe("worker notifications", () => {
  it("renders PT-BR confirmation emails with appointment details and payment status", () => {
    const email = buildNotificationEmail("CONFIRMATION", details);

    expect(email.subject).toContain("Agendamento confirmado");
    expect(email.html).toContain("Corte");
    expect(email.html).toContain("Carlos");
    expect(email.html).toContain("Pago");
    expect(email.text).toContain("07/10/2026");
  });

  it("computes exponential retry backoff for transient delivery failures", () => {
    expect(computeRetryBackoff(0)).toBe(5 * 60_000);
    expect(computeRetryBackoff(1)).toBe(10 * 60_000);
    expect(computeRetryBackoff(2)).toBe(20 * 60_000);
    expect(computeRetryBackoff(6)).toBe(6 * 60 * 60_000);
  });
});
