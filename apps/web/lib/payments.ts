import type { PrismaClient } from "@barber/db";
import { createMercadoPagoProvider, parseMercadoPagoCredentials, type PixProvider, type VerifyWebhookInput } from "@barber/payments";
import { PaymentConfigurationError } from "@barber/payments";

function createFakePixProvider(): PixProvider {
  return {
    name: "mercadopago",
    async createPayment(input) {
      return {
        id: `pix_${input.appointmentId}`,
        appointmentId: input.appointmentId,
        providerId: `provider_${input.appointmentId}`,
        status: "pending",
        qrCode: `00020126360014BR.GOV.BCB.PIX0114+551199999999520400005303986540545.005802BR5920Barberia E2E6009Sao Paulo62070503***6304${input.appointmentId.slice(0, 4)}`,
        qrCodeBase64: null,
        ticketUrl: null,
        expiresAt: "2026-10-07T15:30:00.000Z",
        raw: { fake: true },
      };
    },
    async getPayment(providerId) {
      return {
        id: providerId,
        appointmentId: providerId.replace(/^provider_/, ""),
        providerId,
        status: "approved",
        qrCode: null,
        qrCodeBase64: null,
        ticketUrl: null,
        expiresAt: "2026-10-07T15:30:00.000Z",
        raw: { fake: true },
      };
    },
    async refund(providerId) {
      return { id: `refund_${providerId}`, refunded: true };
    },
    async verifyWebhook() {
      return true;
    },
  };
}

export async function resolvePixProviderForAppointment(
  db: PrismaClient,
  appointmentId: string,
): Promise<PixProvider> {
  if (process.env.BARBER_FAKE_PIX === "1") {
    const appointment = await db.appointment.findUnique({ where: { id: appointmentId }, select: { id: true } });
    if (!appointment) {
      throw new PaymentConfigurationError("Pix credentials are not configured for this tenant");
    }
    return createFakePixProvider();
  }

  const appointment = await db.appointment.findUnique({
    where: { id: appointmentId },
    include: { barbershop: true },
  });
  const credentials = parseMercadoPagoCredentials(appointment?.barbershop.pixCredentials);
  if (!appointment || !credentials) {
    throw new PaymentConfigurationError("Pix credentials are not configured for this tenant");
  }
  return createMercadoPagoProvider(credentials);
}

export async function resolveWebhookProvider(
  db: PrismaClient,
  input: VerifyWebhookInput,
): Promise<{ provider: PixProvider; secret: string } | null> {
  const barbershops = await db.barbershop.findMany({
    where: { pixProvider: "mercado_pago" },
    select: { pixCredentials: true },
  });

  for (const barbershop of barbershops) {
    const credentials = parseMercadoPagoCredentials(barbershop.pixCredentials);
    if (!credentials?.webhookSecret) continue;
    const provider = createMercadoPagoProvider(credentials);
    const verified = await provider.verifyWebhook({ ...input, secret: credentials.webhookSecret });
    if (verified) return { provider, secret: credentials.webhookSecret };
  }

  return null;
}
