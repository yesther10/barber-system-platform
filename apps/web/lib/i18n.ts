/**
 * Single-locale i18n for v1 — PT-BR UI copy, English code (design: i18n).
 * The dictionary is the only place user-facing strings live so a future
 * locale switch or rewrite is contained. `t()` is a typed variable lookup.
 */

export const LOCALE = "pt-BR" as const;

const ptBR = {
  common: {
    metaTitle: "Barberia — agendamento e gestão para barbearias",
    metaDescription:
      "Plataforma de agendamento online e gestão para barbearias: booking, Pix e relatórios.",
    appName: "Barberia",
    tagline: "Agende, gerencie e cresça sua barbearia em um só lugar.",
    ctaBooking: "Agendar horário",
  },
  health: {
    ok: "Serviço operacional",
  },
  booking: {
    stepServices: "Escolha o serviço",
    stepBarbers: "Escolha o barbeiro",
    stepDateSlot: "Escolha o dia e horário",
    stepConfirm: "Confirme seu agendamento",
    stepPayment: "Aguardando pagamento",
    loading: "Carregando...",
    emptyServices: "Nenhum serviço disponível no momento.",
    emptyBarbers: "Nenhum barbeiro disponível para este serviço.",
    emptySlots: "Nenhum horário disponível para esta data.",
    selectDate: "Selecione uma data",
    back: "Voltar",
    confirm: {
      service: "Serviço",
      barber: "Barbeiro",
      date: "Data",
      time: "Horário",
      price: "Valor",
      cta: "Confirmar agendamento",
      submitting: "Confirmando...",
    },
    errors: {
      tenantNotFound: "Barbearia não encontrada.",
      serviceNotFound: "Serviço não encontrado.",
      barberNotFound: "Barbeiro não encontrado.",
      pastDate: "Escolha uma data futura.",
      invalidInput: "Dados inválidos.",
      network: "Não foi possível carregar os dados. Tente novamente.",
      slotConflict: "Este horário acabou de ser ocupado. Escolha outro horário.",
      serviceInactive: "Este serviço não está mais disponível.",
      barberInactive: "Este barbeiro não está mais disponível.",
      sessionRequired: "Entre na sua conta para confirmar o agendamento.",
      paymentNotFound: "Não encontramos este pagamento.",
      pixUnavailable: "Não foi possível gerar o Pix no momento. Tente novamente.",
      providerUnavailable: "O provedor de pagamento está indisponível. Tente novamente.",
    },
  },
} as const;

export const translations = ptBR;

export type TranslationKey = keyof typeof ptBR.common;

export function t(key: TranslationKey): string {
  return ptBR.common[key];
}