import { CURRENT_CONSENT_POLICY_VERSION } from "./consent";

export const PRIVACY_POLICY_VERSION = CURRENT_CONSENT_POLICY_VERSION;

export const PRIVACY_POLICY_SECTIONS = [
  {
    title: "Resumo da política",
    paragraphs: [
      "Esta política explica como a plataforma usa seus dados para cadastro, agendamentos, pagamentos Pix, notificações essenciais e atendimento da sua barbearia.",
      "Antes de aceitar qualquer consentimento, você pode ler esta versão completa, entender quais dados são necessários e quais direitos da LGPD ficam disponíveis para a sua conta.",
    ],
  },
  {
    title: "Quais dados coletamos",
    paragraphs: [
      "Coletamos o mínimo necessário para prestar o serviço: nome, e-mail, telefone quando informado, histórico de agendamentos, dados de pagamento vinculados ao atendimento e registros de consentimento.",
      "Os dados ficam armazenados em infraestrutura localizada no Brasil, com residência em São Paulo, conforme o desenho da plataforma.",
    ],
  },
  {
    title: "Como usamos seus dados",
    paragraphs: [
      "Usamos seus dados para criar a conta, autenticar acessos, reservar horários, emitir cobranças Pix, enviar confirmações e permitir que a barbearia administre seus atendimentos.",
      "Lembretes e outras comunicações não essenciais dependem do consentimento ativo do titular e são interrompidos quando o consentimento é retirado.",
    ],
  },
  {
    title: "Seus direitos na LGPD",
    paragraphs: [
      "Você pode solicitar exportação dos seus dados, pedir exclusão ou anonimização quando permitido por lei e retirar seu consentimento para comunicações não essenciais.",
      "Quando existir obrigação legal de retenção, a plataforma preserva somente os registros necessários e anonimiza os dados pessoais restantes.",
    ],
  },
] as const;
