import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./apps/web", import.meta.url)),
    },
  },
  test: {
    env: {
      NODE_ENV: "test",
    },
    include: [
      "packages/*/src/**/*.test.ts",
      "apps/worker/src/**/*.test.ts",
      "apps/web/lib/**/*.test.ts",
      "apps/web/app/**/*.test.ts",
      "apps/web/app/**/*.test.tsx",
    ],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts", "apps/worker/src/**/*.ts"],
      exclude: ["**/*.test.ts", "**/dist/**", "**/node_modules/**"],
    },
  },
});
