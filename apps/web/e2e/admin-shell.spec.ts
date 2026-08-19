import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const FIXTURE_PATH = "/tmp/opencode/barber-system-platform-e2e.json";

interface E2EFixture {
  admin: { email: string; password: string };
}

function readFixture(): E2EFixture {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as E2EFixture;
}

const NAV_LABELS = ["Início", "Serviços", "Barbeiros", "Horários", "Relatórios", "Convites", "Agenda"];

test("guest opening an admin page is redirected to /login with a next path", async ({ page }) => {
  await page.goto("/dashboard");

  await expect(page).toHaveURL(/\/login\?next=/);
  const nextPath = decodeURIComponent(new URL(page.url()).searchParams.get("next") ?? "");
  expect(nextPath).toBe("/dashboard");
});

test("logged-in admin sees the nav links and can sign out", async ({ page }) => {
  const fixture = readFixture();

  await page.goto("/login?next=%2Fdashboard");
  await page.getByLabel("E-mail").fill(fixture.admin.email);
  await page.getByLabel("Senha").fill(fixture.admin.password);
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  for (const label of NAV_LABELS) {
    await expect(page.getByRole("link", { name: label })).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Sair" })).toBeVisible();

  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
});