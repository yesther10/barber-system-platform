import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PrivacyPolicyPage from "../app/(public)/privacidade/page.js";
import { CURRENT_CONSENT_POLICY_VERSION } from "./consent.js";

describe("PrivacyPolicyPage", () => {
  it("renders the PT-BR privacy policy with the current version", () => {
    const html = renderToStaticMarkup(PrivacyPolicyPage());

    expect(html).toContain("Política de privacidade");
    expect(html).toContain(CURRENT_CONSENT_POLICY_VERSION);
    expect(html).toContain("Lei Geral de Proteção de Dados");
  });

  it("shows consent and LGPD rights before any consent capture", () => {
    const html = renderToStaticMarkup(PrivacyPolicyPage());

    expect(html).toContain("Antes de aceitar qualquer consentimento");
    expect(html).toContain("exportação dos seus dados");
    expect(html).toContain("exclusão ou anonimização");
  });
});
