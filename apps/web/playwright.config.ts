import { defineConfig, devices } from "@playwright/test";

const PORT = process.env.PORT ?? "3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  timeout: 30_000,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "on-first-retry",
  },
  webServer: {
    command: 'pnpm exec tsx "./e2e/start-server.ts"',
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
