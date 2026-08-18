import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const FIXTURE_PATH = "/tmp/opencode/barber-system-platform-e2e.json";

interface E2EFixture {
  shop: { slug: string; name: string };
  barber: { id: string };
  service: { id: string };
  admin: { email: string; password: string };
  client: { email: string; password: string };
  slot: { startsAt: string; date: string };
}

function readFixture(): E2EFixture {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as E2EFixture;
}

/** Signs a user in via the NextAuth credentials callback (shared cookie jar). */
async function signInWithCredentials(
  page: Parameters<typeof test>[0]["page"],
  email: string,
  password: string,
) {
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

  expect(response.ok(), `credentials callback: ${response.status()} ${await response.text()}`).toBe(
    true,
  );
}

/** Browses the guest flow up to the confirm step for the given BR-tz slot label. */
async function browseToConfirm(
  page: Parameters<typeof test>[0]["page"],
  fixture: E2EFixture,
  slotLabel: string,
) {
  await page.goto(`/booking?slug=${fixture.shop.slug}`);
  await expect(page.getByRole("heading", { name: "Escolha o serviço" })).toBeVisible();

  await page.getByRole("button", { name: /Corte/ }).click();
  await expect(page.getByRole("heading", { name: "Escolha o barbeiro" })).toBeVisible();

  await page.getByRole("button", { name: /corte/ }).click();
  await expect(page.getByRole("heading", { name: "Escolha o dia e horário" })).toBeVisible();

  await page.locator("#booking-date").fill(fixture.slot.date);
  await page.getByRole("button", { name: slotLabel }).click();

  await expect(page.getByRole("heading", { name: "Confirme seu agendamento" })).toBeVisible();
}

test("home CTA lands on the tenant picker; selecting a barbershop continues the flow", async ({
  page,
}) => {
  const fixture = readFixture();

  // Home CTA → /booking WITHOUT a slug → the directory picker is the first
  // step (no dead-end "Carregando...").
  await page.goto("/");
  await page.getByRole("link", { name: "Agendar horário" }).click();
  await expect(page.getByRole("heading", { name: "Escolha a barbearia" })).toBeVisible();

  // The seeded listable barbershop shows by its visible name.
  await expect(page.getByRole("button", { name: fixture.shop.name })).toBeVisible();

  // Selecting it sets the slug and proceeds to the existing services step,
  // which loads against the picked tenant.
  await page.getByRole("button", { name: fixture.shop.name }).click();
  await expect(page.getByRole("heading", { name: "Escolha o serviço" })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("slug")).toBe(fixture.shop.slug);
  await expect(page.getByRole("button", { name: /Corte/ })).toBeVisible();
});

