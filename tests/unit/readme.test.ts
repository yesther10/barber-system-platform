import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(import.meta.dirname, "../..");

function readRepoFile(relativePath: string) {
  return readFileSync(resolve(REPO_ROOT, relativePath), "utf8");
}

describe("workspace verification docs", () => {
  it("documents the full verified runtime command in the README", () => {
    const readme = readRepoFile("README.md");

    expect(readme).toContain("pnpm verify:full");
    expect(readme).toContain("pnpm test && pnpm test:integration && pnpm test:e2e && pnpm typecheck && pnpm lint && pnpm build");
  });

  it("keeps the full verification script and runtime prerequisites aligned", () => {
    const packageJson = JSON.parse(readRepoFile("package.json")) as {
      scripts?: Record<string, string>;
    };
    const readme = readRepoFile("README.md");

    expect(packageJson.scripts?.["verify:full"]).toBe(
      "pnpm test && pnpm test:integration && pnpm test:e2e && pnpm typecheck && pnpm lint && pnpm build",
    );
    expect(readme).toContain("Docker for integration tests");
    expect(readme).toContain("pnpm exec playwright install --with-deps chromium");
  });
});
