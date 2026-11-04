import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NotificationInbox, useNotificationInbox } from "./NotificationInbox.jsx";

const items = [
  { id: "a", type: "NEW_OFFER", read: false, createdAtMs: 1793816400000, openable: true, serviceLabel: "Synthetic Flat" },
  { id: "b", type: "CANCELLED", read: true, createdAtMs: 1793816300000, openable: false, serviceLabel: null },
];

function Example({ sessionKey = "session-a", service, onOpen }) {
  const inbox = useNotificationInbox({ role: "CLEANER", sessionKey, service });
  return <NotificationInbox inbox={inbox} language="pt" onOpen={onOpen} />;
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
    expect(screen.getByText("Mostrando os 100 avisos mais recentes.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Lidos" }));
    expect(screen.queryByText("Synthetic Flat")).not.toBeInTheDocument();
    expect(screen.getByText("Este item não está mais disponível.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Abrir" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Não lidos" }));
    expect(screen.getByText("1 não lido(s)")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Marcar como lido" }));
    expect(service.mark).toHaveBeenCalledExactlyOnceWith("CLEANER", "a");
    expect(await screen.findByText("0 não lido(s)")).toBeInTheDocument();
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
    await userEvent.click(await screen.findByRole("button", { name: "Abrir" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Este item não está mais disponível.");
    expect(onOpen).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Abrir" }));
    expect(onOpen).toHaveBeenCalledExactlyOnceWith({ kind: "OFFER", jobId: "fresh-job" });
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
