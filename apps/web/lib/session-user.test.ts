import { describe, expect, it } from "vitest";
import { mapRoleToDb, toSessionUser } from "./session-user.js";

describe("toSessionUser", () => {
  it("maps a barbershop_admin DB user to the session shape with role and tenant", () => {
    const sessionUser = toSessionUser({
      id: "usr_1",
      email: "admin@tesoura.example",
      name: "Admin Tesoura",
      role: "BARBERSHOP_ADMIN",
      barbershopId: "bshp_a",
    });
    expect(sessionUser).toEqual({
      id: "usr_1",
      email: "admin@tesoura.example",
      name: "Admin Tesoura",
      role: "barbershop_admin",
      barbershopId: "bshp_a",
    });
  });

  it("maps a client with no tenant and null name", () => {
    const sessionUser = toSessionUser({
      id: "usr_2",
      email: "maria@example.com",
      name: null,
      role: "CLIENT",
      barbershopId: null,
    });
    expect(sessionUser).toEqual({
      id: "usr_2",
      email: "maria@example.com",
      name: null,
      role: "client",
      barbershopId: null,
    });
  });

  it("maps every DB role to its lowercase contract role", () => {
    expect(toSessionUser({ id: "u", email: "b@x.com", name: null, role: "BARBER", barbershopId: "t" }).role).toBe("barber");
    expect(toSessionUser({ id: "u", email: "c@x.com", name: null, role: "CLIENT", barbershopId: null }).role).toBe("client");
    expect(toSessionUser({ id: "u", email: "a@x.com", name: null, role: "BARBERSHOP_ADMIN", barbershopId: "t" }).role).toBe("barbershop_admin");
  });
});

describe("mapRoleToDb", () => {
  it("converts a contract role back to the DB enum", () => {
    expect(mapRoleToDb("client")).toBe("CLIENT");
    expect(mapRoleToDb("barber")).toBe("BARBER");
    expect(mapRoleToDb("barbershop_admin")).toBe("BARBERSHOP_ADMIN");
  });
});
