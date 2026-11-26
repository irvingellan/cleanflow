import { act, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CleanerHubApp, normalizeHubTheme } from "./CleanerHubApp.jsx";
import { localDateKey, addDaysToKey } from "./cleanerAgendaModel.js";
import { cleanerStartupTimeoutMs, serverVerifyIntervalMs, useCleanerHub } from "./useCleanerHub.js";

const today = localDateKey(new Date());
const tomorrow = addDaysToKey(today, 1);

function fakeService({ session = { status: "signed-in", uid: "u1", organizationId: "org", cleanerId: "ana", sessionId: "session-a" } } = {}) {
  const handlers = {};
  const service = {
    subscribeCleanerSession: vi.fn((callback) => { handlers.session = callback; callback(session); return () => {}; }),
    subscribeMembership: vi.fn((_scope, callback) => { handlers.membership = callback; callback({ state: "active", displayName: "Ana", preferredLanguage: "pt" }); return () => {}; }),
    subscribeAgenda: vi.fn((_scope, onAgenda, onError) => { handlers.agenda = onAgenda; handlers.agendaError = onError; return () => {}; }),
    redeemAccessCode: vi.fn(async () => {}),
    signOutCleaner: vi.fn(async () => {}),
    openMyChecklist: vi.fn(async () => ({ state: "not-ready" })),
    respondToAgendaReschedule: vi.fn(async (_jobId, { decision, scheduleRevision }) => ({ state: decision, scheduleRevision })),
    respondToMyOffer: vi.fn(async () => ({ state: "answered", status: "INTERESTED" })),
    reconnectAgenda: vi.fn(async () => {}),
  };
  return { service, handlers };
}

