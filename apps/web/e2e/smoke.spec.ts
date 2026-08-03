import { expect, test } from "@playwright/test";

test("renders the public landing page with PT-BR brand", async ({ page }) => {
  await page.goto("/");
  const heading = page.getByRole("heading", { name: "Barberia", level: 1 });
  await expect(heading).toBeVisible();
});

test("health endpoint reports operational", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(body.ok).toBe(true);
});