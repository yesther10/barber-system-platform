import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const FIXTURE_PATH = "/tmp/opencode/barber-system-platform-e2e.json";

interface E2EFixture {
  admin: { email: string; password: string };
}

function readFixture(): E2EFixture {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as E2EFixture;
}

/**
 * Admin services page (admin-dashboard §Admin Services Page — "Create and
 * list a service"). The seeded fixture already provides a stable pre-existing
 * service ("Corte"), so the spec asserts both the seeded list and the
 * create → list-update flow without touching the fixture.
 */
test("admin creates a service and it appears in the list", async ({ page }) => {
  const fixture = readFixture();

  await page.goto("/login?next=%2Fservices");
  await page.getByLabel("E-mail").fill(fixture.admin.email);
  await page.getByLabel("Senha").fill(fixture.admin.password);
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page).toHaveURL(/\/services$/);

  // The seeded pre-existing service is listed.
  await expect(page.getByText("Corte")).toBeVisible();

  await page.getByLabel("Nome").fill("Barba Completa");
  await page.getByLabel("Preço (R$)").fill("50");
  await page.getByLabel("Duração (minutos)").fill("45");
  await page.getByRole("button", { name: "Criar serviço" }).click();

  // The created service appears in the list next to the seeded one.
  await expect(page.getByText("Barba Completa")).toBeVisible();
  await expect(page.getByText("Corte")).toBeVisible();
});