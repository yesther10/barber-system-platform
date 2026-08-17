import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password.js";

describe("password hashing", () => {
  it("hashes a password into a non-plaintext bcrypt hash", async () => {
    const hash = await hashPassword("s3nh4-segura");
    expect(hash).not.toContain("s3nh4-segura");
    expect(hash).toMatch(/^\$2[aby]\$\d{2}\$/);
  });

  it("verifies the correct password against its hash", async () => {
    const hash = await hashPassword("s3nh4-segura");
    expect(await verifyPassword("s3nh4-segura", hash)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("s3nh4-segura");
    expect(await verifyPassword("senha-errada", hash)).toBe(false);
  });

  it("produces a distinct salt per hash so identical inputs differ", async () => {
    const a = await hashPassword("mesma-senha");
    const b = await hashPassword("mesma-senha");
    expect(a).not.toBe(b);
  });
});
