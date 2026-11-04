// Pilot feedback 2026-11-04 — FB01 (access), FB02 (full schedule), FB04 (checklist situation).
// Fictitious data only.
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccessSection, CleanerHubApp } from "./CleanerHubApp.jsx";
import { addDaysToKey, localDateKey } from "./cleanerAgendaModel.js";
import { hubTranslate } from "./cleanerHubMessages.js";

const today = localDateKey(new Date());
const session = { status: "signed-in", uid: "u1", organizationId: "org", cleanerId: "ana", sessionId: "s1" };

function fakeService(extra = {}) {
  const handlers = {};
  const service = {
    subscribeCleanerSession: vi.fn((callback) => { callback(session); return () => {}; }),
    subscribeMembership: vi.fn((_scope, callback) => { callback({ state: "active", displayName: "Ana", preferredLanguage: "pt" }); return () => {}; }),
    subscribeAgenda: vi.fn((_scope, onAgenda) => { handlers.agenda = onAgenda; return () => {}; }),
    redeemAccessCode: vi.fn(async () => {}),
    signOutCleaner: vi.fn(async () => {}),
    openMyChecklist: vi.fn(async () => ({ state: "not-ready" })),
    respondToMyOffer: vi.fn(async () => ({ state: "answered" })),
    reconnectAgenda: vi.fn(async () => {}),
    ...extra,
  };
  return { service, handlers };
}

const job = (n, date, extra = {}) => ({ id: `ana__j${n}`, kind: "ASSIGNED", jobId: `j${n}`, cleanerId: "ana", jobStatus: "ASSIGNED", propertyName: `Example House ${n}`, scheduledDate: date, scheduledStart: "10:00", acknowledged: true, ...extra });
// Nine future Jobs over three months (more than the reported "7").
const firstOfNextMonth = (() => { const [y, m] = today.split("-").map(Number); return `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`; })();
const plusMonth = (key) => { const [y, m] = key.split("-").map(Number); return `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`; };
const m1 = firstOfNextMonth; const m2 = plusMonth(m1); const m3 = plusMonth(m2);
const nine = [
  job(1, addDaysToKey(m1, 2)), job(2, addDaysToKey(m1, 4)), job(3, addDaysToKey(m1, 9)), job(4, addDaysToKey(m1, 20)),
  job(5, addDaysToKey(m2, 1)), job(6, addDaysToKey(m2, 3)), job(7, addDaysToKey(m2, 15)),
  job(8, addDaysToKey(m3, 5)), job(9, addDaysToKey(m3, 6)),
];

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem("cleanflow.cleanerHub.onboarded", "u1");
  window.localStorage.setItem("cleanflow.cleanerHub.language", "pt");
});

const jobIds = () => [...document.querySelectorAll("[data-job-id]")].map((element) => element.getAttribute("data-job-id"));

describe("FB02 — every future Job is reachable", () => {
  it("labels the count as a quantity and lists all nine, grouped by month", async () => {
    const { service, handlers } = fakeService();
    render(<CleanerHubApp hubOptions={{ service }} />);
    act(() => handlers.agenda({ entries: nine, fromCache: false }));
    const segment = screen.getByRole("button", { name: "Agendadas depois de hoje: 9 serviço(s)" });
    await userEvent.click(segment);
    expect(screen.getByTestId("scheduled-summary")).toHaveTextContent("9 serviço(s) confirmado(s) depois de hoje. Todos aparecem abaixo.");
    expect(jobIds()).toEqual(nine.map((entry) => entry.jobId));
    expect(document.querySelectorAll(".hb-month")).toHaveLength(3);
  });

  it("steps month by month without skipping or duplicating a Job", async () => {
    const { service, handlers } = fakeService();
    render(<CleanerHubApp hubOptions={{ service }} />);
    act(() => handlers.agenda({ entries: nine, fromCache: false }));
    await userEvent.click(screen.getByRole("button", { name: /^Agendadas/ }));
    await userEvent.click(screen.getByRole("button", { name: "Por mês" }));
    const previous = screen.getByRole("button", { name: "Mês anterior com serviços" });
    const next = screen.getByRole("button", { name: "Próximo mês com serviços" });
    expect(previous).toBeDisabled();
    const seen = [jobIds()];
    await userEvent.click(next); seen.push(jobIds());
    await userEvent.click(next); seen.push(jobIds());
    expect(next).toBeDisabled();
    expect(seen.map((ids) => ids.length)).toEqual([4, 3, 2]);
    expect(seen.flat()).toEqual(nine.map((entry) => entry.jobId));
    expect(screen.getByText("Mês 3 de 3 com serviços")).toBeInTheDocument();
  });

  it("never presents a not-confirmed list as complete", async () => {
    const { service, handlers } = fakeService();
    render(<CleanerHubApp hubOptions={{ service }} />);
    act(() => handlers.agenda({ entries: nine, fromCache: false }));
    act(() => handlers.agenda({ entries: nine, fromCache: true }));
    await userEvent.click(screen.getByRole("button", { name: /^Agendadas/ }));
    expect(screen.getByTestId("scheduled-summary")).toHaveTextContent("pode faltar algum");
  });
});