test("guest browses, passes the login gate, books, sees the Pix QR and the paid status", async ({
  page,
  browser,
}) => {
  const fixture = readFixture();
  // 12:00Z renders as "09:00" (São Paulo UTC-3) — the BR-tz scenario example
  // from the delta spec. The grid only lists FREE slots and the full suite
  // shares one server: booking-qr's journey books the seeded 13:00Z ("10:00")
  // first, so this journey uses 12:00Z — a slot no other spec consumes
  // (order-independent).
  const journeySlot = new Date(Date.parse(fixture.slot.startsAt) - 60 * 60_000).toISOString();

  // Guest browse: services → barber → BR-tz slot grid.
  await page.goto(`/booking?slug=${fixture.shop.slug}`);
  await expect(page.getByRole("heading", { name: "Escolha o serviço" })).toBeVisible();

  await page.getByRole("button", { name: /Corte/ }).click();
  await expect(page.getByRole("heading", { name: "Escolha o barbeiro" })).toBeVisible();

  await page.getByRole("button", { name: /corte/ }).click();
  await expect(page.getByRole("heading", { name: "Escolha o dia e horário" })).toBeVisible();

  await page.locator("#booking-date").fill(fixture.slot.date);
  await expect(page.getByRole("button", { name: "09:00" })).toBeVisible(); // 12:00Z
  await page.getByRole("button", { name: "09:00" }).click();

  await expect(page.getByRole("heading", { name: "Confirme seu agendamento" })).toBeVisible();
  await expect(page.getByText("Corte", { exact: true })).toBeVisible();
  await expect(page.getByText("09:00", { exact: true })).toBeVisible();

  // Guest confirm → login gate. The `next` must preserve the whole selection.
  await page.getByRole("button", { name: "Confirmar agendamento" }).click();
  await expect(page).toHaveURL(/\/login\?next=/);
  const nextPath = decodeURIComponent(new URL(page.url()).searchParams.get("next") ?? "");
  expect(nextPath).toContain(`slug=${fixture.shop.slug}`);
  expect(nextPath).toContain(`serviceId=${fixture.service.id}`);
  expect(nextPath).toContain(`barberId=${fixture.barber.id}`);
  expect(nextPath).toContain(`date=${fixture.slot.date}`);
  // The `next` value survives Next's two decode layers, so the slot instant is
  // fully decoded by the time it reaches the browser URL param.
  expect(nextPath).toContain(`slot=${journeySlot}`);

  // Sign in → back on the same confirm step with the selection intact.
  await page.getByLabel("E-mail").fill(fixture.client.email);
  await page.getByLabel("Senha").fill(fixture.client.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Confirme seu agendamento" })).toBeVisible();

  // Confirm again → booking created → waiting screen with the Pix QR.
  await page.getByRole("button", { name: "Confirmar agendamento" }).click();
  await expect(page.getByRole("heading", { name: "Aguardando pagamento" })).toBeVisible();

  const qr = page.getByRole("img", { name: "QR code Pix" });
  await expect(qr).toBeVisible(); // presence only — the payload is NOT decoded
  await expect(qr).toHaveAttribute("src", /^data:image\/png/);
  await expect(
    page.getByText("Aguardando confirmação do pagamento...", { exact: true }),
  ).toBeVisible();

  // Paid flip (design open question): the webhook path needs the real Mercado
  // Pago provider's external `getPayment` call, which cannot succeed with the
  // E2E fake token — the webhook → paid transition is proven at the integration
  // layer (payments-worker.test.ts). Here the admin marks the appointment paid
  // in a separate browser context so the client session (and its poller) is
  // untouched, and the poller must surface the paid status on screen.
  const appointmentId = new URL(page.url()).searchParams.get("appointmentId");
  expect(appointmentId).toBeTruthy();

  const adminContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
  try {
    const api = adminContext.request;
    const csrfResponse = await api.get("/api/auth/csrf");
    expect(csrfResponse.ok()).toBe(true);
    const { csrfToken } = (await csrfResponse.json()) as { csrfToken: string };
    const adminSignIn = await api.post("/api/auth/callback/credentials", {
      form: {
        csrfToken,
        email: fixture.admin.email,
        password: fixture.admin.password,
        callbackUrl: "/",
        json: "true",
      },
    });
    expect(adminSignIn.ok()).toBe(true);

    const payResponse = await api.post(`/api/admin/appointments/${appointmentId}/pay`);
    expect(payResponse.status()).toBe(200);
    await expect(payResponse.json()).resolves.toMatchObject({ paymentStatus: "paid" });
  } finally {
    await adminContext.close();
  }

  // The client-side poller picks the paid state up and shows the terminal copy.
  await expect(page.getByText("Pagamento recebido!", { exact: true })).toBeVisible();
});

test("a slot conflict returns the signed-in client to the slot step with PT-BR copy", async ({
  page,
}) => {
  const fixture = readFixture();

  await signInWithCredentials(page, fixture.client.email, fixture.client.password);

  // 12:30Z renders as 09:30 — a free slot the journey test never books (13:00Z),
  // so this test is order-independent.
  const slotStartsAt = new Date(Date.parse(fixture.slot.startsAt) - 30 * 60_000).toISOString();
  await browseToConfirm(page, fixture, "09:30");

  // Another booking takes the slot before the guest confirms.
  const conflict = await page.context().request.post("/api/bookings", {
    data: {
      serviceId: fixture.service.id,
      barberId: fixture.barber.id,
      startsAt: slotStartsAt,
    },
  });
  expect(conflict.status()).toBe(201);

  await page.getByRole("button", { name: "Confirmar agendamento" }).click();

  // 409 SLOT_CONFLICT → back on the slot step (contested slot dropped) with the
  // PT-BR conflict copy.
  await expect(page.getByRole("heading", { name: "Escolha o dia e horário" })).toBeVisible();
  expect(new URL(page.url()).searchParams.has("slot")).toBe(false);
  await expect(
    page.getByText("Este horário acabou de ser ocupado. Escolha outro horário.", { exact: true }),
  ).toBeVisible();
});