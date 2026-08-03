import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import { createClient } from "../../packages/db/src/index.js";
import type { PrismaClient } from "../../packages/db/src/index.js";
import { provisionOAuthUser } from "../../apps/web/lib/oauth.js";
import { CURRENT_CONSENT_POLICY_VERSION } from "../../apps/web/lib/consent.js";
import {
  ConsentRequiredError,
  EmailAlreadyRegisteredError,
  registerClient,
} from "../../apps/web/lib/register.js";
import {
  acceptInvite,
  createInvite,
  hashToken,
  InviteAlreadyUsedError,
  InviteEmailTakenError,
  InviteTokenError,
  signInviteToken,
} from "../../apps/web/lib/invites.js";
import {
  confirmsImmediately,
  getOnboardingSnapshot,
  OnboardingIncompleteError,
  onboardingStatus,
  requireOnboarded,
  TenantNotFoundError,
} from "../../apps/web/lib/onboarding.js";
import { authenticateCredentials } from "../../apps/web/lib/credentials.js";

/**
 * Auth+tenants integration suite (user-auth + tenant-management specs) against
 * a real MySQL 8 via Testcontainers: Google auto-provisioning with a consent
 * record, consent-gated registration, single-use barber invites, and tenant
 * onboarding status.
 */
async function startMysql() {
  const container = await new GenericContainer("mysql:8")
    .withExposedPorts(3306)
    .withEnvironment({
      MYSQL_USER: "test",
      MYSQL_PASSWORD: "test",
      MYSQL_DATABASE: "barberia_test",
      MYSQL_ROOT_PASSWORD: "test",
    })
    .start();
  const connectionString = `mysql://test:test@${container.getHost()}:${container.getMappedPort(3306)}/barberia_test?allowPublicKeyRetrieval=true`;
  return { container, connectionString };
}

function deployMigrations(connectionString: string) {
  execFileSync(resolve(process.cwd(), "packages/db/node_modules/.bin/prisma"), ["migrate", "deploy"], {
    cwd: resolve(process.cwd(), "packages/db"),
    env: { ...process.env, DATABASE_URL: connectionString },
    stdio: "pipe",
  });
}

