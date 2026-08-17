// Prisma 7 configuration — the datasource URL lives here, not in schema.prisma.
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { defineConfig } from "prisma/config";

loadEnv({ path: resolve(import.meta.dirname, "../../.env") });
loadEnv();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
