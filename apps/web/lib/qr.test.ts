import { describe, expect, it, vi } from "vitest";
import { qrDataUrl } from "./qr";

describe("qrDataUrl", () => {
  it("renders an emv payload through the injected toDataURL", async () => {
    const toDataURL = vi.fn().mockResolvedValue("data:image/png;base64,qr");

    const src = await qrDataUrl("000201emv", { toDataURL });

    expect(src).toBe("data:image/png;base64,qr");
    expect(toDataURL).toHaveBeenCalledWith("000201emv");
  });

  it("returns null without calling toDataURL for a null payload", async () => {
    const toDataURL = vi.fn();

    expect(await qrDataUrl(null, { toDataURL })).toBeNull();
    expect(toDataURL).not.toHaveBeenCalled();
  });

  it("returns null without calling toDataURL for an empty payload", async () => {
    const toDataURL = vi.fn();

    expect(await qrDataUrl("", { toDataURL })).toBeNull();
    expect(toDataURL).not.toHaveBeenCalled();
  });
});