describe("auth + tenants", () => {
  let container: StartedTestContainer;
  let connectionString: string;
  let prisma: PrismaClient;

  beforeAll(async () => {
    ({ container, connectionString } = await startMysql());
    deployMigrations(connectionString);
    prisma = createClient(connectionString);
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  describe("google oauth provisioning (user-auth spec)", () => {
    it("auto-provisions a new Google user as client with a consent record", async () => {
      const email = `google.${Date.now()}@example.com`;
      const sessionUser = await provisionOAuthUser(prisma, { email, name: "João Google" });

      expect(sessionUser).toMatchObject({ email, role: "client", barbershopId: null });

      const row = await prisma.user.findUnique({ where: { email } });
      expect(row?.role).toBe("CLIENT");
      expect(row?.consentAcceptedAt).not.toBeNull();
      expect(row?.consentPolicyVersion).toBe(CURRENT_CONSENT_POLICY_VERSION);
      expect(row?.passwordHash).toBeNull();
    });

    it("keeps the existing role for a returning Google user", async () => {
      const email = `admin.google.${Date.now()}@example.com`;
      await prisma.user.create({
        data: {
          email,
          name: "Admin Google",
          role: "BARBERSHOP_ADMIN",
          consentAcceptedAt: new Date(),
          consentPolicyVersion: CURRENT_CONSENT_POLICY_VERSION,
        },
      });

      const sessionUser = await provisionOAuthUser(prisma, { email, name: "Admin Google" });

      expect(sessionUser.role).toBe("barbershop_admin");
      const row = await prisma.user.findUnique({ where: { email } });
      expect(row?.role).toBe("BARBERSHOP_ADMIN");
    });
  });

  describe("consent-gated registration (user-auth spec)", () => {
    it("creates a client account with consent record and hashed password", async () => {
      const email = `register.${Date.now()}@example.com`;
      const result = await registerClient(
        prisma,
        {
          email,
          password: "s3nh4-segura",
          name: "Maria Silva",
          consent: true,
          consentPolicyVersion: "2026-07-31",
        },
        new Date("2026-08-03T12:00:00.000Z"),
      );

      expect(result).toMatchObject({ email, role: "client" });
      const row = await prisma.user.findUnique({ where: { email } });
      expect(row?.role).toBe("CLIENT");
      expect(row?.consentAcceptedAt?.toISOString()).toBe("2026-08-03T12:00:00.000Z");
      expect(row?.consentPolicyVersion).toBe("2026-07-31");
      expect(row?.passwordHash).toMatch(/^\$2[aby]\$\d{2}\$/);
      expect(row?.passwordHash).not.toContain("s3nh4-segura");
    });

    it("refuses registration without consent and creates no account", async () => {
      const email = `nocon sent.${Date.now()}@example.com`.replace(" ", "");
      await expect(
        registerClient(prisma, {
          email,
          password: "s3nh4-segura",
          name: "Sem Consentimento",
          consent: false,
          consentPolicyVersion: "2026-07-31",
        }),
      ).rejects.toThrow(ConsentRequiredError);

      const row = await prisma.user.findUnique({ where: { email } });
      expect(row).toBeNull();
    });

    it("rejects a duplicate email", async () => {
      const email = `dup.${Date.now()}@example.com`;
      await registerClient(prisma, {
        email,
        password: "s3nh4-segura",
        name: "Primeira",
        consent: true,
        consentPolicyVersion: "2026-07-31",
      });

      await expect(
        registerClient(prisma, {
          email,
          password: "outra-senha",
          name: "Segunda",
          consent: true,
          consentPolicyVersion: "2026-07-31",
        }),
      ).rejects.toThrow(EmailAlreadyRegisteredError);
    });
  });

  describe("single-use barber invites (user-auth spec)", () => {
    const SECRET = "integration-test-invite-secret";

    async function tenantFixture(tag: string) {
      return prisma.barbershop.create({
        data: { slug: `invite-shop-${tag}`, name: "Invite Shop", timezone: "America/Sao_Paulo" },
      });
    }

    it("accepts a valid invite once and creates a tenant-scoped barber", async () => {
      const shop = await tenantFixture(`once-${Date.now()}`);
      const email = `invited.${Date.now()}@example.com`;
      const token = await createInvite(prisma, { email, barbershopId: shop.id, secret: SECRET });

      const result = await acceptInvite(
        prisma,
        {
          token,
          name: "Carlos Ferreira",
          password: "s3nh4-segura",
          consent: true,
          consentPolicyVersion: "2026-07-31",
        },
        SECRET,
        new Date("2026-08-03T13:00:00.000Z"),
      );

      expect(result).toMatchObject({ email, role: "barber", barbershopId: shop.id });
      const user = await prisma.user.findUnique({ where: { email } });
      expect(user?.role).toBe("BARBER");
      expect(user?.barbershopId).toBe(shop.id);
      expect(user?.consentAcceptedAt?.toISOString()).toBe("2026-08-03T13:00:00.000Z");
      const profile = await prisma.barber.findUnique({ where: { userId: user?.id ?? "" } });
      expect(profile?.barbershopId).toBe(shop.id);

      const invite = await prisma.invite.findUnique({ where: { tokenHash: hashToken(token) } });
      expect(invite?.consumedAt?.toISOString()).toBe("2026-08-03T13:00:00.000Z");
    });

    it("rejects a reused invite token and creates nothing", async () => {
      const shop = await tenantFixture(`reuse-${Date.now()}`);
      const email = `reused.${Date.now()}@example.com`;
      const token = await createInvite(prisma, { email, barbershopId: shop.id, secret: SECRET });
      const payload = {
        token,
        name: "Carlos Ferreira",
        password: "s3nh4-segura",
        consent: true,
        consentPolicyVersion: "2026-07-31",
      };
      await acceptInvite(prisma, payload, SECRET);

      await expect(acceptInvite(prisma, payload, SECRET)).rejects.toThrow(InviteAlreadyUsedError);

      const users = await prisma.user.count({ where: { email } });
      expect(users).toBe(1);
      const barbers = await prisma.barber.count({ where: { barbershopId: shop.id } });
      expect(barbers).toBe(1);
    });

    it("rejects an invite whose email already has an account", async () => {
      const shop = await tenantFixture(`email-taken-${Date.now()}`);
      const email = `taken.${Date.now()}@example.com`;
      await prisma.user.create({
        data: { email, name: "Existing User", role: "CLIENT" },
      });
      const token = await createInvite(prisma, { email, barbershopId: shop.id, secret: SECRET });
      const payload = {
        token,
        name: "Carlos Ferreira",
        password: "s3nh4-segura",
        consent: true,
        consentPolicyVersion: "2026-07-31",
      };

      await expect(acceptInvite(prisma, payload, SECRET)).rejects.toThrow(InviteEmailTakenError);

      const barbers = await prisma.barber.count({ where: { barbershopId: shop.id } });
      expect(barbers).toBe(0);
      const invite = await prisma.invite.findUnique({ where: { tokenHash: hashToken(token) } });
      expect(invite?.consumedAt).toBeNull();
    });

    it("rejects an expired or forged invite token", async () => {
      const shop = await tenantFixture(`expired-${Date.now()}`);
      const email = `expired.${Date.now()}@example.com`;
      const expired = signInviteToken("inv_nope", email, SECRET, 60_000, Date.now() - 120_000);

      await expect(
        acceptInvite(
          prisma,
          { token: expired, name: "X", password: "s3nh4-segura", consent: true, consentPolicyVersion: "2026-07-31" },
          SECRET,
        ),
      ).rejects.toThrow(InviteTokenError);
      expect(await prisma.user.count({ where: { email } })).toBe(0);
      expect(await prisma.barber.count({ where: { barbershopId: shop.id } })).toBe(0);
    });
  });

  describe("tenant onboarding (tenant-management spec)", () => {
    async function tenantFixture(tag: string, mode: "AUTO" | "MANUAL" = "AUTO") {
      return prisma.barbershop.create({
        data: { slug: `onboard-shop-${tag}`, name: "Onboard Shop", timezone: "America/Sao_Paulo", confirmationMode: mode },
      });
    }

    it("guides an incomplete tenant through the missing setup steps", async () => {
      const shop = await tenantFixture(`incomplete-${Date.now()}`);
      const snapshot = await getOnboardingSnapshot(prisma, shop.id);

      expect(snapshot).toMatchObject({ serviceCount: 0, barberCount: 0, scheduleCount: 0, pixProvider: null });
      const status = onboardingStatus(snapshot);
      expect(status.complete).toBe(false);
      expect(status.missing).toEqual(["services", "barbers", "schedules", "pix"]);
      expect(status.nextStep).toBe("services");

      await expect(requireOnboarded(prisma, shop.id)).rejects.toThrow(OnboardingIncompleteError);
    });

    it("marks a tenant with full setup as complete and usable", async () => {
      const shop = await tenantFixture(`complete-${Date.now()}`, "MANUAL");
      const barberUser = await prisma.user.create({
        data: { email: `onboard.barber.${Date.now()}@example.com`, name: "B", role: "BARBER", barbershopId: shop.id },
      });
      await prisma.barber.create({ data: { barbershopId: shop.id, userId: barberUser.id, specialties: ["corte"] } });
      await prisma.service.create({ data: { barbershopId: shop.id, name: "Corte", priceBRL: 40, durationMinutes: 30 } });
      const barber = await prisma.barber.findUniqueOrThrow({ where: { userId: barberUser.id } });
      await prisma.schedule.create({
        data: { barberId: barber.id, dayOfWeek: 2, startTime: "09:00", endTime: "18:00" },
      });
      await prisma.barbershop.update({ where: { id: shop.id }, data: { pixProvider: "mercadopago" } });

      const snapshot = await getOnboardingSnapshot(prisma, shop.id);
      expect(snapshot).toMatchObject({ serviceCount: 1, barberCount: 1, scheduleCount: 1, pixProvider: "mercadopago" });
      expect(snapshot.confirmationMode).toBe("MANUAL");
      expect(onboardingStatus(snapshot).complete).toBe(true);
      await expect(requireOnboarded(prisma, shop.id)).resolves.toBeUndefined();
    });

    it("returns 404-equivalent for an unknown tenant", async () => {
      await expect(getOnboardingSnapshot(prisma, "no-such-tenant")).rejects.toThrow(TenantNotFoundError);
    });

    it("applies the tenant's confirmation mode to new appointments", () => {
      expect(confirmsImmediately("AUTO")).toBe(true);
      expect(confirmsImmediately("MANUAL")).toBe(false);
    });
  });

  describe("email/password sign-in (user-auth spec)", () => {
    it("authenticates a registered user and returns the session user", async () => {
      const email = `signin.${Date.now()}@example.com`;
      await registerClient(prisma, {
        email,
        password: "s3nh4-segura",
        name: "Maria Silva",
        consent: true,
        consentPolicyVersion: "2026-07-31",
      });

      const sessionUser = await authenticateCredentials(prisma, { email, password: "s3nh4-segura" });

      expect(sessionUser).toMatchObject({ email, role: "client", barbershopId: null });
    });

    it("rejects a wrong password", async () => {
      const email = `signin.wrong.${Date.now()}@example.com`;
      await registerClient(prisma, {
        email,
        password: "s3nh4-segura",
        name: "Maria Silva",
        consent: true,
        consentPolicyVersion: "2026-07-31",
      });

      await expect(
        authenticateCredentials(prisma, { email, password: "senha-errada" }),
      ).resolves.toBeNull();
    });
  });
});
