import { describe, expect, it } from "vitest";
import { PIX_PROVIDER_CONTRACT } from "./index.js";

describe("payments package", () => {
  it("pins the provider contract version", () => {
    expect(PIX_PROVIDER_CONTRACT).toBe("0.0.2");
  });
});
