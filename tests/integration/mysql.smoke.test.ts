import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mariadb from "mariadb";
import { GenericContainer, type StartedTestContainer } from "testcontainers";

/**
 * Testcontainers smoke — proves the worker can talk to a real MySQL lifted
 * on the fly. Future integration suites (booking atomicity, double-booking
 * conflict, cross-tenant isolation) build on this same harness.
 */
describe("mysql via testcontainers", () => {
  let container: StartedTestContainer;
  let conn: mariadb.PoolConnection;

  beforeAll(async () => {
    container = await new GenericContainer("mysql:8")
      .withExposedPorts(3306)
      .withEnvironment({
        MYSQL_USER: "test",
        MYSQL_PASSWORD: "test",
        MYSQL_DATABASE: "barberia_test",
        MYSQL_ROOT_PASSWORD: "test",
      })
      .start();

    conn = await mariadb.createConnection({
      host: container.getHost(),
      port: container.getMappedPort(3306),
      user: "test",
      password: "test",
      database: "barberia_test",
      allowPublicKeyRetrieval: true,
    });
  });

  afterAll(async () => {
    await conn?.end();
    await container?.stop();
  });

  it("accepts connections and runs queries", async () => {
    const rows = await conn.query("SELECT 1 AS one");
    // mariadb returns BIGINT (SELECT 1) as BigInt.
    expect(rows[0].one).toBe(1n);
  });
});
