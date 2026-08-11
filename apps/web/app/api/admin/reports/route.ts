import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { ReportInvalidInputError, generateReport, renderReportCsv } from "@/lib/reporting";
import { guardAdmin } from "@/lib/route-auth";
import { TenantNotFoundError } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth();
  const guard = guardAdmin(session);
  if (!guard.ok) return NextResponse.json({ error: guard.code }, { status: guard.status });

  const search = new URL(request.url).searchParams;
  const format = search.get("format") ?? "json";
  if (format !== "json" && format !== "csv") {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  try {
    const report = await generateReport(getPrisma(), guard.barbershopId, {
      from: search.get("from"),
      to: search.get("to"),
      groupBy: search.get("groupBy") ?? undefined,
      barberId: search.get("barberId") ?? undefined,
      serviceId: search.get("serviceId") ?? undefined,
    });

    if (format === "csv") {
      return new Response(renderReportCsv(report), {
        status: 200,
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="report-${report.from}-${report.to}.csv"`,
        },
      });
    }

    return NextResponse.json(report);
  } catch (error) {
    if (error instanceof ReportInvalidInputError) {
      return NextResponse.json({ error: error.code }, { status: 400 });
    }
    if (error instanceof TenantNotFoundError) {
      return NextResponse.json({ error: error.code }, { status: 404 });
    }
    throw error;
  }
}
