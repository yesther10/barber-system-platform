import { describe, expect, it } from "vitest";
import { createClient, pingDatabase, TENANT_SCOPE_FIELD } from "./index.js";

describe("db package", () => {
  it("records the tenant isolation field name", () => {
    expect(TENANT_SCOPE_FIELD).toBe("barbershopId");
  });

  it("pings a reachable database", async () => {
    const ok = await pingDatabase(async () => ({
      query: async () => ({ rows: [{ "?column?": 1 }] }),
      end: async () => undefined,
    }));
    expect(ok).toBe(true);
  });

  it("reports unreachable database as false", async () => {
    const ok = await pingDatabase(async () => {
      throw new Error("connection refused");
    });
    expect(ok).toBe(false);
  });

  it("creates a Prisma client wired to the MySQL (MariaDB) driver adapter", () => {
    const client = createClient("mysql://test:test@localhost:3306/test");
    // Prisma 7 wraps instances in a promise-proxy, so assert the client surface
    // (model delegates + lifecycle) rather than instanceof.
    expect(typeof client.$connect).toBe("function");
    expect(typeof client.$disconnect).toBe("function");
    expect(typeof client.barbershop.findMany).toBe("function");
    expect(typeof client.appointment.create).toBe("function");
    void client.$disconnect();
  });
});