describe("FB04 — checklist situation from the server summary", () => {
  const entries = [
    job(1, today, { checklist: { status: "DRAFT", started: false } }),
    job(2, addDaysToKey(today, 1), { checklist: { status: "DRAFT", started: true } }),
    job(3, addDaysToKey(today, 2), { checklist: { status: "READY_FOR_REVIEW", started: true } }),
    job(4, addDaysToKey(today, 3)),
    job(5, addDaysToKey(today, 4), { checklist: { status: "NONE" } }),
  ];

  it("shows pending checklists without push and without calling them late", async () => {
    const { service, handlers } = fakeService();
    render(<CleanerHubApp hubOptions={{ service }} />);
    act(() => handlers.agenda({ entries, fromCache: false }));
    const notice = screen.getByTestId("checklist-pending");
    expect(notice).toHaveTextContent("2 checklist(s) para preencher");
    expect(notice).toHaveTextContent("Example House 1");
    expect(notice).toHaveTextContent("Example House 2");
    expect(notice).not.toHaveTextContent("Example House 3");
    expect(notice).not.toHaveTextContent(/atrasad/i);
    expect(document.querySelector('[data-job-id="j1"] [data-checklist-state]')).toHaveTextContent("Checklist disponível");
    await userEvent.click(screen.getByRole("button", { name: /^Agendadas/ }));
    expect(document.querySelector('[data-job-id="j2"] [data-checklist-state]')).toHaveTextContent("Iniciado · falta enviar");
    expect(document.querySelector('[data-job-id="j3"] [data-checklist-state]')).toHaveTextContent("Enviado para revisão");
    expect(document.querySelector('[data-job-id="j4"] [data-checklist-state]')).toBeNull();
  });

  it.each([
    ["j1", "Começar checklist", "available"],
    ["j2", "Continuar e enviar", "started"],
    ["j4", "Abrir checklist", "unknown"],
  ])("Job %s offers %s through the existing server path", async (jobId, label, state) => {
    const { service, handlers } = fakeService();
    render(<CleanerHubApp hubOptions={{ service }} />);
    act(() => handlers.agenda({ entries, fromCache: false }));
    if (jobId !== "j1") await userEvent.click(screen.getByRole("button", { name: /^Agendadas/ }));
    await userEvent.click(document.querySelector(`[data-job-id="${jobId}"]`));
    expect(document.querySelector(".hb-checkcard").getAttribute("data-checklist-state")).toBe(state);
    await userEvent.click(screen.getByRole("button", { name: label }));
    expect(service.openMyChecklist).toHaveBeenCalledWith(jobId);
  });

  it("a submitted checklist is not a pending task and has no fill-in action", async () => {
    const { service, handlers } = fakeService();
    render(<CleanerHubApp hubOptions={{ service }} />);
    act(() => handlers.agenda({ entries, fromCache: false }));
    await userEvent.click(screen.getByRole("button", { name: /^Agendadas/ }));
    await userEvent.click(document.querySelector('[data-job-id="j3"]'));
    const card = document.querySelector(".hb-checkcard");
    expect(card).toHaveTextContent("Você já enviou este checklist. Não há nada pendente.");
    expect(within(card).queryByRole("button")).toBeNull();
  });
});

