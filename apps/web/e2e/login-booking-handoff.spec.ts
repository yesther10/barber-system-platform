import { expect, test } from "@playwright/test";

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
  const credentials = await registerUser(`login-handoff-${Date.now()}@example.com`, request);

  await page.goto("/booking");
  await page.getByRole("link", { name: "Entrar para continuar" }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fbooking$/);

  await page.getByLabel("E-mail").fill(credentials.email);
  await page.getByLabel("Senha").fill(credentials.password);
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page).toHaveURL(/\/booking$/);
  await expect(page.getByRole("heading", { name: "Agendamento" })).toBeVisible();
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
