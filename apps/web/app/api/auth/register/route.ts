import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db";
import {
  ConsentRequiredError,
  EmailAlreadyRegisteredError,
  InvalidInputError,
  registerClient,
} from "@/lib/register";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/register — consent-gated client signup (user-auth spec).
 *
 * The contract refuses the payload when `consent` is not literally `true`,
 * so registration without consent returns 400 and creates no account.
 * Success returns the minimal RegisterResult (201); the client then signs
 * in through Auth.js Credentials.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  try {
    const result = await registerClient(getPrisma(), body);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof ConsentRequiredError || err instanceof InvalidInputError) {
      return NextResponse.json({ error: err.code }, { status: 400 });
    }
    if (err instanceof EmailAlreadyRegisteredError) {
      return NextResponse.json({ error: err.code }, { status: 409 });
    }
    throw err;
  }
}