const entries = [
  { id: "ana__j1", kind: "ASSIGNED", jobId: "j1", cleanerId: "ana", jobStatus: "ASSIGNED", propertyName: "Maple Example House", scheduledDate: tomorrow, scheduledStart: "10:30", acknowledged: false },
  { id: "ana__j2", kind: "OFFER", jobId: "j2", cleanerId: "ana", jobStatus: "OFFERED", offerStatus: "INTERESTED", propertyName: "Birch Example Flat", scheduledDate: tomorrow, scheduledStart: "09:00", offeredCompensation: 140, offerExpiresAtMs: Date.now() + 86_400_000 },
  { id: "chg1", kind: "CHANGE", cleanerId: "ana", change: "UNASSIGNED", propertyName: "Cedar Example Loft", from: { date: today, start: "08:00" }, to: null, atMs: Date.now() - 1000 },
];

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem("cleanflow.cleanerHub.onboarded", "u1");
  window.localStorage.setItem("cleanflow.cleanerHub.language", "pt");
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("CleanerHubApp (live data boundary)", () => {
  it("shows progress, start time and a countdown on the assigned NowCard until check-in", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-25T21:42:00Z"));
    const { service, handlers } = fakeService();
    const entry = {
      ...entries[0], scheduledDate: "2026-11-25", jobStatus: "IN_PROGRESS",
      startedAtMs: Date.parse("2026-11-25T19:34:00Z"), guestCheckInTime: "15:00",
      checklist: { status: "DRAFT", started: true, answeredItems: 22, totalItems: 30, photoCount: 9 },
    };
    render(<CleanerHubApp hubOptions={{ service }} />);
    act(() => handlers.agenda({ entries: [entry], fromCache: false }));
    const card = within(screen.getByRole("region", { name: "Limpando agora" }));
    expect(card.getByText("desde 11:34")).toBeVisible();
    expect(card.getByText(/22 de 30 itens · 9 fotos/)).toBeVisible();
    expect(card.getByRole("img", { name: "22 de 30 itens respondidos" })).toBeVisible();
    expect(card.getByText("Hóspede entra às 15:00 · faltam 1h18")).toBeVisible();
    act(() => vi.advanceTimersByTime(78 * 60000));
    expect(card.queryByText(/Hóspede entra/)).not.toBeInTheDocument();
  });

  it("omits missing facts on older NowCard entries", () => {
    const { service, handlers } = fakeService();
    render(<CleanerHubApp hubOptions={{ service }} />);
    act(() => handlers.agenda({ entries: [{ ...entries[0], scheduledDate: today, jobStatus: "IN_PROGRESS" }], fromCache: false }));
    const card = within(screen.getByRole("region", { name: "Limpando agora" }));
    expect(card.queryByText(/desde|Última sincronização|Hóspede entra/)).not.toBeInTheDocument();
    expect(card.queryByRole("img")).not.toBeInTheDocument();
  });

  it.each([
    ["Agendadas", entries[0]],
    ["Ofertas", entries[1]],
  ])("shows service, address, schedule and pay on the %s card, with notes in detail", async (tab, original) => {
    const { service, handlers } = fakeService();
    const entry = {
      ...original, offerStatus: original.kind === "OFFER" ? "PENDING" : null,
      serviceType: "POST_CONSTRUCTION", address: "Rua de Exemplo, unidade fictícia",
      notes: "Use the demonstration checklist.", offeredCompensation: 132.75, scheduledStart: "14:30",
    };
    render(<CleanerHubApp hubOptions={{ service }} />);
    act(() => handlers.agenda({ entries: [entry], fromCache: false }));
    await userEvent.click(screen.getByRole("button", { name: new RegExp(`^${tab}`) }));
    const card = screen.getByRole("button", { name: /Pós-obra/ });
    expect(card).toHaveTextContent(entry.address);
    const date = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(`${tomorrow}T12:00:00`));
    expect(card).toHaveTextContent(date);
    expect(card).toHaveTextContent("14:30");
    if (entry.kind === "ASSIGNED") expect(card).toHaveTextContent(/US\$\s*132,75/);

    await userEvent.click(card);
    expect(screen.getByText("Tipo de serviço")).toBeVisible();
    expect(screen.getByText("Pós-obra")).toBeVisible();
    expect(screen.getByText(/US\$\s*132,75/)).toBeVisible();
    expect(screen.getByText("Instruções", { exact: true })).toBeVisible();
    expect(screen.getByText(entry.notes)).toBeVisible();
  });

  it.each([["Ofertas", entries[1]], ["Agendadas", entries[0]]])("shows the agreed hourly rate on the %s card and detail", async (tab, original) => {
    const { service, handlers } = fakeService();
    const entry = { ...original, offeredCompensation: undefined, offeredPay: { mode: "HOURLY", rateCents: 3125 } };
    render(<CleanerHubApp hubOptions={{ service }} />);
    act(() => handlers.agenda({ entries: [entry], fromCache: false }));
    await userEvent.click(screen.getByRole("button", { name: new RegExp(`^${tab}`) }));
    const card = screen.getByRole("button", { name: /31,25 por hora/ });
    await userEvent.click(card);
    expect(screen.getByText(/31,25 por hora/)).toBeVisible();
    if (entry.kind === "OFFER") expect(screen.getByText(/Você informa suas horas no final do serviço/)).toBeVisible();
  });

  it("shows only the cleaner's share, then replaces the conditional extra with her confirmed amount", async () => {
    const { service, handlers } = fakeService();
    const offer = { ...entries[1], offeredCompensation: 33.33, offeredFirstSlotExtraCents: 1, offeredPayEstimated: true,
      cleanerPayout: 100, clientPrice: 290 };
    render(<CleanerHubApp hubOptions={{ service }} />);
    act(() => handlers.agenda({ entries: [offer], fromCache: false }));
    await userEvent.click(screen.getByRole("button", { name: /^Ofertas/ }));
    const card = screen.getByRole("button", { name: /33,33/ });
    expect(card).toHaveTextContent(/0,01 se a primeira vaga for sua/);
    expect(card).toHaveTextContent("Estimativa com base no tamanho previsto da equipe");
    await userEvent.click(card);
    const main = screen.getByRole("main");
    expect(main).toHaveTextContent(/33,33.*0,01 se a primeira vaga for sua/);
    const assigned = { ...entries[0], jobId: offer.jobId, propertyName: offer.propertyName,
      offeredCompensation: 33.34, cleanerPayout: 100, clientPrice: 290 };
    act(() => handlers.agenda({ entries: [assigned], fromCache: false }));
    expect(main).toHaveTextContent(/33,34/);
    expect(main).not.toHaveTextContent(/primeira vaga|33,33|100|290/);
  });

  it("identifies a removed service using its last confirmed details and discards its private fields", async () => {
    const { service, handlers } = fakeService();
    const entry = { ...entries[0], notes: "Synthetic checklist instructions", offeredCompensation: 132.75 };
    render(<CleanerHubApp hubOptions={{ service }} />);
    act(() => handlers.agenda({ entries: [entry], fromCache: false }));
    await userEvent.click(screen.getByRole("button", { name: /Maple Example House/ }));
    const latest = { ...entry, propertyName: "Synthetic Studio", scheduledDate: tomorrow, scheduledStart: "14:45" };
    act(() => handlers.agenda({ entries: [latest], fromCache: false }));
    expect(screen.getByText(entry.notes)).toBeVisible();
    act(() => handlers.agenda({ entries: [], fromCache: false }));
    const main = screen.getByRole("main");
    expect(main).toHaveTextContent("Synthetic Studio");
    expect(main).toHaveTextContent("14:45");
    expect(main).not.toHaveTextContent("Maple Example House");
    expect(main).not.toHaveTextContent(entry.notes);
    expect(main).not.toHaveTextContent("132,75");
    expect(screen.queryByRole("button", { name: "Abrir checklist" })).not.toBeInTheDocument();

    // A second server-confirmed session on the same phone may retain onboarding, not the removal context.
    act(() => handlers.session({ status: "signed-in", uid: "u1", organizationId: "other-org", cleanerId: "other-cleaner", sessionId: "session-other" }));
    act(() => handlers.agenda({ entries: [], fromCache: false }));
    expect(screen.getByRole("main")).not.toHaveTextContent("Synthetic Studio");
    expect(screen.getByRole("main")).not.toHaveTextContent("14:45");
  });

  it("falls back to the generic message when an opened Job has no service identity", async () => {
    const { service, handlers } = fakeService();
    const entry = { ...entries[0], propertyName: null, scheduledDate: null, scheduledStart: null };
    render(<CleanerHubApp hubOptions={{ service }} />);
    act(() => handlers.agenda({ entries: [entry], fromCache: false }));
    await userEvent.click(screen.getByRole("button", { name: /^Agendadas/ }));
    await userEvent.click(document.querySelector('[data-job-id="j1"]'));
    act(() => handlers.agenda({ entries: [], fromCache: false }));
    expect(screen.getByText("Este serviço não está mais na sua agenda.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Abrir checklist" })).not.toBeInTheDocument();
  });

  it.each([
    ["JOB", "JOB_ASSIGNED", "j1", "Maple Example House", "Abrir checklist"],
    ["OFFER", "OFFER_CREATED", "j2", "Birch Example Flat", "Tenho interesse"],
  ])("preserves Inbox deep links to %s after the visual port", async (kind, type, jobId, label, action) => {
    const previous = window.location.href;
    window.history.replaceState(null, "", "/agenda?inbox=1");
    const { service, handlers } = fakeService();
    const inboxService = {
      list: vi.fn().mockResolvedValue({ items: [{ id: "event-1", type, read: false, serviceLabel: label, openable: true }], unreadCount: 1 }),
      open: vi.fn().mockResolvedValue({ state: "opened", destination: { kind, jobId } }),
    };
    try {
      render(<CleanerHubApp hubOptions={{ service, inboxService }} />);
      act(() => handlers.agenda({ entries: entries.map((entry) => entry.kind === "OFFER" ? { ...entry, offerStatus: "PENDING" } : entry), fromCache: false }));
      expect(screen.getByRole("heading", { name: "Caixa de entrada" })).toBeInTheDocument();
      await userEvent.click(await screen.findByRole("button", { name: "Abrir" }));
      expect(inboxService.open).toHaveBeenCalledWith("CLEANER", "event-1");
      expect(screen.getByRole("heading", { name: label })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: action })).toBeInTheDocument();
    } finally {
      window.history.replaceState(null, "", previous);
    }
  });

  it("discards a pending checklist result after the session changes", async () => {
    const { service, handlers } = fakeService();
    let completeOldRequest;
    service.openMyChecklist.mockImplementation(() => new Promise((resolve) => { completeOldRequest = resolve; }));
    render(<CleanerHubApp hubOptions={{ service }} />);
    act(() => handlers.agenda({ entries, fromCache: false }));
    await userEvent.click(document.querySelector('[data-job-id="j1"]'));
    await userEvent.click(screen.getByRole("button", { name: "Abrir checklist" }));
    expect(screen.getByRole("button", { name: "Abrindo…" })).toBeDisabled();
    act(() => handlers.session({ status: "signed-in", uid: "u1", organizationId: "org", cleanerId: "ana", sessionId: "session-b" }));
    act(() => handlers.agenda({ entries, fromCache: false }));
    expect(screen.getByRole("button", { name: "Abrir checklist" })).toBeEnabled();
    await act(() => completeOldRequest({ state: "not-ready" }));
    expect(screen.queryByText("O checklist não está disponível para este serviço.")).toBeNull();
  });

  it("drops the previous account's Job detail while a different cleaner signs in", async () => {
    const { service, handlers } = fakeService();
    render(<CleanerHubApp hubOptions={{ service }} />);
    act(() => handlers.agenda({ entries, fromCache: false }));
    await userEvent.click(document.querySelector('[data-job-id="j1"]'));
    await userEvent.click(screen.getByRole("button", { name: "Abrir checklist" }));
    expect(await screen.findByText("O checklist não está disponível para este serviço.")).toBeInTheDocument();
    act(() => handlers.session({ status: "signed-in", uid: "u2", organizationId: "other-org", cleanerId: "bia", sessionId: "session-c" }));
    expect(screen.queryByText("Maple Example House")).toBeNull();
    expect(screen.queryByText("O checklist não está disponível para este serviço.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Abrir checklist" })).toBeNull();
  });

  it("does not carry a checklist result into another Job opened from the Inbox", async () => {
    const { service, handlers } = fakeService();
    const second = { ...entries[0], id: "ana__j3", jobId: "j3", propertyName: "Oak Example House" };
    const inboxService = {
      list: vi.fn().mockResolvedValue({ items: [{ id: "event-3", type: "JOB_ASSIGNED", read: false, serviceLabel: second.propertyName, openable: true }], unreadCount: 1 }),
      open: vi.fn().mockResolvedValue({ state: "opened", destination: { kind: "JOB", jobId: "j3" } }),
    };
    render(<CleanerHubApp hubOptions={{ service, inboxService }} />);
    act(() => handlers.agenda({ entries: [...entries, second], fromCache: false }));
    await userEvent.click(document.querySelector('[data-job-id="j1"]'));
    await userEvent.click(screen.getByRole("button", { name: "Abrir checklist" }));
    expect(await screen.findByText("O checklist não está disponível para este serviço.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Caixa de entrada/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Abrir" }));
    expect(screen.getByRole("heading", { name: second.propertyName })).toBeInTheDocument();
    expect(screen.queryByText("O checklist não está disponível para este serviço.")).toBeNull();
  });

  it("keeps the agenda active and ignores an Inbox deep link on the rollback build", () => {
    vi.stubEnv("VITE_NOTIFICATION_INBOX_MODE", "disabled");
    const previous = window.location.href;
    window.history.replaceState(null, "", "/agenda?inbox=1");
    const { service, handlers } = fakeService();
    const inboxService = { list: vi.fn().mockResolvedValue({ items: [], unreadCount: 0 }) };
    try {
      render(<CleanerHubApp hubOptions={{ service, inboxService }} />);
      act(() => handlers.agenda({ entries, fromCache: false }));
      expect(screen.getByRole("heading", { name: "Olá, Ana" })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Caixa de entrada" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Caixa de entrada" })).not.toBeInTheDocument();
      expect(inboxService.list).not.toHaveBeenCalled();
    } finally {
      window.history.replaceState(null, "", previous);
    }
  });

  it("stops waiting for Auth without treating a silent session as signed out", () => {
    vi.useFakeTimers();
    const { service, handlers } = fakeService();
    service.subscribeCleanerSession.mockImplementation((callback) => {
      handlers.session = callback;
      return () => {};
    });
    render(<CleanerHubApp hubOptions={{ service }} />);
    expect(screen.getByText("Carregando sua agenda…")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(cleanerStartupTimeoutMs));
    expect(screen.getByRole("alert")).toHaveTextContent("Não conseguimos abrir sua agenda agora.");
    expect(screen.queryByRole("heading", { name: "Entre na sua agenda" })).not.toBeInTheDocument();
    expect(service.subscribeAgenda).not.toHaveBeenCalled();
    expect(service.signOutCleaner).not.toHaveBeenCalled();

    act(() => handlers.session({ status: "signed-out" }));
    expect(screen.getByRole("heading", { name: "Entre na sua agenda" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("retries Auth on reconnect and ignores the abandoned observer", () => {
    vi.useFakeTimers();
    const { service, handlers } = fakeService();
    service.subscribeCleanerSession.mockImplementation((callback) => {
      handlers.session = callback;
      return () => {};
    });
    render(<CleanerHubApp hubOptions={{ service }} />);
    const abandoned = handlers.session;
    act(() => vi.advanceTimersByTime(cleanerStartupTimeoutMs));
    act(() => window.dispatchEvent(new Event("offline")));
    expect(screen.getByRole("alert")).toHaveTextContent("Sem internet.");
    act(() => window.dispatchEvent(new Event("online")));
    expect(service.subscribeCleanerSession).toHaveBeenCalledTimes(2);
    act(() => abandoned({ status: "signed-out" }));
    expect(screen.queryByRole("heading", { name: "Entre na sua agenda" })).not.toBeInTheDocument();
    act(() => handlers.session({ status: "signed-out" }));
    expect(screen.getByRole("heading", { name: "Entre na sua agenda" })).toBeInTheDocument();
  });

  it("keeps the agenda private until a delayed server membership confirms access", () => {
    vi.useFakeTimers();
    const { service, handlers } = fakeService();
    service.subscribeMembership.mockImplementation((_scope, callback) => {
      handlers.membership = callback;
      return () => {};
    });
    render(<CleanerHubApp hubOptions={{ service }} />);
    act(() => handlers.agenda({ entries, fromCache: false }));
    act(() => vi.advanceTimersByTime(cleanerStartupTimeoutMs));
    expect(screen.getByRole("alert")).toHaveTextContent("Não conseguimos abrir sua agenda agora.");
    expect(screen.queryByText("Maple Example House")).not.toBeInTheDocument();
    expect(service.signOutCleaner).not.toHaveBeenCalled();

    act(() => handlers.membership({ state: "active", displayName: "Ana", preferredLanguage: "pt" }));
    expect(screen.getByText("Agenda atualizada")).toBeInTheDocument();
    expect(screen.getByText("Maple Example House")).toBeInTheDocument();
  });

  it("preserves the membership deadline across automatic agenda listener retries", () => {
    vi.useFakeTimers();
    const { service, handlers } = fakeService();
    service.subscribeMembership.mockImplementation(() => () => {});
    render(<CleanerHubApp hubOptions={{ service }} />);
    for (const backoff of [2000, 4000, 8000]) {
      act(() => handlers.agendaError("unavailable"));
      act(() => vi.advanceTimersByTime(backoff));
    }
    expect(service.subscribeMembership).toHaveBeenCalledTimes(4);
    expect(screen.getByText("Carregando sua agenda…")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(cleanerStartupTimeoutMs - 14000));
    expect(screen.getByRole("alert")).toHaveTextContent("Não conseguimos abrir sua agenda agora.");
  });

  it("times out a cache-only agenda and retries the server subscription without reloading", () => {
    vi.useFakeTimers();
    const { service, handlers } = fakeService();
    render(<CleanerHubApp hubOptions={{ service }} />);
    const abandoned = handlers.agenda;
    act(() => abandoned({ entries, fromCache: true }));
    act(() => vi.advanceTimersByTime(cleanerStartupTimeoutMs));
    expect(screen.getByRole("alert")).toHaveTextContent("Não conseguimos abrir sua agenda agora.");
    expect(screen.queryByText("Maple Example House")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(service.subscribeAgenda).toHaveBeenCalledTimes(2);
    expect(service.subscribeCleanerSession).toHaveBeenCalledTimes(1);
    act(() => abandoned({ entries, fromCache: false }));
    expect(screen.queryByText("Agenda atualizada")).not.toBeInTheDocument();
    act(() => handlers.agenda({ entries, fromCache: false }));
    expect(screen.getByText("Agenda atualizada")).toBeInTheDocument();
    expect(screen.getByText("Maple Example House")).toBeInTheDocument();
  });

  it("checks the original startup deadline when a suspended timer resumes", () => {
    vi.useFakeTimers();
    const { service, handlers } = fakeService();
    render(<CleanerHubApp hubOptions={{ service }} />);
    const resume = () => window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
    act(resume);
    expect(service.subscribeAgenda).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Carregando sua agenda…")).toBeInTheDocument();

    // Move the wall clock without executing the timeout, as if the tab was suspended.
    vi.setSystemTime(Date.now() + cleanerStartupTimeoutMs + 1);
    act(resume);
    expect(service.subscribeAgenda).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    act(() => handlers.agenda({ entries, fromCache: false }));
    expect(screen.getByText("Agenda atualizada")).toBeInTheDocument();
  });

  it("retries a stalled agenda after the browser restores the page", () => {
    vi.useFakeTimers();
    const { service, handlers } = fakeService();
    render(<CleanerHubApp hubOptions={{ service }} />);
    act(() => vi.advanceTimersByTime(cleanerStartupTimeoutMs));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    const restored = Object.assign(new Event("pageshow"), { persisted: true });
    act(() => window.dispatchEvent(restored));
    expect(service.subscribeAgenda).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    act(() => window.dispatchEvent(restored));
    expect(service.subscribeAgenda).toHaveBeenCalledTimes(2);
    act(() => handlers.agenda({ entries, fromCache: false }));
    expect(screen.getByText("Agenda atualizada")).toBeInTheDocument();
  });

  it("signs in once with a pasted access code, normalised", async () => {
    const { service } = fakeService({ session: { status: "signed-out" } });
    render(<CleanerHubApp hubOptions={{ service }} />);
    expect(screen.getByRole("heading", { name: "Entre na sua agenda" })).toBeInTheDocument();
    const input = screen.getByLabelText("Código de acesso (12 letras e números)");
    await userEvent.type(input, "abcd efgh jk23");
    expect(input).toHaveValue("ABCD-EFGH-JK23");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));
    expect(service.redeemAccessCode).toHaveBeenCalledWith("ABCDEFGHJK23");
  });

  it("offers the Home Screen guide on Android before the code is entered", async () => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36");
    const { service } = fakeService({ session: { status: "signed-out" } });
    render(<CleanerHubApp hubOptions={{ service }} />);
    expect(screen.getByLabelText("Código de acesso (12 letras e números)")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Ver como colocar na tela inicial" }));
    expect(screen.getByRole("heading", { name: "Colocar o CleanFlow na tela inicial" })).toBeInTheDocument();
    expect(screen.getByText("No Chrome, toque nos três pontos ⋮ no canto de cima.")).toBeInTheDocument();
    expect(service.redeemAccessCode).not.toHaveBeenCalled();
  });

  it("shows a clear message for a used or wrong code", async () => {
    const { service } = fakeService({ session: { status: "signed-out" } });
    service.redeemAccessCode.mockRejectedValue(Object.assign(new Error(), { code: "functions/failed-precondition" }));
    render(<CleanerHubApp hubOptions={{ service }} />);
    await userEvent.type(screen.getByLabelText("Código de acesso (12 letras e números)"), "ABCDEFGHJK23");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Este código não vale mais");
  });

  it("lists confirmed work in the agenda and keeps an interested Offer apart", async () => {
    const { service, handlers } = fakeService();
    render(<CleanerHubApp hubOptions={{ service }} />);
    act(() => handlers.agenda({ entries, fromCache: false }));
    expect(screen.getByRole("heading", { name: "Olá, Ana" })).toBeInTheDocument();
    expect(screen.getByText("Agenda atualizada")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Mudanças recentes" })).not.toBeInTheDocument();
    expect(screen.queryByText("Cedar Example Loft")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Caixa de entrada/ })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: /^Agendadas/ }));
    const card = document.querySelector('[data-job-id="j1"]');
    expect(card).toHaveTextContent("Maple Example House");
    expect(card).toHaveTextContent("Vaga atribuída a você");
    expect(document.querySelector('[data-job-id="j2"]')).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /^Ofertas/ }));
    const offer = document.querySelector('[data-job-id="j2"]');
    expect(offer).toHaveTextContent("Você tem interesse · a gerente decide");
    expect(offer).not.toHaveTextContent("Confirmada");
  });


  it("waits for a server-confirmed automatic assignment before showing success", async () => {
    const { service, handlers } = fakeService();
    let finishResponse;
    service.respondToMyOffer.mockImplementation(() => new Promise((resolve) => { finishResponse = resolve; }));
    const automaticOffer = { ...entries[1], offerStatus: "PENDING", offerDistributionMode: "FIRST_ACCEPT_WINS" };
    render(<CleanerHubApp hubOptions={{ service }} />);
    act(() => handlers.agenda({ entries: [automaticOffer], fromCache: false }));
    await userEvent.click(screen.getByRole("button", { name: /^Ofertas/ }));
    await userEvent.click(screen.getByRole("button", { name: /Birch Example Flat/ }));
    expect(screen.queryByRole("button", { name: "Tenho interesse" })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Aceitar serviço" }));
    expect(service.respondToMyOffer).toHaveBeenCalledExactlyOnceWith("j2", "ACCEPTED");
    expect(screen.getByRole("button", { name: "Enviando…" })).toBeDisabled();
    expect(screen.queryByText("Serviço confirmado para você.")).toBeNull();
    await act(() => finishResponse({ state: "assigned", status: "ACCEPTED" }));
    expect(screen.getByText("Serviço confirmado para você.")).toHaveAttribute("role", "status");
    expect(screen.queryByRole("button", { name: "Aceitar serviço" })).toBeNull();

    const assignment = { ...entries[0], id: automaticOffer.id, jobId: automaticOffer.jobId, propertyName: automaticOffer.propertyName, acknowledged: true };
    act(() => handlers.agenda({ entries: [assignment], fromCache: false }));
    expect(screen.getByRole("button", { name: "Abrir checklist" })).toBeInTheDocument();
  });

  it("shows unavailability from the response and from a reopened server projection", async () => {
    const { service, handlers } = fakeService();
    const automaticOffer = {
      ...entries[1], offerStatus: "PENDING", offerDistributionMode: "FIRST_ACCEPT_WINS",
      notes: "Use demonstration supplies.", address: "Synthetic Lane",
    };
    service.respondToMyOffer.mockResolvedValue({ state: "already-taken", status: null });
    render(<CleanerHubApp hubOptions={{ service }} />);
    act(() => handlers.agenda({ entries: [automaticOffer], fromCache: false }));
    await userEvent.click(screen.getByRole("button", { name: /^Ofertas/ }));
    await userEvent.click(screen.getByRole("button", { name: /Birch Example Flat/ }));
    await userEvent.click(screen.getByRole("button", { name: "Aceitar serviço" }));
    expect(screen.getByText("Indisponível — a vaga deste serviço já foi preenchida.")).toHaveAttribute("role", "status");
    expect(screen.queryByText(automaticOffer.notes)).not.toBeInTheDocument();
    expect(screen.queryByText(automaticOffer.address)).not.toBeInTheDocument();
    expect(screen.queryByText(/US\$\s*140/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aceitar serviço" })).toBeNull();

    act(() => handlers.agenda({ entries: [{ ...automaticOffer, offerStatus: "ALREADY_TAKEN", jobStatus: "ASSIGNED" }], fromCache: false }));
    await userEvent.click(screen.getByRole("button", { name: /^Ofertas/ }));
    expect(screen.getByRole("button", { name: /Birch Example Flat.*Indisponível/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Birch Example Flat/ }));
    expect(screen.queryByRole("button", { name: "Aceitar serviço" })).toBeNull();
  });

  it.each([
    ["Tenho interesse", { state: "unavailable" }, "Esta oferta não está mais aberta."],
    ["Não posso", { state: "answered", status: "DECLINED" }, "Você recusou"],
  ])("removes private offer details on the %s response before a new snapshot", async (action, response, message) => {
    const { service, handlers } = fakeService();
    const offer = { ...entries[1], offerStatus: "PENDING", notes: "Use demonstration supplies." };
    service.respondToMyOffer.mockResolvedValue(response);
    render(<CleanerHubApp hubOptions={{ service }} />);
    act(() => handlers.agenda({ entries: [offer], fromCache: false }));
    await userEvent.click(screen.getByRole("button", { name: /^Ofertas/ }));
    await userEvent.click(screen.getByRole("button", { name: /Birch Example Flat/ }));
    expect(screen.getByText(offer.notes)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: action }));
    expect(await screen.findByText(message)).toBeVisible();
    expect(screen.queryByText(offer.notes)).not.toBeInTheDocument();
    expect(screen.queryByText(/US\$\s*140/)).not.toBeInTheDocument();
  });

  it("passes the displayed schedule revision and leaves updated automatic offers actionable after a stale response", async () => {
    const { service, handlers } = fakeService();
    const offer = { ...entries[1], offerStatus: "PENDING", offerDistributionMode: "FIRST_ACCEPT_WINS", scheduleRevision: 2 };
    service.respondToMyOffer.mockResolvedValue({ state: "stale-schedule" });
    render(<CleanerHubApp hubOptions={{ service }} />);
    act(() => handlers.agenda({ entries: [offer], fromCache: false }));
    await userEvent.click(screen.getByRole("button", { name: /^Ofertas/ }));
    await userEvent.click(screen.getByRole("button", { name: /Birch Example Flat/ }));
    await userEvent.click(screen.getByRole("button", { name: "Aceitar serviço" }));
    expect(service.respondToMyOffer).toHaveBeenCalledExactlyOnceWith("j2", "ACCEPTED", { scheduleRevision: 2 });
    expect(await screen.findByText("O horário mudou de novo. Confira o aviso mais recente.")).toBeInTheDocument();
    act(() => handlers.agenda({ entries: [{ ...offer, scheduleRevision: 3 }], fromCache: false }));
    expect(screen.getByRole("button", { name: "Aceitar serviço" })).toBeEnabled();
  });

  it("responds to the authenticated manual replacement without automatic assignment", async () => {
    const { service, handlers } = fakeService();
    const offer = { ...entries[1], offerStatus: "PENDING", scheduleRevision: 2, replacementOfferId: "replacement-local" };
    render(<CleanerHubApp hubOptions={{ service }} />);
    act(() => handlers.agenda({ entries: [offer], fromCache: false }));
    await userEvent.click(screen.getByRole("button", { name: /^Ofertas/ }));
    await userEvent.click(screen.getByRole("button", { name: /Birch Example Flat/ }));
    await userEvent.click(screen.getByRole("button", { name: "Tenho interesse" }));
    expect(service.respondToMyOffer).toHaveBeenCalledExactlyOnceWith("j2", "INTERESTED", {
      scheduleRevision: 2, offerId: "replacement-local",
    });
    expect(screen.queryByRole("button", { name: "Aceitar serviço" })).not.toBeInTheDocument();
  });

  it("submits interest without confirming a manual offer", async () => {
    const { service, handlers } = fakeService();
    render(<CleanerHubApp hubOptions={{ service }} />);
    act(() => handlers.agenda({ entries: [{ ...entries[1], offerStatus: "PENDING" }], fromCache: false }));
    await userEvent.click(screen.getByRole("button", { name: /^Ofertas/ }));
    await userEvent.click(screen.getByRole("button", { name: /Birch Example Flat/ }));
    await userEvent.click(screen.getByRole("button", { name: "Tenho interesse" }));
    expect(service.respondToMyOffer).toHaveBeenCalledExactlyOnceWith("j2", "INTERESTED");
    expect(screen.getByText("Resposta enviada para a gerente.")).toHaveAttribute("role", "status");
    expect(screen.queryByText("Serviço confirmado para você.")).toBeNull();
  });

  it("labels cached or failed data as not confirmed instead of current", () => {
    const { service, handlers } = fakeService();
    render(<CleanerHubApp hubOptions={{ service }} />);
    act(() => handlers.agenda({ entries, fromCache: false }));
    act(() => handlers.agendaError("unavailable"));
    expect(screen.getByText("Sem confirmação agora")).toBeInTheDocument();
    expect(screen.getByText(/Não conseguimos atualizar a agenda/)).toBeInTheDocument();
    expect(within(document.querySelector(".hb-bar")).getByText("Sem conexão")).toBeInTheDocument();
  });

  it("retains only the server-confirmed list and last verification time during a reconnect", () => {
    vi.useFakeTimers();
    const { service, handlers } = fakeService();
    const { result } = renderHook(() => useCleanerHub({ service }));
    const at = new Date();
    act(() => handlers.agenda({ entries, fromCache: false }));
    act(() => vi.advanceTimersByTime(10_000));
    act(() => handlers.agenda({ entries: [], fromCache: true }));
    expect(result.current.entries.map((entry) => entry.jobId)).toContain("j1");
    expect(result.current.freshness).toEqual({ state: "stale", lastVerifiedAt: at, reason: "cache" });
  });

  it("expires a visible offer and marks a stalled stream stale without a new snapshot", () => {
    vi.useFakeTimers();
    const { service, handlers } = fakeService();
    const { result } = renderHook(() => useCleanerHub({ service }));
    const at = new Date();
    const offer = { ...entries[1], offerExpiresAtMs: at.getTime() + 500 };
    act(() => handlers.agenda({ entries: [offer], fromCache: false }));
    expect(result.current.schedule.offers).toEqual([offer]);
    act(() => vi.advanceTimersByTime(500));
    expect(result.current.schedule.offers).toEqual([]);
    expect(result.current.entries).toEqual([]);
    act(() => vi.advanceTimersByTime(serverVerifyIntervalMs + 10_000));
    expect(result.current.freshness).toEqual({ state: "stale", lastVerifiedAt: at, reason: "error" });
  });

  it("acknowledges the root worker without interrupting the current screen", async () => {
    const worker = new EventTarget();
    const postMessage = vi.fn();
    worker.ready = Promise.resolve({ active: { postMessage } });
    Object.defineProperty(window.navigator, "serviceWorker", { configurable: true, value: worker });
    try {
      const { service } = fakeService({ session: { status: "signed-out" } });
      const { unmount } = render(<CleanerHubApp hubOptions={{ service }} />);
      await act(() => worker.ready);
      expect(postMessage).toHaveBeenCalledWith({ type: "CLEANFLOW_UPDATE_CLIENT_READY" });
      const nextWorker = { postMessage: vi.fn() };
      const send = (type) => {
        const event = new Event("message");
        Object.assign(event, { data: { type }, source: nextWorker });
        worker.dispatchEvent(event);
      };
      send("UNRELATED");
      expect(nextWorker.postMessage).not.toHaveBeenCalled();
      send("CLEANFLOW_UPDATE_AVAILABLE");
      expect(nextWorker.postMessage).toHaveBeenCalledOnce();
      expect(nextWorker.postMessage).toHaveBeenCalledWith({ type: "CLEANFLOW_UPDATE_CLIENT_READY" });
      expect(screen.getByRole("heading", { name: "Entre na sua agenda" })).toBeInTheDocument();
      unmount();
      send("CLEANFLOW_UPDATE_AVAILABLE");
      expect(nextWorker.postMessage).toHaveBeenCalledOnce();
    } finally {
      delete window.navigator.serviceWorker;
    }
  });

  it("opens the Inbox when the cleaner push worker reports a notification tap", async () => {
    const worker = new EventTarget();
    worker.ready = new Promise(() => {});
    Object.defineProperty(window.navigator, "serviceWorker", { configurable: true, value: worker });
    const inboxService = { list: vi.fn().mockResolvedValue({ items: [], unreadCount: 0 }), open: vi.fn() };
    try {
      const { service, handlers } = fakeService();
      render(<CleanerHubApp hubOptions={{ service, inboxService }} />);
      act(() => handlers.agenda({ entries, fromCache: false }));
      const send = (scriptURL) => act(() => {
        const event = new Event("message");
        Object.assign(event, { data: { type: "cleanflow-cleaner-open-inbox" }, source: { scriptURL } });
        worker.dispatchEvent(event);
      });
      send(`${window.location.origin}/sw.js`);
      expect(screen.queryByRole("heading", { name: "Caixa de entrada" })).toBeNull();
      send(`${window.location.origin}/cleaner-messaging-sw.js`);
      expect(await screen.findByRole("heading", { name: "Caixa de entrada" })).toBeInTheDocument();
    } finally {
      delete window.navigator.serviceWorker;
    }
  });

  it("drops private data and signs out when access is revoked", () => {
    const { service, handlers } = fakeService();
    render(<CleanerHubApp hubOptions={{ service }} />);
    act(() => handlers.agenda({ entries, fromCache: false }));
    expect(screen.getAllByText("Maple Example House").length).toBeGreaterThan(0);
    act(() => handlers.membership({ state: "revoked" }));
    expect(screen.getByRole("heading", { name: "Seu acesso foi encerrado" })).toBeInTheDocument();
    expect(screen.queryByText("Maple Example House")).toBeNull();
    expect(service.signOutCleaner).toHaveBeenCalled();
  });

  it("opens a Job and explains when its checklist cannot be prepared", async () => {
    const { service, handlers } = fakeService();
    render(<CleanerHubApp hubOptions={{ service }} />);
    act(() => handlers.agenda({ entries, fromCache: false }));
    await userEvent.click(screen.getByRole("button", { name: /^Agendadas/ }));
    await userEvent.click(document.querySelector('[data-job-id="j1"]'));
    expect(screen.getByText("Endereço, códigos e instruções da casa continuam vindo da gerente por enquanto.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Abrir checklist" }));
    expect(service.openMyChecklist).toHaveBeenCalledWith("j1");
    expect(await screen.findByText("O checklist não está disponível para este serviço.")).toBeInTheDocument();
  });
});

