import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const FIXTURE_PATH = "/tmp/opencode/barber-system-platform-e2e.json";

const CONSENT_VERSION = "2026-08-03";
const PASSWORD = "s3nh4-segura";

async function fillRegisterForm(
  page: Parameters<typeof test>[0]["page"],
  { name, email, password, confirmPassword, consent }: {
    name: string;
    email: string;
    password: string;
    confirmPassword: string;
    consent: boolean;
  },
) {
  await page.getByLabel("Nome").fill(name);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByLabel("Confirmar senha").fill(confirmPassword);
  if (consent) {
    await page.getByRole("checkbox", { name: /política de privacidade/i }).check();
  }
  await page.getByRole("button", { name: "Criar conta" }).click();
}

test("guest registers and is auto-signed-in to the sanitized destination", async ({ page }) => {
  await page.goto("/register?next=/booking?step=confirm");

  await fillRegisterForm(page, {
    name: "João Cliente",
    email: `reg-flow-${Date.now()}@example.com`,
    password: PASSWORD,
    confirmPassword: PASSWORD,
    consent: true,
  });

  // The booking step is DERIVED from the URL selection (booking design: URL
  // state decision) — `step=confirm` is not part of the selection, so the
  // sanitized redirect keeps pathname+search (/booking?step=confirm). An empty
  // selection now renders the directory picker ("tenant") — the delta spec's
  // safe-default: a navigable picker state, never a dead end.
  await expect(page).toHaveURL(/\/booking\?step=confirm$/);
  await expect(page.getByRole("heading", { name: "Escolha a barbearia" })).toBeVisible();
  const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as {
    shop: { name: string };
  };
  await expect(page.getByRole("button", { name: fixture.shop.name })).toBeVisible();
});

test("unsafe next targets fall back to the safe booking destination", async ({ page }) => {
  await page.goto("/register?next=https://evil.example");

  await fillRegisterForm(page, {
    name: "João Cliente",
    email: `reg-safe-${Date.now()}@example.com`,
    password: PASSWORD,
    confirmPassword: PASSWORD,
    consent: true,
  });

  await expect(page).toHaveURL(/\/booking$/);
});

test("duplicate e-mail shows a clear error on the e-mail field", async ({ page, request }) => {
  const email = `reg-dup-${Date.now()}@example.com`;
  const seeded = await request.post("/api/auth/register", {
    data: {
      email,
      password: PASSWORD,
      name: "Maria Silva",
      consent: true,
      consentPolicyVersion: CONSENT_VERSION,
    },
  });
  expect(seeded.status()).toBe(201);

  await page.goto("/register");
  await fillRegisterForm(page, {
    name: "João Cliente",
    email,
    password: PASSWORD,
    confirmPassword: PASSWORD,
    consent: true,
  });

  await expect(page).toHaveURL(/\/register$/);
  await expect(page.getByText("e-mail já cadastrado", { exact: true })).toBeVisible();
});

test("password mismatch blocks submission with a confirm-password error", async ({ page }) => {
  await page.goto("/register");
  await fillRegisterForm(page, {
    name: "João Cliente",
    email: `reg-mismatch-${Date.now()}@example.com`,
    password: PASSWORD,
    confirmPassword: "senha-diferente",
    consent: true,
  });

  await expect(page).toHaveURL(/\/register$/);
  await expect(page.getByText("As senhas não coincidem.", { exact: true })).toBeVisible();
});

test("unchecked consent blocks submission with a consent error", async ({ page }) => {
  await page.goto("/register");
  await fillRegisterForm(page, {
    name: "João Cliente",
    email: `reg-consent-${Date.now()}@example.com`,
    password: PASSWORD,
    confirmPassword: PASSWORD,
    consent: false,
  });

  await expect(page).toHaveURL(/\/register$/);
  await expect(
    page.getByText("É preciso aceitar a política de privacidade para continuar.", { exact: true }),
  ).toBeVisible();
});