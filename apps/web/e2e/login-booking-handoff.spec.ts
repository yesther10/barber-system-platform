import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const FIXTURE_PATH = "/tmp/opencode/barber-system-platform-e2e.json";

interface E2EFixture {
  shop: { slug: string };
  barber: { id: string };
  service: { id: string };
  slot: { startsAt: string; date: string };
}

function readFixture(): E2EFixture {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as E2EFixture;
}

async function registerUser(email: string, request: Parameters<typeof test>[0]["request"], password = "s3nh4-segura") {
  const response = await request.post("/api/auth/register", {
    data: {
      email,
      password,
      name: "Maria Silva",
      consent: true,
      consentPolicyVersion: "2026-07-31",
    },
  });

  expect(response.status()).toBe(201);

  return { email, password };
}

test("booking → login → return handoff works for credentials sign-in", async ({ page, request }) => {
  const fixture = readFixture();
  const credentials = await registerUser(`login-handoff-${Date.now()}@example.com`, request);

  // 13:30Z renders as "10:30" (São Paulo UTC-3). The suite shares one server
  // and one DB: the public-flow journey books 12:00Z ("09:00"), its conflict
  // test books 12:30Z ("09:30"), booking-qr books the seeded 13:00Z ("10:00")
  // and the fixture seeds a 14:00Z ("11:00") appointment — so this slot is
  // 30min after the last booked one and stays free in any order.
  const handoffSlot = new Date(Date.parse(fixture.slot.startsAt) + 30 * 60_000).toISOString();
  const handoffSlotLabel = "10:30";

  // Guest browse to the confirm step. There is NO static login gate on
  // /booking anymore — the gate fires at confirm, when createBooking returns
  // SESSION_REQUIRED and the flow hands off to /login?next=<full selection>.
  await page.goto(`/booking?slug=${fixture.shop.slug}`);
  await expect(page.getByRole("heading", { name: "Escolha o serviço" })).toBeVisible();

  await page.getByRole("button", { name: /Corte/ }).click();
  await expect(page.getByRole("heading", { name: "Escolha o barbeiro" })).toBeVisible();

  await page.getByRole("button", { name: /corte/ }).click();
  await expect(page.getByRole("heading", { name: "Escolha o dia e horário" })).toBeVisible();

  await page.locator("#booking-date").fill(fixture.slot.date);
  await page.getByRole("button", { name: handoffSlotLabel }).click();

  await expect(page.getByRole("heading", { name: "Confirme seu agendamento" })).toBeVisible();

  // Guest confirm → login gate. The `next` must carry the whole selection.
  await page.getByRole("button", { name: "Confirmar agendamento" }).click();
  await expect(page).toHaveURL(/\/login\?next=/);
  const nextPath = decodeURIComponent(new URL(page.url()).searchParams.get("next") ?? "");
  expect(nextPath).toContain(`slug=${fixture.shop.slug}`);
  expect(nextPath).toContain(`serviceId=${fixture.service.id}`);
  expect(nextPath).toContain(`barberId=${fixture.barber.id}`);
  expect(nextPath).toContain(`date=${fixture.slot.date}`);
  // The `next` value survives Next's two decode layers, so the slot instant is
  // fully decoded by the time it reaches the browser URL param.
  expect(nextPath).toContain(`slot=${handoffSlot}`);

  // Freshly-registered credentials → back on the SAME confirm step with the
  // selection intact.
  await page.getByLabel("E-mail").fill(credentials.email);
  await page.getByLabel("Senha").fill(credentials.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Confirme seu agendamento" })).toBeVisible();
  await expect(page.getByText(handoffSlotLabel, { exact: true })).toBeVisible();
});

test("invalid credentials stay on /login and show a clear error", async ({ page, request }) => {
  const credentials = await registerUser(`login-error-${Date.now()}@example.com`, request);

  await page.goto("/login");
  await page.getByLabel("E-mail").fill(credentials.email);
  await page.getByLabel("Senha").fill("senha-errada");
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText("E-mail ou senha inválidos.", { exact: true })).toBeVisible();
});

test("unsafe next targets fall back to the safe booking destination", async ({ page, request }) => {
  const credentials = await registerUser(`login-safe-${Date.now()}@example.com`, request);

  await page.goto("/login?next=https://evil.example");
  await page.getByLabel("E-mail").fill(credentials.email);
  await page.getByLabel("Senha").fill(credentials.password);
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page).toHaveURL(/\/booking$/);
});
