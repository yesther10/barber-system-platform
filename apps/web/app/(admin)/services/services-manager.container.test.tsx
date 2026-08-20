// @vitest-environment happy-dom
/**
 * Mounted container tests for the admin services manager (admin-dashboard
 * §Admin Services Page). The manager is a client component with injected
 * `fetchFn` deps (booking-flow DI pattern): these tests prove the real
 * create/edit/deactivate/delete wiring against a mock fetch — the create
 * POSTs the parsed payload and updates the list, a delete conflict (409)
 * surfaces the deactivate guidance, an empty list renders the PT-BR empty
 * state, and an edit that does not touch `active` never reactivates a
 * deactivated service (Zod `.partial()` keeps `.default()` — a blind
 * re-send would inject `active: true`).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ServicesManager, { serviceUpdatePatch } from "./services-manager";
import type { ServiceView } from "@barber/contracts";

afterEach(() => cleanup());

const corte: ServiceView = {
  id: "svc_1",
  name: "Corte",
  description: "Tesoura e máquina",
  priceBRL: 45,
  durationMinutes: 30,
  active: true,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

const inactive: ServiceView = {
  ...corte,
  id: "svc_9",
  name: "Corte Antigo",
  active: false,
};

function okJson(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function errorResponse(error: string) {
  return { ok: false, status: 409, json: async () => ({ error }) } as Response;
}

function postBody(fetchFn: ReturnType<typeof vi.fn<typeof fetch>>): Record<string, unknown> {
  const [url, init] = fetchFn.mock.calls[0];
  return { url: String(url), ...(JSON.parse(String(init?.body)) as Record<string, unknown>) };
}

describe("services manager (mounted, injected fetch deps)", () => {
  it("renders the PT-BR empty state when the tenant has no services", () => {
    render(<ServicesManager initialServices={[]} deps={{ fetchFn: vi.fn() }} />);

    expect(screen.getByText("Nenhum serviço cadastrado ainda.")).toBeTruthy();
  });

  it("creates a service: POSTs the parsed payload and the new service appears in the list", async () => {
    const created: ServiceView = { ...corte, id: "svc_2", name: "Barba", priceBRL: 35, durationMinutes: 20 };
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(okJson(created));

    render(<ServicesManager initialServices={[corte]} deps={{ fetchFn }} />);

    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Barba" } });
    fireEvent.change(screen.getByLabelText("Preço (R$)"), { target: { value: "35" } });
    fireEvent.change(screen.getByLabelText("Duração (minutos)"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar serviço" }));

    expect(await screen.findByText("Barba")).toBeTruthy();
    // The pre-existing service stays listed next to the new one.
    expect(screen.getByText("Corte")).toBeTruthy();

    const { url, ...body } = postBody(fetchFn);
    expect(url).toBe("/api/admin/services");
    expect(body).toEqual({ name: "Barba", priceBRL: 35, durationMinutes: 20, active: true });
  });

  it("shows the client-side PT-BR error and does not fetch on an invalid create", async () => {
    const fetchFn = vi.fn<typeof fetch>();

    render(<ServicesManager initialServices={[corte]} deps={{ fetchFn }} />);
    fireEvent.click(screen.getByRole("button", { name: "Criar serviço" }));

    expect(
      await screen.findByText("Dados inválidos. Verifique as informações e tente novamente."),
    ).toBeTruthy();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("edits a service: PUTs the changed field plus active to the service URL", async () => {
    const updated: ServiceView = { ...corte, name: "Corte Degradê" };
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(okJson(updated));

    render(<ServicesManager initialServices={[corte]} deps={{ fetchFn }} />);

    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    // The form is prefilled with the current values.
    expect((screen.getByLabelText("Nome") as HTMLInputElement).value).toBe("Corte");
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Corte Degradê" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    expect(await screen.findByText("Corte Degradê")).toBeTruthy();
    expect(screen.queryByText("Corte")).toBeNull();

    const { url, ...body } = postBody(fetchFn);
    expect(url).toBe("/api/admin/services/svc_1");
    expect(body).toEqual({ name: "Corte Degradê", active: true });
  });

  it("never reactivates a deactivated service on an edit that does not touch active", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(okJson({ ...inactive, priceBRL: 60 }));

    render(<ServicesManager initialServices={[inactive]} deps={{ fetchFn }} />);

    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    // The active checkbox is prefilled unchecked for a deactivated service.
    expect((screen.getByLabelText("Ativo") as HTMLInputElement).checked).toBe(false);
    // Change only the price — leave active untouched.
    fireEvent.change(screen.getByLabelText("Preço (R$)"), { target: { value: "60" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));
    const { url, ...body } = postBody(fetchFn);
    expect(url).toBe("/api/admin/services/svc_9");
    expect(body).toEqual({ priceBRL: 60, active: false });
    // The payload keeps the deactivated state explicit so `ServiceUpdate`
    // safeParse (`.partial()` keeps `.default()`) can never inject a reactivation.
    expect(body.active).toBe(false);
  });

  it("sends active only when the user explicitly toggles it in the edit form", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(okJson({ ...corte, active: false }));

    render(<ServicesManager initialServices={[corte]} deps={{ fetchFn }} />);

    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    fireEvent.click(screen.getByLabelText("Ativo"));
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));
    const { url, ...body } = postBody(fetchFn);
    expect(url).toBe("/api/admin/services/svc_1");
    expect(body).toEqual({ active: false });
  });

  it("deactivates a service: PUTs {active:false} and marks it inactive in the list", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(okJson({ ...corte, active: false }));

    render(<ServicesManager initialServices={[corte]} deps={{ fetchFn }} />);

    fireEvent.click(screen.getByRole("button", { name: "Desativar" }));

    expect(await screen.findByText("Inativo")).toBeTruthy();
    const { url, ...body } = postBody(fetchFn);
    expect(url).toBe("/api/admin/services/svc_1");
    expect(body).toEqual({ active: false });
  });

  it("shows the deactivate guidance when deleting a service conflicts (409 SERVICE_IN_USE)", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(errorResponse("SERVICE_IN_USE"));

    render(<ServicesManager initialServices={[corte]} deps={{ fetchFn }} />);

    fireEvent.click(screen.getByRole("button", { name: "Excluir" }));

    expect(
      await screen.findByText(
        "Este serviço possui agendamentos e não pode ser excluído. Desative-o para deixá-lo indisponível para novos agendamentos.",
      ),
    ).toBeTruthy();
    expect(fetchFn.mock.calls[0][1]?.method).toBe("DELETE");
    expect(String(fetchFn.mock.calls[0][0])).toBe("/api/admin/services/svc_1");
  });

  it("deletes a service without conflicts: removes it and shows the empty state", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(okJson({ ok: true }));

    render(<ServicesManager initialServices={[corte]} deps={{ fetchFn }} />);

    fireEvent.click(screen.getByRole("button", { name: "Excluir" }));

    await waitFor(() => expect(screen.queryByText("Corte")).toBeNull());
    expect(screen.getByText("Nenhum serviço cadastrado ainda.")).toBeTruthy();
  });
});

describe("serviceUpdatePatch (pure)", () => {
  it("always carries active with the current stored value — never a default injection", () => {
    expect(
      serviceUpdatePatch(corte, { name: "Corte", priceBRL: "45", durationMinutes: "30", active: true }),
    ).toEqual({ active: true });
  });

  it("includes a changed field next to active, and active flips only when toggled", () => {
    expect(
      serviceUpdatePatch(corte, { name: "Corte", priceBRL: "60", durationMinutes: "30", active: true }),
    ).toEqual({ priceBRL: 60, active: true });
    expect(
      serviceUpdatePatch(corte, { name: "Corte", priceBRL: "45", durationMinutes: "30", active: false }),
    ).toEqual({ active: false });
  });
});