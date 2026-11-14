import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NotificationInbox, NotificationInboxBadge, useNotificationInbox } from "./NotificationInbox.jsx";

const items = [
  { id: "a", type: "NEW_OFFER", read: false, createdAtMs: 1793816400000, openable: true, serviceLabel: "Synthetic Flat" },
  { id: "b", type: "CANCELLED", read: true, createdAtMs: 1793816300000, openable: false, serviceLabel: null },
];

function Example({ sessionKey = "session-a", service, onOpen }) {
  const inbox = useNotificationInbox({ role: "CLEANER", sessionKey, service });
  return <>
    <button type="button">Inbox <NotificationInboxBadge inbox={inbox} language="pt" className="badge" /></button>
    <NotificationInbox inbox={inbox} language="pt" onOpen={onOpen} />
  </>;
}

describe("Notification Inbox", () => {
  it("filters reads and refreshes its counter only after marking through the server", async () => {
    const service = {
      list: vi.fn().mockResolvedValueOnce({ items, unreadCount: 1, hasOlder: true })
        .mockResolvedValue({ items: [{ ...items[0], read: true }, items[1]], unreadCount: 0, hasOlder: true }),
      mark: vi.fn().mockResolvedValue({ state: "read" }),
    };
    render(<Example service={service} onOpen={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: "Nova oferta" })).toBeInTheDocument();
    expect(screen.getByText("Há avisos anteriores por carregar. O total de não lidos ainda é desconhecido.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Lidos" }));
    expect(screen.queryByText("Synthetic Flat")).not.toBeInTheDocument();
    expect(screen.getByText("Este item não está mais disponível.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ver oferta" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Não lidos" }));
    expect(screen.getByRole("status")).toHaveTextContent("1 não lido(s) nos avisos carregados");
    await userEvent.click(screen.getByRole("button", { name: "Marcar como lido" }));
    expect(service.mark).toHaveBeenCalledExactlyOnceWith("CLEANER", "a");
    expect(await screen.findByRole("status")).toHaveTextContent("0 não lido(s) nos avisos carregados");
    expect(screen.getByText("Nenhum aviso neste filtro.")).toBeInTheDocument();
  });

  it("opens only the current destination returned by the authorized action", async () => {
    const service = {
      list: vi.fn().mockResolvedValue({ items, unreadCount: 1 }),
      open: vi.fn()
        .mockResolvedValueOnce({ state: "unavailable", destination: null })
        .mockResolvedValueOnce({ state: "opened", destination: { kind: "OFFER", jobId: "fresh-job" } }),
    };
    const onOpen = vi.fn(() => true);
    render(<Example service={service} onOpen={onOpen} />);
    await userEvent.click(await screen.findByRole("button", { name: "Ver oferta" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Este item não está mais disponível.");
    expect(onOpen).not.toHaveBeenCalled();
    expect(screen.queryByText("Synthetic Flat")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Atualizar avisos" }));
    await userEvent.click(await screen.findByRole("button", { name: "Ver oferta" }));
    expect(onOpen).toHaveBeenCalledExactlyOnceWith({ kind: "OFFER", jobId: "fresh-job" });
  });

  it("loads older authorized pages once, deduplicates rows and rereads the first page on refresh", async () => {
    const latest = { ...items[0], id: "latest" };
    const older = { ...items[0], id: "older", serviceLabel: "Synthetic Older Flat" };
    const service = {
      list: vi.fn()
        .mockResolvedValueOnce({ items: [latest], unreadCount: 1, hasOlder: true, nextCursor: "cursor-1" })
        .mockResolvedValueOnce({ items: [latest, older], unreadCount: 2, hasOlder: false, nextCursor: null })
        .mockResolvedValueOnce({ items: [], unreadCount: 0, hasOlder: false, nextCursor: null }),
    };
    render(<Example service={service} />);
    await userEvent.click(await screen.findByRole("button", { name: "Carregar avisos anteriores" }));
    expect(await screen.findByText("Synthetic Older Flat")).toBeInTheDocument();
    expect(screen.getAllByText("Synthetic Flat")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent("2 não lido(s)");
    expect(service.list.mock.calls).toEqual([
      ["CLEANER", { pageSize: 25 }], ["CLEANER", { pageSize: 25, cursor: "cursor-1" }],
    ]);

    await userEvent.click(screen.getByRole("button", { name: "Atualizar avisos" }));
    expect(await screen.findByText("Nenhum aviso neste filtro.")).toBeInTheDocument();
    expect(screen.queryByText("Synthetic Older Flat")).not.toBeInTheDocument();
    expect(service.list).toHaveBeenLastCalledWith("CLEANER", { pageSize: 25 });
  });

  it("forwards M01 focus separately from the freshly authorized destination", async () => {
    const item = { ...items[0], type: "CLEANER_INTERESTED" };
    const onOpen = vi.fn(() => true);
    const inbox = { state: "ready", items: [item], loadedUnreadCount: 1, refresh: vi.fn(),
      open: vi.fn().mockResolvedValue({ state: "opened", destination: { kind: "JOB", jobId: "fresh-job" } }) };
    render(<NotificationInbox inbox={inbox} language="en" onOpen={onOpen} />);
    await userEvent.click(screen.getByRole("button", { name: "Review interested cleaners" }));
    expect(onOpen).toHaveBeenCalledExactlyOnceWith({ kind: "JOB", jobId: "fresh-job" }, { initialFocus: "interest" });
  });

  it("an unavailable M01 target does not navigate or forward its focus hint", async () => {
    const onOpen = vi.fn();
    const inbox = { state: "ready", items: [{ ...items[0], type: "CLEANER_INTERESTED" }], loadedUnreadCount: 1, refresh: vi.fn(),
      open: vi.fn().mockResolvedValue({ state: "unavailable", destination: null }) };
    render(<NotificationInbox inbox={inbox} language="en" onOpen={onOpen} />);
    await userEvent.click(screen.getByRole("button", { name: "Review interested cleaners" }));
    expect(onOpen).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent("This item is no longer available.");
  });

  it("renders each manager assignment and batch completion with the authorized service", async () => {
    const current = {
      ...items[0],
      type: "AUTO_ASSIGNMENT_CONFIRMED",
      automaticOffer: { cleanerLabel: "Example Cleaner", scheduledDate: "2026-11-16", scheduledStart: "10:30" },
    };
    const closed = { ...current, id: "filled", type: "AUTO_OFFER_BATCH_FILLED",
      automaticOffer: { scheduledDate: "2026-11-16" } };
    const onOpen = vi.fn(() => true);
    const inbox = { state: "ready", items: [current, closed], loadedUnreadCount: 2, refresh: vi.fn(),
      open: vi.fn().mockResolvedValue({ state: "opened", destination: { kind: "JOB", jobId: "current" } }) };
    render(<NotificationInbox inbox={inbox} language="pt" onOpen={onOpen} />);
    const confirmation = screen.getByRole("heading", { name: "Atribuição automática confirmada" }).closest("li");
    const filled = screen.getByRole("heading", { name: "Todas as vagas preenchidas" }).closest("li");
    expect(within(confirmation).getByText("Example Cleaner ficou com o serviço.")).toBeInTheDocument();
    expect(within(confirmation).getByText(/10:30/)).toBeInTheDocument();
    expect(within(filled).queryByText(/Example Cleaner/)).not.toBeInTheDocument();
    await userEvent.click(within(filled).getByRole("button", { name: "Ver serviço" }));
    expect(onOpen).toHaveBeenCalledExactlyOnceWith({ kind: "JOB", jobId: "current" });
  });

  it("sends only the cleaner's notification id and schedule revision and waits for the decision", async () => {
    const notice = { ...items[0], type: "RESCHEDULED", reschedule: {
      state: "PENDING", scheduleRevision: 4, scheduledDate: "2026-11-16", scheduledStart: "10:30",
    } };
    let resolveDecision;
    const service = {
      list: vi.fn().mockResolvedValue({ items: [notice], unreadCount: 1 }),
      respondToReschedule: vi.fn(() => new Promise(resolve => { resolveDecision = resolve; })),
    };
    render(<Example service={service} />);
    await userEvent.click(await screen.findByRole("button", { name: "Não posso" }));
    expect(service.respondToReschedule).toHaveBeenCalledExactlyOnceWith("CLEANER", "a", {
      scheduleRevision: 4, decision: "DECLINED",
    });
    expect(screen.queryByText(/você informou/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();
    await act(() => resolveDecision({ state: "DECLINED", scheduleRevision: 4 }));
    expect(await screen.findByText("Você informou que não pode na nova data.")).toBeVisible();
    expect(screen.queryByText(/10:30|Synthetic Flat/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ver serviço" })).not.toBeInTheDocument();
  });

  it("refreshes the Inbox on a stale decision before offering the newer schedule", async () => {
    const notice = { ...items[0], type: "RESCHEDULED", reschedule: {
      state: "PENDING", scheduleRevision: 4, scheduledDate: "2026-11-16", scheduledStart: "10:30",
    } };
    const updated = { ...notice, id: "current", reschedule: { ...notice.reschedule, scheduleRevision: 5, scheduledStart: "12:00" } };
    const service = {
      list: vi.fn().mockResolvedValueOnce({ items: [notice], unreadCount: 1 })
        .mockResolvedValue({ items: [updated], unreadCount: 1 }),
      respondToReschedule: vi.fn().mockRejectedValue({ details: { reason: "stale-schedule" } }),
    };
    render(<Example service={service} />);
    await userEvent.click(await screen.findByRole("button", { name: "Confirmar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("O horário mudou de novo.");
    expect(await screen.findByText(/12:00/)).toBeInTheDocument();
    expect(screen.queryByText(/10:30/)).not.toBeInTheDocument();
  });

  it("labels zero as a partial count until an older unread notification is loaded", async () => {
    const service = {
      list: vi.fn()
        .mockResolvedValueOnce({ items: [items[1]], unreadCount: 0, hasOlder: true, nextCursor: "older" })
        .mockResolvedValueOnce({ items: [items[0]], unreadCount: 1, hasOlder: false, nextCursor: null }),
    };
    render(<Example service={service} />);
    expect(screen.queryByText("0 não lido(s)")).not.toBeInTheDocument();
    const partialBadge = await screen.findByRole("button", { name: "Inbox 0 não lido(s) nos avisos carregados" });
    expect(within(partialBadge).getByText("0+")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("0 não lido(s) nos avisos carregados");

    await userEvent.click(screen.getByRole("button", { name: "Carregar avisos anteriores" }));
    const fullBadge = await screen.findByRole("button", { name: "Inbox 1 não lido(s)" });
    expect(within(fullBadge).getByText("1")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("1 não lido(s)");
    expect(screen.queryByText("Há avisos anteriores por carregar. O total de não lidos ainda é desconhecido.")).not.toBeInTheDocument();
  });

  it("drops the old account and ignores its late list response on session replacement", async () => {
    let resolveOld;
    const old = new Promise((resolve) => { resolveOld = resolve; });
    const service = {
      list: vi.fn().mockReturnValueOnce(old)
        .mockResolvedValue({ items: [], unreadCount: 0 }),
    };
    const onOpen = vi.fn();
    const { rerender } = render(<Example service={service} onOpen={onOpen} />);
    rerender(<Example sessionKey="session-b" service={service} onOpen={onOpen} />);
    expect(await screen.findByText("Nenhum aviso neste filtro.")).toBeInTheDocument();
    await act(() => resolveOld({ items, unreadCount: 1 }));
    expect(screen.queryByText("Synthetic Flat")).not.toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Caixa de entrada" })).getByRole("status")).toHaveTextContent("0 não lido(s)");
  });
});
