import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      NODE_ENV: "test",
    },
    include: [
      "packages/*/src/**/*.test.ts",
      "apps/worker/src/**/*.test.ts",
      "apps/web/lib/**/*.test.ts",
    ],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts", "apps/worker/src/**/*.ts"],
      exclude: ["**/*.test.ts", "**/dist/**", "**/node_modules/**"],
    },
  },
});