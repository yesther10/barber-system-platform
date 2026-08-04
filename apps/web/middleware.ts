/**
 * Edge middleware — role/session enforcement (user-auth spec, task 3.3).
 *
 * Uses the edge-safe `authConfig` (JWT-only, no DB) so sessions are decoded
 * without touching Prisma in the edge runtime. Applies the pure rules from
 * `lib/middleware-rules`: /api/admin/* → 403 without the barbershop_admin
 * role; /api/bookings* → 401 without a session. Everything else passes.
 */
import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";
import { decideProtection } from "@/lib/middleware-rules";

const { auth } = NextAuth(authConfig);

export default auth((request) => {
  const decision = decideProtection(request.nextUrl.pathname, request.auth?.user ?? null);
  if (decision.kind === "block") {
    return NextResponse.json({ error: decision.code }, { status: decision.status });
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/api/admin/:path*", "/api/bookings/:path*"],
};
