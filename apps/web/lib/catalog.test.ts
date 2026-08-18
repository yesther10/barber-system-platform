/**
 * Unit tests for the catalog helpers: window ordering rule, the view mappers
 * (Decimal → number, Date → ISO) and the public directory query shape. The
 * DB CRUD paths are covered by tests/integration/catalog.test.ts against a
 * real MySQL.
 */
import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@barber/db";
import type { Barber, PrismaClient, Schedule, ScheduleException, Service } from "@barber/db";
import {
  assertWindowOrder,
  dateKeyOf,
  listPublicBarbershops,
  toBarberView,
  toExceptionView,
  toScheduleView,
  toServiceView,
  WindowOrderError,
} from "./catalog";

const at = (iso: string) => new Date(iso);

function fakeService(overrides: Partial<Service> = {}): Service {
  return {
    id: "svc_1",
    barbershopId: "bshp_1",
    name: "Corte",
    description: "Tesoura e máquina",
    priceBRL: new Prisma.Decimal("45.50"),
    durationMinutes: 30,
    active: true,
    createdAt: at("2026-08-01T10:00:00.000Z"),
    updatedAt: at("2026-08-01T10:00:00.000Z"),
    ...overrides,
  } as Service;
}

describe("assertWindowOrder", () => {
  it("accepts a window whose end is strictly after its start", () => {
    expect(() => assertWindowOrder("09:00", "17:00")).not.toThrow();
  });

  it("rejects an empty, inverted or identical window", () => {
    expect(() => assertWindowOrder("09:00", "09:00")).toThrow(WindowOrderError);
    expect(() => assertWindowOrder("17:00", "09:00")).toThrow(WindowOrderError);
    expect(() => assertWindowOrder("00:00", "00:00")).toThrow(WindowOrderError);
  });
});

describe("toServiceView", () => {
  it("maps Decimal price to a plain number and keeps timestamps as ISO", () => {
    const view = toServiceView(fakeService());
    expect(view.priceBRL).toBe(45.5);
    expect(view.id).toBe("svc_1");
    expect(view.active).toBe(true);
    expect(view.createdAt).toBe("2026-08-01T10:00:00.000Z");
    expect(view.description).toBe("Tesoura e máquina");
  });

  it("drops a null description from the view", () => {
    const view = toServiceView(fakeService({ description: null }));
    expect(view.description).toBeUndefined();
  });
});

describe("toBarberView / toScheduleView / toExceptionView / dateKeyOf", () => {
  it("maps a barber row including specialties and active flag", () => {
    const view = toBarberView({
      id: "brb_1",
      userId: "usr_1",
      specialties: ["corte", "barba"],
      bio: null,
      active: true,
      createdAt: at("2026-08-01T10:00:00.000Z"),
      updatedAt: at("2026-08-01T10:00:00.000Z"),
    } as Barber);
    expect(view).toMatchObject({ id: "brb_1", userId: "usr_1", specialties: ["corte", "barba"], active: true });
    expect(view.bio).toBeUndefined();
  });

  it("maps a schedule entry with its weekday and window", () => {
    const view = toScheduleView({
      id: "sch_1",
      dayOfWeek: 3,
      startTime: "09:00",
      endTime: "17:00",
    } as Schedule);
    expect(view).toEqual({ id: "sch_1", dayOfWeek: 3, startTime: "09:00", endTime: "17:00" });
  });

  it("maps an exception date back to YYYY-MM-DD", () => {
    const view = toExceptionView({
      id: "exc_1",
      date: at("2026-08-15T00:00:00.000Z"),
      startTime: "09:00",
      endTime: "17:00",
      reason: null,
    } as ScheduleException);
    expect(view.date).toBe("2026-08-15");
    expect(view.reason).toBeUndefined();
  });

  it("formats any Date as YYYY-MM-DD", () => {
    expect(dateKeyOf(at("2026-12-31T23:59:59.999Z"))).toBe("2026-12-31");
  });
});

describe("listPublicBarbershops", () => {
  it("lists barbershops with at least one active service, projecting slug and name", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { slug: "tesoura-de-ouro", name: "Tesoura de Ouro" },
      { slug: "navalha", name: "Navalha & Cia" },
    ]);
    const db = { barbershop: { findMany } } as unknown as PrismaClient;

    const shops = await listPublicBarbershops(db);

    expect(findMany).toHaveBeenCalledWith({
      where: { services: { some: { active: true } } },
      select: { slug: true, name: true },
      orderBy: { name: "asc" },
    });
    expect(shops).toEqual([
      { slug: "tesoura-de-ouro", name: "Tesoura de Ouro" },
      { slug: "navalha", name: "Navalha & Cia" },
    ]);
  });

  it("returns an empty list when no barbershop has an active service", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const db = { barbershop: { findMany } } as unknown as PrismaClient;

    const shops = await listPublicBarbershops(db);

    // the relation filter (some: { active: true }) is what makes this empty
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { services: { some: { active: true } } } }),
    );
    expect(shops).toEqual([]);
  });

  it("does not leak internal identity fields through the projection", async () => {
    const findMany = vi.fn().mockResolvedValue([{ slug: "tesoura-de-ouro", name: "Tesoura de Ouro" }]);
    const db = { barbershop: { findMany } } as unknown as PrismaClient;

    const shops = await listPublicBarbershops(db);

    // the select projection limits the payload to slug+name — no id/userId/pix
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ select: { slug: true, name: true } }),
    );
    expect(shops[0]).not.toHaveProperty("id");
    expect(shops[0]).not.toHaveProperty("userId");
    expect(shops[0]).not.toHaveProperty("pixProvider");
  });
});
