import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const FIXTURE_PATH = "/tmp/opencode/barber-system-platform-e2e.json";

interface E2EFixture {
  shop: { slug: string };
  barber: { id: string };
  service: { id: string };
  admin: { email: string; password: string };
  client: { email: string; password: string };
  clientTwo: { email: string; password: string };
  barberCandidate: { userId: string };
  slot: { startsAt: string; date: string };
  adminSlot: { startsAt: string; date: string; dayOfWeek: number };
  conflictSlot: { startsAt: string };
  appointments: {
    cancelableId: string;
    lateCancelId: string;
  };
}

function readFixture(): E2EFixture {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as E2EFixture;
}

async function signInWithCredentials(page: Parameters<typeof test>[0]["page"], email: string, password: string) {
  const api = page.context().request;
  const csrfResponse = await api.get("/api/auth/csrf");
  expect(csrfResponse.ok()).toBe(true);

  const { csrfToken } = (await csrfResponse.json()) as { csrfToken: string };
  const response = await api.post("/api/auth/callback/credentials", {
    form: {
      csrfToken,
      email,
      password,
      callbackUrl: "/",
      json: "true",
    },
  });

  expect(response.ok()).toBe(true);
}

test("booking stays protected until the client signs in", async ({ page }) => {
  const fixture = readFixture();
  const response = await page.context().request.post("/api/bookings", {
    data: {
      serviceId: fixture.service.id,
      barberId: fixture.barber.id,
      startsAt: fixture.slot.startsAt,
    },
  });

  expect(response.status()).toBe(401);
  await expect(response.json()).resolves.toMatchObject({ error: "SESSION_REQUIRED" });
});

test("client can browse, sign in, book, and receive a Pix QR payload", async ({ page }) => {
  const fixture = readFixture();
  const api = page.context().request;

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Barberia", level: 1 })).toBeVisible();

  const servicesResponse = await api.get(`/api/public/barbershops/${fixture.shop.slug}/services`);
  expect(servicesResponse.ok()).toBe(true);
  const services = (await servicesResponse.json()) as Array<{ id: string; name: string }>;
  expect(services).toHaveLength(1);
  expect(services[0]).toMatchObject({ id: fixture.service.id, name: "Corte" });

  const slotsResponse = await api.get(
    `/api/public/barbershops/${fixture.shop.slug}/slots?serviceId=${fixture.service.id}&barberId=${fixture.barber.id}&date=${fixture.slot.date}`,
  );
  expect(slotsResponse.ok()).toBe(true);
  const slots = (await slotsResponse.json()) as { slots: string[] };
  expect(slots.slots).toContain(fixture.slot.startsAt);

  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Entrar", level: 1 })).toBeVisible();
  await signInWithCredentials(page, fixture.client.email, fixture.client.password);

  const sessionResponse = await api.get("/api/auth/session");
  expect(sessionResponse.ok()).toBe(true);
  const session = (await sessionResponse.json()) as { user?: { email?: string; role?: string } };
  expect(session.user).toMatchObject({ email: fixture.client.email, role: "client" });

  const bookingResponse = await api.post("/api/bookings", {
    data: {
      serviceId: fixture.service.id,
      barberId: fixture.barber.id,
      startsAt: fixture.slot.startsAt,
    },
  });
  expect(bookingResponse.status()).toBe(201);
  const appointment = (await bookingResponse.json()) as { id: string; paymentStatus: string; status: string };
  expect(appointment.paymentStatus).toBe("pending");
  expect(appointment.status).toBe("confirmed");

  const pixResponse = await api.post(`/api/payments/${appointment.id}/pix`);
  expect(pixResponse.status()).toBe(201);
  const pixPayment = (await pixResponse.json()) as {
    appointmentId: string;
    qrCode: string | null;
    providerPaymentId: string | null;
    status: string;
  };
  expect(pixPayment).toMatchObject({
    appointmentId: appointment.id,
    status: "pending",
  });
  expect(pixPayment.qrCode).toContain("000201");
  expect(pixPayment.providerPaymentId).toBeTruthy();
});

