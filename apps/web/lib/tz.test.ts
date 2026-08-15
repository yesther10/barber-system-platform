import { describe, expect, it } from "vitest";
import { BR_TIMEZONE, formatSlotLocal, todayInTz } from "./tz";

describe("tz slot formatting", () => {
  it("exposes the fixed America/Sao_Paulo timezone constant", () => {
    expect(BR_TIMEZONE).toBe("America/Sao_Paulo");
  });

  it("formats a UTC slot instant as local HH:MM in America/Sao_Paulo (UTC-3)", () => {
    expect(formatSlotLocal("2026-08-20T12:00:00.000Z")).toBe("09:00");
  });

  it("formats against the injected timezone instead of the default", () => {
    expect(formatSlotLocal("2026-08-20T12:00:00.000Z", "UTC")).toBe("12:00");
  });

  it("renders midnight as 00:00, not the ICU 24:00 quirk", () => {
    expect(formatSlotLocal("2026-08-20T03:00:00.000Z")).toBe("00:00");
  });

  it("keeps single-digit hours zero-padded", () => {
    expect(formatSlotLocal("2026-08-20T06:05:00.000Z")).toBe("03:05");
  });
});

describe("todayInTz", () => {
  it("returns the YYYY-MM-DD calendar date of the instant in BR time", () => {
    expect(todayInTz(new Date("2026-08-20T15:00:00.000Z"))).toBe("2026-08-20");
  });

  it("shifts to the previous calendar day for early-morning UTC instants", () => {
    expect(todayInTz(new Date("2026-08-21T02:00:00.000Z"))).toBe("2026-08-20");
  });
});