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
  BarberNotFoundError,
  dateKeyOf,
  getBarberAssignmentMatrix,
  listBarbers,
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
      user: { name: "Carlos", email: "carlos@example.com" },
    } as Barber & { user: { name: string | null; email: string } });
    expect(view).toMatchObject({
      id: "brb_1",
      userId: "usr_1",
      userName: "Carlos",
      userEmail: "carlos@example.com",
      specialties: ["corte", "barba"],
      active: true,
    });
    expect(view.bio).toBeUndefined();
  });

  it("maps a nullable linked user name and keeps the email", () => {
    const view = toBarberView({
      id: "brb_2",
      userId: "usr_2",
      specialties: ["corte"],
      bio: null,
      active: true,
      createdAt: at("2026-08-01T10:00:00.000Z"),
      updatedAt: at("2026-08-01T10:00:00.000Z"),
      user: { name: null, email: "ana@example.com" },
    } as Barber & { user: { name: string | null; email: string } });
    expect(view.userName).toBeNull();
    expect(view.userEmail).toBe("ana@example.com");
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

describe("listBarbers", () => {
  it("includes the linked user name/email and stays tenant-scoped", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "brb_1",
        userId: "usr_1",
        specialties: ["corte"],
        bio: null,
        active: true,
        createdAt: at("2026-08-01T10:00:00.000Z"),
        updatedAt: at("2026-08-01T10:00:00.000Z"),
        user: { name: "Carlos", email: "carlos@example.com" },
      },
      {
        id: "brb_2",
        userId: "usr_2",
        specialties: ["barba"],
        bio: null,
        active: true,
        createdAt: at("2026-08-01T10:00:00.000Z"),
        updatedAt: at("2026-08-01T10:00:00.000Z"),
        user: { name: null, email: "ana@example.com" },
      },
    ]);
    const db = { barber: { findMany } } as unknown as PrismaClient;

    const barbers = await listBarbers(db, "bshp_1", { includeInactive: true });

    // tenant scoping is enforced in the query — foreign barbers never load
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { barbershopId: "bshp_1" },
        include: { user: { select: { name: true, email: true } } },
      }),
    );
    expect(barbers).toHaveLength(2);
    expect(barbers[0]).toMatchObject({ id: "brb_1", userName: "Carlos", userEmail: "carlos@example.com" });
    expect(barbers[1]).toMatchObject({ userName: null, userEmail: "ana@example.com" });
  });

  it("filters to active barbers by default", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const db = { barber: { findMany } } as unknown as PrismaClient;

    await listBarbers(db, "bshp_1");

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { barbershopId: "bshp_1", active: true } }),
    );
  });
});

describe("getBarberAssignmentMatrix", () => {
  it("returns every tenant service with the correct assigned flag (mixed)", async () => {
    const findBarber = vi.fn().mockResolvedValue({ id: "brb_1", barbershopId: "bshp_1" });
    const findServices = vi.fn().mockResolvedValue([
      { id: "svc_1", name: "Corte" },
      { id: "svc_2", name: "Barba" },
      { id: "svc_3", name: "Sobrancelha" },
    ]);
    const findAssignments = vi.fn().mockResolvedValue([{ serviceId: "svc_1" }, { serviceId: "svc_3" }]);
    const db = {
      barber: { findFirst: findBarber },
      service: { findMany: findServices },
      barberService: { findMany: findAssignments },
    } as unknown as PrismaClient;

    const matrix = await getBarberAssignmentMatrix(db, "bshp_1", "brb_1");

    expect(findBarber).toHaveBeenCalledWith({ where: { id: "brb_1", barbershopId: "bshp_1" } });
    expect(matrix).toEqual([
      { serviceId: "svc_1", name: "Corte", assigned: true },
      { serviceId: "svc_2", name: "Barba", assigned: false },
      { serviceId: "svc_3", name: "Sobrancelha", assigned: true },
    ]);
  });

  it("marks every tenant service unassigned for a barber with no assignments", async () => {
    const findBarber = vi.fn().mockResolvedValue({ id: "brb_1", barbershopId: "bshp_1" });
    const findServices = vi.fn().mockResolvedValue([
      { id: "svc_1", name: "Corte" },
      { id: "svc_2", name: "Barba" },
    ]);
    const findAssignments = vi.fn().mockResolvedValue([]);
    const db = {
      barber: { findFirst: findBarber },
      service: { findMany: findServices },
      barberService: { findMany: findAssignments },
    } as unknown as PrismaClient;

    const matrix = await getBarberAssignmentMatrix(db, "bshp_1", "brb_1");

    expect(matrix).toEqual([
      { serviceId: "svc_1", name: "Corte", assigned: false },
      { serviceId: "svc_2", name: "Barba", assigned: false },
    ]);
  });

  it("throws BarberNotFoundError for an unknown or foreign barber and fetches nothing", async () => {
    const findBarber = vi.fn().mockResolvedValue(null);
    const findServices = vi.fn();
    const findAssignments = vi.fn();
    const db = {
      barber: { findFirst: findBarber },
      service: { findMany: findServices },
      barberService: { findMany: findAssignments },
    } as unknown as PrismaClient;

    await expect(getBarberAssignmentMatrix(db, "bshp_1", "brb_estranho")).rejects.toThrow(BarberNotFoundError);

    // no service or assignment data is fetched for an out-of-tenant barber
    expect(findServices).not.toHaveBeenCalled();
    expect(findAssignments).not.toHaveBeenCalled();
  });

  it("is read-only: only fetches, never creates, updates or deletes", async () => {
    const findBarber = vi.fn().mockResolvedValue({ id: "brb_1", barbershopId: "bshp_1" });
    const findServices = vi.fn().mockResolvedValue([{ id: "svc_1", name: "Corte" }]);
    const findAssignments = vi.fn().mockResolvedValue([{ serviceId: "svc_1" }]);
    const create = vi.fn();
    const update = vi.fn();
    const upsert = vi.fn();
    const remove = vi.fn();
    const db = {
      barber: { findFirst: findBarber, create, update, delete: remove },
      service: { findMany: findServices, create, update, delete: remove },
      barberService: { findMany: findAssignments, create, upsert, update, deleteMany: remove, delete: remove },
    } as unknown as PrismaClient;

    await getBarberAssignmentMatrix(db, "bshp_1", "brb_1");

    expect(findServices).toHaveBeenCalled();
    expect(findAssignments).toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
});