describe("FB01 — access information and reduced repetition", () => {
  const assigned = [job(1, today)];

  it("without the server read, says where access still comes from and keeps status/acknowledgment collapsed", async () => {
    const { service, handlers } = fakeService();
    render(<CleanerHubApp hubOptions={{ service }} />);
    act(() => handlers.agenda({ entries: assigned, fromCache: false }));
    await userEvent.click(document.querySelector('[data-job-id="j1"]'));
    expect(document.querySelector(".hb-access").getAttribute("data-access-state")).toBe("unsupported");
    const record = document.querySelector("details.hb-record");
    expect(record.open).toBe(false);
    expect(record).toHaveTextContent("Ciência");
    expect(record).toHaveTextContent("Situação");
  });

  it("keeps private access disconnected even when a service offers the future callable", async () => {
    const getMyJobAccess = vi.fn(async () => ({
      state: "available", address: "100 Example Lane, Demo City",
      items: [{ kind: "door", value: "SHOULD-NOT-SHOW" }],
      houseInstructions: "SHOULD-NOT-SHOW",
    }));
    const { service, handlers } = fakeService({ getMyJobAccess });
    render(<CleanerHubApp hubOptions={{ service }} />);
    act(() => handlers.agenda({ entries: assigned, fromCache: false }));
    await userEvent.click(document.querySelector('[data-job-id="j1"]'));
    expect(document.querySelector(".hb-access")).toHaveAttribute("data-access-state", "unsupported");
    expect(getMyJobAccess).not.toHaveBeenCalled();
    expect(screen.queryByText("100 Example Lane, Demo City")).toBeNull();
    expect(screen.queryByText("SHOULD-NOT-SHOW")).toBeNull();
  });

  it("does not request access data for a completed Job", async () => {
    const getMyJobAccess = vi.fn(async () => ({ state: "available", items: [] }));
    const { service, handlers } = fakeService({ getMyJobAccess });
    render(<CleanerHubApp hubOptions={{ service }} />);
    act(() => handlers.agenda({ entries: [job(1, today, { jobStatus: "COMPLETED" })], fromCache: false }));
    await userEvent.click(screen.getByRole("button", { name: /^Concluídas/ }));
    await userEvent.click(document.querySelector('[data-job-id="j1"]'));
    expect(getMyJobAccess).not.toHaveBeenCalled();
    expect(document.querySelector(".hb-access")).toHaveAttribute("data-access-state", "unsupported");
  });
});

describe("FB01 — disconnected access scaffold clears stale data", () => {
  const t = Object.assign((key, params) => hubTranslate("pt", key, params), { locale: "pt-BR" });
  const available = { state: "available", items: [{ kind: "door", value: "FICTITIOUS-ACCESS" }] };

  it("removes loaded values when the Job closes or the capability disappears", async () => {
    const loadJobAccess = vi.fn().mockResolvedValue(available);
    const hub = { session, loadJobAccess };
    const { rerender } = render(<AccessSection t={t} hub={hub} entry={job(1, today)} />);
    expect(await screen.findByText("FICTITIOUS-ACCESS")).toBeInTheDocument();
    rerender(<AccessSection t={t} hub={hub} entry={job(1, today, { jobStatus: "COMPLETED" })} />);
    expect(screen.queryByText("FICTITIOUS-ACCESS")).toBeNull();
    expect(document.querySelector(".hb-access")).toHaveAttribute("data-access-state", "closed");
    rerender(<AccessSection t={t} hub={{ session, loadJobAccess: null }} entry={job(1, today)} />);
    expect(screen.queryByText("FICTITIOUS-ACCESS")).toBeNull();
    expect(document.querySelector(".hb-access")).toHaveAttribute("data-access-state", "unsupported");
  });

  it.each(["job", "session"])("discards a pending response when its %s changes", async (change) => {
    let finishOld;
    const loadJobAccess = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; }))
      .mockResolvedValue({ state: "not-provided" });
    const hub = { session, loadJobAccess };
    const { rerender } = render(<AccessSection t={t} hub={hub} entry={job(1, today)} />);
    const nextHub = change === "session" ? { ...hub, session: { ...session, sessionId: "s2" } } : hub;
    rerender(<AccessSection t={t} hub={nextHub} entry={job(change === "job" ? 2 : 1, today)} />);
    await act(() => finishOld(available));
    expect(screen.queryByText("FICTITIOUS-ACCESS")).toBeNull();
    expect(document.querySelector(".hb-access")).toHaveAttribute("data-access-state", "not-provided");
  });

  it("ignores an access response received after the Job closes", async () => {
    let finish;
    const hub = { session, loadJobAccess: vi.fn(() => new Promise((resolve) => { finish = resolve; })) };
    const { rerender } = render(<AccessSection t={t} hub={hub} entry={job(1, today)} />);
    rerender(<AccessSection t={t} hub={hub} entry={job(1, today, { jobStatus: "COMPLETED" })} />);
    await act(() => finish(available));
    expect(screen.queryByText("FICTITIOUS-ACCESS")).toBeNull();
    expect(document.querySelector(".hb-access")).toHaveAttribute("data-access-state", "closed");
  });
});
