import { describe, expect, it } from "vitest";
import { ReportQuery, ReportResponse, ReportRow } from "./reporting.js";

describe("reporting contracts", () => {
  it("parses a report query with a default grouping of none", () => {
    const parsed = ReportQuery.safeParse({
      from: "2026-08-01",
      to: "2026-08-07",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.groupBy).toBe("none");
  });

  it("rejects a report query with malformed dates", () => {
    expect(
      ReportQuery.safeParse({ from: "01/08/2026", to: "2026-08-07" }).success,
    ).toBe(false);
  });

  it("parses a report row with rates between zero and one", () => {
    const parsed = ReportRow.safeParse({
      groupKey: "all",
      total: 10,
      pending: 2,
      confirmed: 3,
      completed: 4,
      cancelled: 1,
      completionRate: 0.4,
      cancellationRate: 0.1,
      revenueBRL: 180.5,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.revenueBRL).toBe(180.5);
  });

  it("rejects a row with an out-of-range rate", () => {
    expect(
      ReportRow.safeParse({
        groupKey: "all",
        total: 10,
        pending: 0,
        confirmed: 0,
        completed: 0,
        cancelled: 0,
        completionRate: 1.5,
        cancellationRate: 0,
        revenueBRL: 0,
      }).success,
    ).toBe(false);
  });

  it("parses a report response with rows, including an empty (zeroed) period", () => {
    const withRows = ReportResponse.safeParse({
      from: "2026-08-01",
      to: "2026-08-07",
      rows: [{ groupKey: "all", total: 1, pending: 1, confirmed: 0, completed: 0, cancelled: 0, completionRate: 0, cancellationRate: 0, revenueBRL: 0 }],
    });
    expect(withRows.success).toBe(true);

    const empty = ReportResponse.safeParse({ from: "2026-08-01", to: "2026-08-07", rows: [] });
    expect(empty.success).toBe(true);
    if (empty.success) expect(empty.data.rows).toHaveLength(0);
  });
});
