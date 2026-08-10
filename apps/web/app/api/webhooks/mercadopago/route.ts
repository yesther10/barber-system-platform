import { NextResponse } from "next/server";
import { applyWebhookPayment, InvalidPaymentWebhookSignatureError } from "@barber/payments";
import { getPrisma } from "@/lib/db";
import { resolveWebhookProvider } from "@/lib/payments";

export const dynamic = "force-dynamic";

function getDataId(url: string, payload: Record<string, unknown>): string | null {
  const requestUrl = new URL(url);
  const queryId = requestUrl.searchParams.get("data.id");
  if (queryId) return queryId;
  const data = payload.data;
  if (data && typeof data === "object" && typeof (data as Record<string, unknown>).id === "string") {
    return (data as Record<string, string>).id;
  }
  return typeof payload.id === "string" ? payload.id : null;
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
  } catch {
    return NextResponse.json({ error: "INVALID_WEBHOOK" }, { status: 400 });
  }
  const dataId = getDataId(request.url, payload);
  const xSignature = request.headers.get("x-signature");
  const xRequestId = request.headers.get("x-request-id");
  if (!dataId || !xSignature || !xRequestId) {
    return NextResponse.json({ error: "INVALID_WEBHOOK" }, { status: 400 });
  }

  const resolved = await resolveWebhookProvider(getPrisma(), {
    dataId,
    xRequestId,
    xSignature,
    secret: "",
  });
  if (!resolved) {
    return NextResponse.json({ error: "INVALID_SIGNATURE" }, { status: 401 });
  }

  try {
    const result = await applyWebhookPayment(getPrisma(), resolved.provider, {
      dataId,
      providerEventId: typeof payload.id === "string" ? payload.id : dataId,
      secret: resolved.secret,
      xRequestId,
      xSignature,
    });
    return NextResponse.json({ ok: true, duplicate: result.duplicate });
  } catch (error) {
    if (error instanceof InvalidPaymentWebhookSignatureError) {
      return NextResponse.json({ error: "INVALID_SIGNATURE" }, { status: 401 });
    }
    throw error;
  }
}