describe("availability in the cleaner account", () => {
  it("loads on opening, discards the last cleaner's in-flight save and keeps the new session's agenda intact", async () => {
    const { service, handlers } = fakeService();
    let finish;
    service.availability = {
      list: vi.fn().mockResolvedValue({ blocks: [] }),
      set: vi.fn(() => new Promise(resolve => { finish = resolve; })),
    };
    render(<CleanerHubApp hubOptions={{ service }} />);
    act(() => handlers.agenda({ entries, fromCache: false }));
    await userEvent.click(screen.getByRole("button", { name: "Conta" }));
    expect(service.availability.list).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Dias em que não posso trabalhar" }));
    await userEvent.click(await screen.findByRole("button", { name: "Adicionar período" }));
    fireEvent.change(screen.getByLabelText("De", { exact: true }), { target: { value: tomorrow } });
    await userEvent.click(screen.getByRole("button", { name: "Salvar período" }));
    expect(service.availability.set).toHaveBeenCalledExactlyOnceWith({ startDate: tomorrow, endDate: tomorrow });
    act(() => handlers.session({ status: "signed-in", uid: "u1", organizationId: "other-org", cleanerId: "other-cleaner", sessionId: "session-b" }));
    act(() => handlers.agenda({ entries: [entries[0]], fromCache: false }));
    await act(() => finish({ block: { id: "prior", createdBy: "CLEANER", startDate: tomorrow, endDate: tomorrow } }));
    expect(await screen.findByText("Nenhum período adicionado.")).toBeVisible();
    expect(screen.queryByText("Período adicionado.")).toBeNull();
    expect(service.availability.list).toHaveBeenCalledTimes(2);
    await userEvent.click(screen.getByRole("button", { name: "Agenda", exact: true }));
    expect(document.querySelector('[data-job-id="j1"]')).toBeInTheDocument();
  });
});

