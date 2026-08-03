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
} as const;

export const translations = ptBR;

export type TranslationKey = keyof typeof ptBR.common;

export function t(key: TranslationKey): string {
  return ptBR.common[key];
}