test("admin can configure a new service/barber/schedule and the client can book that slot", async ({ page }) => {
  const fixture = readFixture();
  const api = page.context().request;

  await signInWithCredentials(page, fixture.admin.email, fixture.admin.password);

  const serviceResponse = await api.post("/api/admin/services", {
    data: {
      name: "Barba Premium",
      description: "Acabamento completo",
      priceBRL: 60,
      durationMinutes: 45,
    },
  });
  expect(serviceResponse.status()).toBe(201);
  const service = (await serviceResponse.json()) as { id: string };

  const barberResponse = await api.post("/api/admin/barbers", {
    data: {
      userId: fixture.barberCandidate.userId,
      specialties: ["barba"],
      bio: "Especialista em acabamento",
    },
  });
  expect(barberResponse.status()).toBe(201);
  const barber = (await barberResponse.json()) as { id: string };

  const assignmentResponse = await api.post(`/api/admin/barbers/${barber.id}/services/${service.id}`);
  expect(assignmentResponse.status()).toBe(200);

  const scheduleResponse = await api.post("/api/admin/schedules", {
    data: {
      barberId: barber.id,
      dayOfWeek: fixture.adminSlot.dayOfWeek,
      startTime: "09:00",
      endTime: "17:00",
    },
  });
  expect(scheduleResponse.status()).toBe(201);

  const servicesResponse = await api.get(`/api/public/barbershops/${fixture.shop.slug}/services`);
  expect(servicesResponse.ok()).toBe(true);
  const services = (await servicesResponse.json()) as Array<{ id: string; name: string }>;
  expect(services).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: service.id, name: "Barba Premium" })]),
  );

  const slotsResponse = await api.get(
    `/api/public/barbershops/${fixture.shop.slug}/slots?serviceId=${service.id}&barberId=${barber.id}&date=${fixture.adminSlot.date}`,
  );
  expect(slotsResponse.ok()).toBe(true);
  const slots = (await slotsResponse.json()) as { slots: string[] };
  expect(slots.slots).toContain(fixture.adminSlot.startsAt);

  await signInWithCredentials(page, fixture.clientTwo.email, fixture.clientTwo.password);
  const bookingResponse = await api.post("/api/bookings", {
    data: {
      serviceId: service.id,
      barberId: barber.id,
      startsAt: fixture.adminSlot.startsAt,
    },
  });
  expect(bookingResponse.status()).toBe(201);
  await expect(bookingResponse.json()).resolves.toMatchObject({
    barberId: barber.id,
    serviceId: service.id,
    startsAt: fixture.adminSlot.startsAt,
  });
});

test("client can cancel outside the window but gets 409 inside the late-cancel window", async ({ page }) => {
  const fixture = readFixture();
  const api = page.context().request;

  await signInWithCredentials(page, fixture.client.email, fixture.client.password);

  const cancelableResponse = await api.post(`/api/bookings/${fixture.appointments.cancelableId}/cancel`, {
    data: { reason: "Imprevisto" },
  });
  expect(cancelableResponse.status()).toBe(200);
  await expect(cancelableResponse.json()).resolves.toMatchObject({
    id: fixture.appointments.cancelableId,
    status: "cancelled",
    cancelReason: "Imprevisto",
  });

  const lateCancelResponse = await api.post(`/api/bookings/${fixture.appointments.lateCancelId}/cancel`, {
    data: { reason: "Muito perto" },
  });
  expect(lateCancelResponse.status()).toBe(409);
  await expect(lateCancelResponse.json()).resolves.toMatchObject({ error: "LATE_CANCEL_REJECTED" });
});

test("booking the same occupied slot returns a 409 conflict", async ({ page }) => {
  const fixture = readFixture();
  const api = page.context().request;

  await signInWithCredentials(page, fixture.clientTwo.email, fixture.clientTwo.password);
  const response = await api.post("/api/bookings", {
    data: {
      serviceId: fixture.service.id,
      barberId: fixture.barber.id,
      startsAt: fixture.conflictSlot.startsAt,
    },
  });

  expect(response.status()).toBe(409);
  await expect(response.json()).resolves.toMatchObject({ error: "SLOT_CONFLICT" });
});
