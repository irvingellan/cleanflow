import { act, render, renderHook, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CleanerHubApp } from "./CleanerHubApp.jsx";
import { localDateKey, addDaysToKey } from "./cleanerAgendaModel.js";
import { serverVerifyIntervalMs, useCleanerHub } from "./useCleanerHub.js";

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
    await userEvent.click(screen.getByRole("button", { name: /^Próximas/ }));
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
    expect(screen.getByText("Indisponível — este serviço já foi aceito.")).toHaveAttribute("role", "status");
    expect(screen.queryByRole("button", { name: "Aceitar serviço" })).toBeNull();

    act(() => handlers.agenda({ entries: [{ ...automaticOffer, offerStatus: "ALREADY_TAKEN", jobStatus: "ASSIGNED" }], fromCache: false }));
    await userEvent.click(screen.getByRole("button", { name: /^Ofertas/ }));
    expect(screen.getByRole("button", { name: /Birch Example Flat.*Indisponível/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Birch Example Flat/ }));
    expect(screen.queryByRole("button", { name: "Aceitar serviço" })).toBeNull();
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
    await userEvent.click(screen.getByRole("button", { name: /^Próximas/ }));
    await userEvent.click(document.querySelector('[data-job-id="j1"]'));
    expect(screen.getByText("Endereço e instruções de acesso continuam vindo da gerente.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Abrir checklist" }));
    expect(service.openMyChecklist).toHaveBeenCalledWith("j1");
    expect(await screen.findByText("A gerente ainda não liberou o checklist deste serviço.")).toBeInTheDocument();
  });
});
