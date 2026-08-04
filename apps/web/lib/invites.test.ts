import { describe, expect, it } from "vitest";
import {
  InviteConsentRequiredError,
  InviteTokenError,
  parseInviteAcceptance,
  signInviteToken,
  verifyInviteToken,
} from "./invites.js";

const SECRET = "test-secret-for-invites";
const INVITE_ID = "inv_123";
const EMAIL = "barbeiro@example.com";

describe("signInviteToken / verifyInviteToken", () => {
  it("round-trips a valid token to its invite id and email", () => {
    const token = signInviteToken(INVITE_ID, EMAIL, SECRET, 7 * 24 * 60 * 60 * 1000);
    const verified = verifyInviteToken(token, SECRET);
    expect(verified).toEqual({ inviteId: INVITE_ID, email: EMAIL });
  });

  it("rejects a token with a tampered signature", () => {
    const token = signInviteToken(INVITE_ID, EMAIL, SECRET, 7 * 24 * 60 * 60 * 1000);
    const [body, sig] = token.split(".");
    const tampered = `${body}.${sig?.slice(0, -1)}x`;
    expect(() => verifyInviteToken(tampered, SECRET)).toThrow(InviteTokenError);
  });

  it("rejects a token signed with a different secret", () => {
    const token = signInviteToken(INVITE_ID, EMAIL, SECRET, 7 * 24 * 60 * 60 * 1000);
    expect(() => verifyInviteToken(token, "other-secret")).toThrow(InviteTokenError);
  });

  it("rejects an expired token", () => {
    const token = signInviteToken(INVITE_ID, EMAIL, SECRET, 60 * 1000, Date.now() - 120 * 1000);
    expect(() => verifyInviteToken(token, SECRET)).toThrow(InviteTokenError);
  });

  it("rejects a malformed token", () => {
    expect(() => verifyInviteToken("no-dot-here", SECRET)).toThrow(InviteTokenError);
    expect(() => verifyInviteToken("", SECRET)).toThrow(InviteTokenError);
  });
});

describe("parseInviteAcceptance", () => {
  const valid = {
    token: "a".repeat(64),
    name: "Carlos Ferreira",
    password: "s3nh4-segura",
    consent: true,
    consentPolicyVersion: "2026-07-31",
  };

  it("accepts a valid payload with explicit consent", () => {
    const parsed = parseInviteAcceptance(valid);
    expect(parsed.name).toBe("Carlos Ferreira");
  });

  it("rejects an acceptance without consent", () => {
    expect(() => parseInviteAcceptance({ ...valid, consent: false })).toThrow(InviteConsentRequiredError);
  });

  it("rejects a payload with a weak password or short token", () => {
    expect(() => parseInviteAcceptance({ ...valid, password: "curta" })).toThrow(InviteTokenError);
    expect(() => parseInviteAcceptance({ ...valid, token: "short" })).toThrow(InviteTokenError);
  });
});
