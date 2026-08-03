import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { GenericContainer, type StartedTestContainer } from "testcontainers";

/**
 * Testcontainers smoke — proves the worker can talk to a real Postgres lifted
 * on the fly. Future integration suites (booking atomicity, double-booking
 * conflict, cross-tenant isolation) build on this same harness.
 */
describe("postgres via testcontainers", () => {
  let container: StartedTestContainer;
  let client: Client;

  beforeAll(async () => {
    container = await new GenericContainer("postgres:16-alpine")
      .withExposedPorts(5432)
      .withEnvironment({
        POSTGRES_USER: "test",
        POSTGRES_PASSWORD: "test",
        POSTGRES_DB: "barberia_test",
      })
      .start();

    client = new Client({
      host: container.getHost(),
      port: container.getMappedPort(5432),
      user: "test",
      password: "test",
      database: "barberia_test",
    });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
    await container?.stop();
  });

  it("accepts connections and runs queries", async () => {
    const res = await client.query("SELECT 1 AS one");
    expect(res.rows[0]?.one).toBe(1);
  });
});