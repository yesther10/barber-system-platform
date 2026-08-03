import { describe, expect, it } from "vitest";
import {
  ConsentInput,
  ConsentRecord,
  DeletionRequest,
  ExportResponse,
  WithdrawalInput,
} from "./lgpd.js";

describe("lgpd contracts", () => {
  it("records explicit consent only when accepted", () => {
    const ok = ConsentInput.safeParse({
      accepted: true,
      policyVersion: "2026-07-31",
    });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.policyVersion).toBe("2026-07-31");
    expect(ConsentInput.safeParse({ accepted: false, policyVersion: "2026-07-31" }).success).toBe(
      false,
    );
  });

  it("parses a stored consent record with timestamp and version", () => {
    const parsed = ConsentRecord.safeParse({
      acceptedAt: "2026-08-01T10:00:00.000Z",
      policyVersion: "2026-07-31",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.acceptedAt).toBe("2026-08-01T10:00:00.000Z");
  });

  it("requires explicit confirmation for deletion", () => {
    expect(DeletionRequest.safeParse({ confirm: true }).success).toBe(true);
    expect(DeletionRequest.safeParse({ confirm: false }).success).toBe(false);
    expect(DeletionRequest.safeParse({}).success).toBe(false);
  });

  it("parses a consent withdrawal", () => {
    expect(WithdrawalInput.safeParse({ withdraw: true }).success).toBe(true);
    expect(WithdrawalInput.safeParse({ withdraw: false }).success).toBe(false);
  });

  it("parses a data export with user info, appointments and consent", () => {
    const parsed = ExportResponse.safeParse({
      user: { id: "usr_1", email: "maria@example.com", name: "Maria", phone: null },
      appointments: [
        {
          id: "apt_1",
          barbershopId: "bshp_1",
          serviceId: "svc_1",
          startsAt: "2026-08-10T14:00:00.000Z",
          status: "pending",
          priceSnapshot: 45.0,
        },
      ],
      consent: { acceptedAt: "2026-08-01T10:00:00.000Z", policyVersion: "2026-07-31" },
      generatedAt: "2026-08-02T09:00:00.000Z",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.appointments).toHaveLength(1);
  });

  it("parses an export for a user who never consented", () => {
    const parsed = ExportResponse.safeParse({
      user: { id: "usr_2", email: "joao@example.com", name: null, phone: null },
      appointments: [],
      consent: null,
      generatedAt: "2026-08-02T09:00:00.000Z",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.consent).toBeNull();
  });
});
