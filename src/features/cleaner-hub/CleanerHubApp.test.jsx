import { act, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CleanerHubApp } from "./CleanerHubApp.jsx";
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
    expect(screen.queryByText("A gerente ainda não liberou o checklist deste serviço.")).toBeNull();
  });

  it("drops the previous account's Job detail while a different cleaner signs in", async () => {
    const { service, handlers } = fakeService();
    render(<CleanerHubApp hubOptions={{ service }} />);
    act(() => handlers.agenda({ entries, fromCache: false }));
    await userEvent.click(document.querySelector('[data-job-id="j1"]'));
    await userEvent.click(screen.getByRole("button", { name: "Abrir checklist" }));
    expect(await screen.findByText("A gerente ainda não liberou o checklist deste serviço.")).toBeInTheDocument();
    act(() => handlers.session({ status: "signed-in", uid: "u2", organizationId: "other-org", cleanerId: "bia", sessionId: "session-c" }));
    expect(screen.queryByText("Maple Example House")).toBeNull();
    expect(screen.queryByText("A gerente ainda não liberou o checklist deste serviço.")).toBeNull();
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
    expect(await screen.findByText("A gerente ainda não liberou o checklist deste serviço.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Caixa de entrada/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Abrir" }));
    expect(screen.getByRole("heading", { name: second.propertyName })).toBeInTheDocument();
    expect(screen.queryByText("A gerente ainda não liberou o checklist deste serviço.")).toBeNull();
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
    expect(screen.getByText(/Saiu da sua agenda/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^Agendadas/ }));
    const card = document.querySelector('[data-job-id="j1"]');
    expect(card).toHaveTextContent("Maple Example House");
    expect(card).toHaveTextContent("Confirmada para você");
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
    const automaticOffer = { ...entries[1], offerStatus: "PENDING", offerDistributionMode: "FIRST_ACCEPT_WINS" };
    service.respondToMyOffer.mockResolvedValue({ state: "already-taken", status: null });
    render(<CleanerHubApp hubOptions={{ service }} />);
    act(() => handlers.agenda({ entries: [automaticOffer], fromCache: false }));
    await userEvent.click(screen.getByRole("button", { name: /^Ofertas/ }));
    await userEvent.click(screen.getByRole("button", { name: /Birch Example Flat/ }));
    await userEvent.click(screen.getByRole("button", { name: "Aceitar serviço" }));
    expect(screen.getByText("Indisponível — a vaga deste serviço já foi preenchida.")).toHaveAttribute("role", "status");
    expect(screen.queryByRole("button", { name: "Aceitar serviço" })).toBeNull();

    act(() => handlers.agenda({ entries: [{ ...automaticOffer, offerStatus: "ALREADY_TAKEN", jobStatus: "ASSIGNED" }], fromCache: false }));
    await userEvent.click(screen.getByRole("button", { name: /^Ofertas/ }));
    expect(screen.getByRole("button", { name: /Birch Example Flat.*Indisponível/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Birch Example Flat/ }));
    expect(screen.queryByRole("button", { name: "Aceitar serviço" })).toBeNull();
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

  it("opens a Job and reports when the checklist is not released yet", async () => {
    const { service, handlers } = fakeService();
    render(<CleanerHubApp hubOptions={{ service }} />);
    act(() => handlers.agenda({ entries, fromCache: false }));
    await userEvent.click(screen.getByRole("button", { name: /^Agendadas/ }));
    await userEvent.click(document.querySelector('[data-job-id="j1"]'));
    expect(screen.getByText("Endereço, códigos e instruções da casa continuam vindo da gerente por enquanto.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Abrir checklist" }));
    expect(service.openMyChecklist).toHaveBeenCalledWith("j1");
    expect(await screen.findByText("A gerente ainda não liberou o checklist deste serviço.")).toBeInTheDocument();
  });
});