describe("cleaner schedule decisions", () => {
  const pending = {
    ...entries[0], scheduleRevision: 4,
    reschedule: { state: "PENDING", scheduleRevision: 4, scheduledDate: tomorrow, scheduledStart: "14:30",
      previousScheduledDate: today, previousScheduledStart: "09:15" },
  };
  function scheduleInbox() {
    const notice = { id: "schedule-notice", type: "RESCHEDULED", jobId: "j1", read: false, openable: true,
      serviceLabel: pending.propertyName, reschedule: pending.reschedule };
    return {
      list: vi.fn().mockResolvedValue({ items: [notice], unreadCount: 1 }),
      respondToReschedule: vi.fn(async (_role, _id, { decision, scheduleRevision }) => ({ state: decision, scheduleRevision })),
    };
  }

  it("immediately removes a declined Inbox assignment from a delayed agenda, including legacy projections", async () => {
    const { service, handlers } = fakeService();
    const inboxService = scheduleInbox();
    const assignment = { ...pending, notes: "Synthetic instruction", offeredCompensation: 82.50 };
    render(<CleanerHubApp hubOptions={{ service, inboxService }} />);
    act(() => handlers.agenda({ entries: [assignment], fromCache: false }));
    await userEvent.click(screen.getByRole("button", { name: /Caixa de entrada/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Não posso" }));
    await userEvent.click(screen.getByRole("button", { name: "Recusar e sair" }));
    expect(inboxService.respondToReschedule).toHaveBeenCalledExactlyOnceWith("CLEANER", "schedule-notice", { decision: "DECLINED", scheduleRevision: 4 });
    await userEvent.click(screen.getByRole("button", { name: "Voltar" }));
    expect(screen.queryByRole("region", { name: /Confirmar a nova data/ })).toBeNull();
    expect(document.querySelector('[data-job-id="j1"]')).toBeNull();
    const { reschedule, ...older } = assignment;
    act(() => handlers.agenda({ entries: [older], fromCache: false }));
    expect(document.querySelector('[data-job-id="j1"]')).toBeNull();
    expect(screen.getByRole("main")).not.toHaveTextContent(/Synthetic instruction|82,50/);
  });

  it.each(["CONFIRMED", "DECLINED"])("keeps a %s agenda answer on a stale Inbox page and forgets it on session change", async decision => {
    const { service, handlers } = fakeService();
    const inboxService = scheduleInbox();
    render(<CleanerHubApp hubOptions={{ service, inboxService }} />);
    act(() => handlers.agenda({ entries: [pending], fromCache: false }));
    const band = screen.getByRole("region", { name: /Confirmar a nova data · Maple/ });
    if (decision === "DECLINED") {
      await userEvent.click(within(band).getByRole("button", { name: "Não posso" }));
      await userEvent.click(within(band).getByRole("button", { name: "Recusar e sair" }));
    } else {
      await userEvent.click(within(band).getByRole("button", { name: "Posso" }));
    }
    await userEvent.click(screen.getByRole("button", { name: /Caixa de entrada/ }));
    await userEvent.click(screen.getByRole("button", { name: "Atualizar avisos" }));
    const copy = decision === "CONFIRMED" ? "Novo horário confirmado." : "Você informou que não pode na nova data.";
    expect(await screen.findByText(copy)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Posso" })).toBeNull();
    if (decision === "DECLINED") {
      expect(screen.queryByRole("button", { name: "Ver serviço" })).toBeNull();
      expect(screen.queryByText(pending.propertyName)).toBeNull();
    }
    act(() => handlers.session({ status: "signed-in", uid: "u1", organizationId: "other-org", cleanerId: "other", sessionId: "session-b" }));
    act(() => handlers.agenda({ entries: [pending], fromCache: false }));
    expect(await screen.findByRole("button", { name: "Posso" })).toBeVisible();
    expect(screen.queryByText(copy)).toBeNull();
  });

  it("answers from the band, blocks duplicate actions, and keeps the confirmed card and detail on a delayed projection", async () => {
    const { service, handlers } = fakeService();
    let finish;
    service.respondToAgendaReschedule.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    render(<CleanerHubApp hubOptions={{ service }} />);
    act(() => handlers.agenda({ entries: [pending], fromCache: false }));
    const banner = screen.getByRole("region", { name: /Confirmar a nova data · Maple/ });
    expect(banner).toHaveTextContent("9:15");
    expect(banner).toHaveTextContent("14:30");
    const card = document.querySelector('[data-job-id="j1"]').closest("li");
    expect(card.querySelector("button button")).toBeNull();
    expect(within(card).getByText("Confirmar a nova data")).toBeVisible();
    await userEvent.click(within(banner).getByRole("button", { name: "Posso" }));
    expect(within(card).getByRole("button", { name: "Não posso" })).toBeDisabled();
    expect(service.respondToAgendaReschedule).toHaveBeenCalledExactlyOnceWith("j1", { decision: "CONFIRMED", scheduleRevision: 4 });
    await act(() => finish({ state: "CONFIRMED", scheduleRevision: 4 }));
    expect(screen.queryByRole("region", { name: /Confirmar a nova data/ })).toBeNull();
    act(() => handlers.agenda({ entries: [pending], fromCache: false }));
    expect(within(card).getByText("Novo horário confirmado.")).toBeVisible();
    await userEvent.click(card.querySelector("[data-job-id]"));
    expect(screen.getByText("Novo horário confirmado.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Posso" })).toBeNull();
  });

  it("confirms a decline explicitly and drops private details before the projection disappears", async () => {
    const { service, handlers } = fakeService();
    render(<CleanerHubApp hubOptions={{ service }} />);
    act(() => handlers.agenda({ entries: [{ ...pending, notes: "Synthetic task instruction" }], fromCache: false }));
    await userEvent.click(document.querySelector('[data-job-id="j1"]'));
    await userEvent.click(screen.getByRole("button", { name: "Não posso" }));
    expect(service.respondToAgendaReschedule).not.toHaveBeenCalled();
    const cancel = screen.getAllByRole("button", { name: "Voltar" }).find(el => el.closest(".hb-reschedule"));
    expect(cancel).toHaveFocus();
    await userEvent.click(cancel);
    expect(screen.getByRole("button", { name: "Não posso" })).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Não posso" }));
    await userEvent.click(screen.getByRole("button", { name: "Recusar e sair" }));
    expect(service.respondToAgendaReschedule).toHaveBeenCalledExactlyOnceWith("j1", { decision: "DECLINED", scheduleRevision: 4 });
    expect(screen.getByText("Você informou que não pode na nova data.").closest('[role="status"]')).toHaveFocus();
    expect(screen.queryByText("Synthetic task instruction")).toBeNull();
    act(() => handlers.agenda({ entries: [], fromCache: false }));
    await userEvent.click(screen.getByRole("button", { name: "Voltar" }));
    expect(screen.getByRole("main")).toHaveTextContent("Você informou que não pode na nova data.");
    expect(document.querySelector('[data-job-id="j1"]')).toBeNull();
  });


  it("recovers the current pending change on an older assigned projection and answers from the home band", async () => {
    const { service, handlers } = fakeService();
    service.loadAgendaReschedules = vi.fn().mockResolvedValue({
      confirmations: [{ jobId: "j1", scheduleRevision: 4, reschedule: pending.reschedule }],
    });
    render(<CleanerHubApp hubOptions={{ service }} />);
    act(() => handlers.agenda({ entries: [{ ...entries[0], scheduleRevision: 4 }], fromCache: false }));
    const banner = await screen.findByRole("region", { name: /Confirmar a nova data · Maple/ });
    expect(service.loadAgendaReschedules).toHaveBeenCalledExactlyOnceWith([{ jobId: "j1", scheduleRevision: 4 }]);
    await userEvent.click(within(banner).getByRole("button", { name: "Posso" }));
    expect(service.respondToAgendaReschedule).toHaveBeenCalledExactlyOnceWith("j1", { decision: "CONFIRMED", scheduleRevision: 4 });
  });

  it("allows an answer on the current revision while a superseded request is still arriving", async () => {
    const { service, handlers } = fakeService();
    let finishPrevious;
    service.respondToAgendaReschedule.mockImplementationOnce(() => new Promise(resolve => { finishPrevious = resolve; }));
    render(<CleanerHubApp hubOptions={{ service }} />);
    act(() => handlers.agenda({ entries: [pending], fromCache: false }));
    const banner = screen.getByRole("region", { name: /Confirmar a nova data · Maple/ });
    await userEvent.click(within(banner).getByRole("button", { name: "Posso" }));
    const current = { ...pending, scheduleRevision: 5, reschedule: { ...pending.reschedule, scheduleRevision: 5 } };
    act(() => handlers.agenda({ entries: [current], fromCache: false }));
    await userEvent.click(within(banner).getByRole("button", { name: "Posso" }));
    expect(service.respondToAgendaReschedule).toHaveBeenLastCalledWith("j1", { decision: "CONFIRMED", scheduleRevision: 5 });
    await act(() => finishPrevious({ state: "DECLINED", scheduleRevision: 4 }));
    expect(screen.getByText("Novo horário confirmado.", { selector: ".hb-reschedule-result" })).toBeVisible();
    expect(screen.queryByText("Você informou que não pode na nova data.")).toBeNull();
  });

  it("leaves a newer revision actionable after a stale card decision and omits missing history", async () => {
    const { service, handlers } = fakeService();
    service.respondToAgendaReschedule.mockRejectedValueOnce({ details: { reason: "stale-schedule" } });
    render(<CleanerHubApp hubOptions={{ service }} />);
    const reschedule = { state: "PENDING", scheduleRevision: 4, scheduledDate: tomorrow, scheduledStart: "13:00" };
    act(() => handlers.agenda({ entries: [{ ...pending, reschedule }], fromCache: false }));
    const card = document.querySelector('[data-job-id="j1"]').closest("li");
    expect(within(card).queryByText("Antes")).toBeNull();
    await userEvent.click(within(card).getByRole("button", { name: "Posso" }));
    expect(screen.getByRole("alert")).toHaveTextContent("O horário mudou de novo.");
    expect(service.reconnectAgenda).toHaveBeenCalled();
    act(() => handlers.agenda({ entries: [{ ...pending, scheduleRevision: 5, reschedule: { ...reschedule, scheduleRevision: 5, scheduledStart: "15:45" } }], fromCache: false }));
    expect(within(card).getByText(/15:45/)).toBeVisible();
    await userEvent.click(within(card).getByRole("button", { name: "Posso" }));
    expect(service.respondToAgendaReschedule).toHaveBeenLastCalledWith("j1", { decision: "CONFIRMED", scheduleRevision: 5 });
  });
});

describe("Hub theme preference", () => {
  it.each([
    [null, "light"], ["unknown", "light"], ["light", "light"], ["dark", "dark"], ["auto", "auto"],
  ])("normalizes %s to %s", (stored, expected) => {
    expect(normalizeHubTheme(stored)).toBe(expected);
  });
});

describe("Cleaner Hub appearance", () => {
  const getTheme = () => document.querySelector(".hb-root").dataset.theme;
  const key = "cleanflow.cleanerHub.theme";

  afterEach(() => vi.unstubAllGlobals());

  it("defaults to light on a dark phone, remembers the choice and follows changes in Automatic", async () => {
    const media = Object.assign(new EventTarget(), { matches: true });
    vi.stubGlobal("matchMedia", (query) => query === "(prefers-color-scheme: dark)" ? media : { matches: false });
    function changeSystemTheme(dark) {
      media.matches = dark;
      act(() => media.dispatchEvent(Object.assign(new Event("change"), { matches: dark })));
    }
    const { service } = fakeService();
    const { unmount } = render(<CleanerHubApp hubOptions={{ service }} />);
    await userEvent.click(screen.getByRole("button", { name: "Conta" }));
    const choose = (name) => screen.getByRole("button", { name });
    expect(getTheme()).toBe("light");
    expect(choose("Claro")).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(choose("Escuro"));
    changeSystemTheme(false);
    expect(getTheme()).toBe("dark");
    expect(window.localStorage.getItem(key)).toBe("dark");

    unmount();
    render(<CleanerHubApp hubOptions={{ service }} />);
    expect(getTheme()).toBe("dark");
    await userEvent.click(choose("Conta"));
    expect(choose("Escuro")).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(choose("Automático"));
    expect(window.localStorage.getItem(key)).toBe("auto");
    expect(getTheme()).toBe("light");
    changeSystemTheme(true);
    expect(getTheme()).toBe("dark");
    await userEvent.click(choose("Claro"));
    expect(getTheme()).toBe("light");
  });

  it("keeps the appearance control usable when storage is unavailable", async () => {
    const storageGet = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (name) {
      if (name === key) throw new Error("Storage unavailable");
      return storageGet.call(this, name);
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Storage unavailable"); });
    const { service } = fakeService();
    render(<CleanerHubApp hubOptions={{ service }} />);
    expect(getTheme()).toBe("light");
    await userEvent.click(screen.getByRole("button", { name: "Conta" }));
    await userEvent.click(screen.getByRole("button", { name: "Escuro" }));
    expect(getTheme()).toBe("dark");
  });
});

// jsdom has no layout. Model a 550px scroller with 110px service rows so
// restoration must preserve the opened row's offset, not just call scrollTo.
describe("CleanerHubApp agenda return", () => {
  const futureJobs = [1, 2, 3].flatMap((monthOffset) => Array.from({ length: 12 }, (_, index) => {
    const date = new Date(`${today}T12:00:00`);
    date.setDate(1);
    date.setMonth(date.getMonth() + monthOffset);
    date.setDate(index + 2);
    return {
      ...entries[0], id: `example-${monthOffset}-${index}`, jobId: `future-${monthOffset}-${index}`,
      propertyName: `Example House ${monthOffset}-${index}`, scheduledDate: localDateKey(date),
    };
  }));
  const card = (jobId) => document.querySelector(`[data-job-id="${jobId}"]`);
  const main = () => document.getElementById("hb-main");
  const back = () => userEvent.click(screen.getByRole("button", { name: "Voltar", exact: true }));

  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
      const index = Number(this.dataset.jobId?.split("-").at(-1));
      const top = this.id === "hb-main" ? 60 : this.dataset.jobId
        ? 60 + 240 + index * 110 - main().scrollTop : 0;
      return { top, bottom: top + 110, left: 0, right: 375, width: 375, height: this.id === "hb-main" ? 550 : 110 };
    });
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: function (_x, y) { this.scrollTop = Math.max(0, y); },
    });
  });
  afterEach(() => {
    delete HTMLElement.prototype.scrollTo;
    vi.unstubAllGlobals();
  });

  async function openAgenda(options = {}) {
    const { service, handlers } = fakeService();
    render(<CleanerHubApp hubOptions={{ service, ...options }} />);
    act(() => handlers.agenda({ entries: futureJobs, fromCache: false }));
    await userEvent.click(screen.getByRole("button", { name: /^Agendadas/ }));
    return handlers;
  }

  async function chooseSecondMonth() {
    await userEvent.click(screen.getByRole("button", { name: "Por mês", exact: true }));
    await userEvent.click(screen.getByRole("button", { name: "Próximo mês com serviços" }));
    return screen.getByTestId("month-nav").textContent;
  }

  it.each(["all", "month"])("returns to the %s list with the opened card's scroll offset and focus", async (mode) => {
    await openAgenda();
    const month = mode === "month" ? await chooseSecondMonth() : null;
    const jobId = mode === "month" ? "future-2-7" : "future-1-7";
    main().scrollTop = 715;
    const offset = card(jobId).getBoundingClientRect().top - main().getBoundingClientRect().top;
    await userEvent.click(card(jobId));
    expect(main().scrollTop).toBe(0);
    await back();
    expect.soft(document.querySelector(`[data-sched-mode="${mode}"]`)).toHaveAttribute("aria-pressed", "true");
    if (month) expect.soft(screen.queryByTestId("month-nav")?.textContent).toBe(month);
    expect.soft(main().scrollTop).toBe(715);
    expect.soft(card(jobId)?.getBoundingClientRect().top - main().getBoundingClientRect().top).toBe(offset);
    expect.soft(card(jobId)).toHaveFocus();
  });

  it("falls back safely when the opened service and its month disappear", async () => {
    const handlers = await openAgenda();
    await chooseSecondMonth();
    main().scrollTop = 715;
    await userEvent.click(card("future-2-7"));
    const remaining = futureJobs.filter((job) => !job.jobId.startsWith("future-2-"));
    act(() => handlers.agenda({ entries: remaining, fromCache: false }));
    await back();
    expect.soft(document.querySelector('[data-sched-mode="month"]')).toHaveAttribute("aria-pressed", "true");
    expect.soft(card("future-1-0")).toBeInTheDocument();
    expect.soft(main().scrollTop).toBe(0);
    expect.soft(screen.getByRole("button", { name: /^Agendadas/ })).toHaveFocus();
    act(() => handlers.agenda({ entries: futureJobs, fromCache: false }));
    expect.soft(card("future-1-0")).toBeInTheDocument();
    expect.soft(card("future-2-0")).toBeNull();
  });

  it("does not restore a previous session's month or scroll after Back", async () => {
    const handlers = await openAgenda();
    await chooseSecondMonth();
    main().scrollTop = 715;
    await userEvent.click(card("future-2-7"));
    act(() => handlers.session({ status: "signed-in", uid: "u1", organizationId: "org", cleanerId: "ana", sessionId: "session-next" }));
    act(() => handlers.agenda({ entries: futureJobs, fromCache: false }));
    await back();
    expect(document.querySelector('[data-sched-mode="all"]')).toHaveAttribute("aria-pressed", "true");
    expect(main().scrollTop).toBe(0);
    expect(card("future-2-7")).not.toHaveFocus();
  });

  it("returns to Offers after opening an offer without restoring an agenda position", async () => {
    const handlers = await openAgenda();
    await chooseSecondMonth();
    main().scrollTop = 715;
    await userEvent.click(card("future-2-7"));
    await userEvent.click(screen.getByRole("button", { name: /^Ofertas/ }));
    act(() => handlers.agenda({ entries: [...futureJobs, entries[1]], fromCache: false }));
    await userEvent.click(card("j2"));
    await back();
    expect(screen.getByRole("heading", { name: "Ofertas", exact: true })).toBeVisible();
    expect(main().scrollTop).toBe(0);
    expect(card("future-2-7")).toBeNull();
  });

  it("does not reuse an agenda anchor when a different service is opened through the Inbox", async () => {
    const inboxService = {
      list: vi.fn().mockResolvedValue({ items: [{ id: "notice", type: "JOB_ASSIGNED", read: false, openable: true, serviceLabel: "Example House 1-0" }], unreadCount: 1 }),
      open: vi.fn().mockResolvedValue({ state: "opened", destination: { kind: "JOB", jobId: "future-1-0" } }),
    };
    await openAgenda({ inboxService });
    await chooseSecondMonth();
    main().scrollTop = 715;
    await userEvent.click(card("future-2-7"));
    await userEvent.click(screen.getByRole("button", { name: /Caixa de entrada/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Abrir", exact: true }));
    expect(screen.getByRole("heading", { name: "Example House 1-0" })).toBeVisible();
    await back();
    expect(main().scrollTop).toBe(0);
    expect(card("future-2-7")).not.toHaveFocus();
  });
});
