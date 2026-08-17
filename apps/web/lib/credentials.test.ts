import { describe, expect, it, vi } from "vitest";
import { authenticateCredentials } from "./credentials.js";

type FakeRow = {
  id: string;
  email: string;
  passwordHash: string | null;
  name: string | null;
  role: "CLIENT" | "BARBER" | "BARBERSHOP_ADMIN";
  barbershopId: string | null;
};

function fakeStore(rows: Record<string, FakeRow>) {
  return {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { email: string } }) => rows[where.email] ?? null),
    },
  };
}

describe("authenticateCredentials", () => {
  it("returns the session user for valid email/password", async () => {
    const store = fakeStore({
      "maria@example.com": {
        id: "usr_1",
        email: "maria@example.com",
        passwordHash: "$2b$10$abcdefghijklmnopqrstuv", // placeholder, replaced below
        name: "Maria",
        role: "CLIENT",
        barbershopId: null,
      },
    });
    // Use a real bcrypt hash so verification is honest.
    const { hashPassword } = await import("./password.js");
    store.user.findUnique.mockImplementation(async () => ({
      id: "usr_1",
      email: "maria@example.com",
      passwordHash: await hashPassword("s3nh4-segura"),
      name: "Maria",
      role: "CLIENT" as const,
      barbershopId: null,
    }));

    const sessionUser = await authenticateCredentials(store, {
      email: "maria@example.com",
      password: "s3nh4-segura",
    });

    expect(sessionUser).toMatchObject({ id: "usr_1", email: "maria@example.com", role: "client", barbershopId: null });
  });

  it("returns null for a wrong password", async () => {
    const store = fakeStore({});
    const { hashPassword } = await import("./password.js");
    store.user.findUnique.mockImplementation(async () => ({
      id: "usr_1",
      email: "maria@example.com",
      passwordHash: await hashPassword("s3nh4-segura"),
      name: "Maria",
      role: "CLIENT" as const,
      barbershopId: null,
    }));

    await expect(
      authenticateCredentials(store, { email: "maria@example.com", password: "senha-errada" }),
    ).resolves.toBeNull();
  });

  it("returns null for an unknown email", async () => {
    await expect(
      authenticateCredentials(fakeStore({}), { email: "ghost@example.com", password: "s3nh4-segura" }),
    ).resolves.toBeNull();
  });

  it("returns null for an account without a password (Google-only)", async () => {
    const store = fakeStore({
      "joao@example.com": { id: "usr_2", email: "joao@example.com", passwordHash: null, name: "João", role: "CLIENT", barbershopId: null },
    });
    await expect(
      authenticateCredentials(store, { email: "joao@example.com", password: "s3nh4-segura" }),
    ).resolves.toBeNull();
  });

  it("returns null for an invalid payload", async () => {
    await expect(authenticateCredentials(fakeStore({}), { email: "not-an-email", password: "x" })).resolves.toBeNull();
  });
});
