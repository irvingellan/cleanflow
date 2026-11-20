import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AvailabilityPanel } from "./AvailabilityPanel.jsx";

const today = "2026-11-19";
const period = { id: "block", createdBy: "CLEANER", startDate: "2026-11-20", endDate: "2026-11-20" };
const job = { jobId: "job", kind: "ASSIGNED", jobStatus: "ASSIGNED", scheduledDate: period.startDate, scheduledStart: "10:00" };
const mount = (service, props = {}) => render(<AvailabilityPanel language="pt" today={today} entries={[job]} service={service} {...props} />);
const button = (name) => screen.getByRole("button", { name });
const edit = (name, value) => fireEvent.change(screen.getByLabelText(name, { exact: true }), { target: { value } });
function fixture() {
  return { list: vi.fn().mockResolvedValue({ blocks: [] }),
    set: vi.fn(async fields => ({ block: { id: "b", createdBy: "CLEANER", ...fields } })),
    remove: vi.fn().mockResolvedValue({ removed: true }) };
}

describe("availability panel", () => {
  it("loads only on mount, reports a failed read, and retries into a true empty list", async () => {
    const service = fixture();
    let reject;
    service.list.mockImplementationOnce(() => new Promise((_, no) => { reject = no; }));
    mount(service);
    expect(screen.getByRole("status")).toHaveTextContent("Carregando períodos");
    expect(screen.queryByText("Nenhum período adicionado.")).toBeNull();
    await act(() => reject(new Error("offline")));
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar");
    await userEvent.click(button("Tentar de novo"));
    expect(await screen.findByText("Nenhum período adicionado.")).toBeVisible();
    expect(service.list).toHaveBeenCalledTimes(2);
  });
  it("adds and removes an inclusive range without sending hours, even after a partial-day edit", async () => {
    const service = fixture();
    mount(service);
    await userEvent.click(await screen.findByRole("button", { name: "Adicionar período" }));
    expect(screen.getByLabelText("De", { exact: true })).toHaveFocus();
    edit("De", period.startDate);
    await userEvent.click(screen.getByLabelText("Parte do dia"));
    edit("Hora inicial", "13:00"); edit("Hora final", "15:00");
    edit("Até", "2026-11-22");
    expect(screen.queryByLabelText("Hora inicial")).toBeNull();
    expect(screen.queryByLabelText("Parte do dia")).toBeNull();
    expect(screen.getByText("Você tem 1 serviço neste período. Fale com a gerente.")).toBeVisible();
    await userEvent.click(button("Salvar período"));
    expect(service.set).toHaveBeenCalledExactlyOnceWith({ startDate: period.startDate, endDate: "2026-11-22" });
    expect(await screen.findByText("Período adicionado.")).toHaveFocus();
    expect(screen.getByText("Você tem 1 serviço neste período. Fale com a gerente.")).toBeVisible();
    expect(screen.queryByRole("textbox")).toBeNull();
    await userEvent.click(button(/^Remover/));
    expect(service.remove).toHaveBeenCalledExactlyOnceWith({ blockId: "b" });
    expect(await screen.findByText("Nenhum período adicionado.")).toBeVisible();
    expect(screen.queryByText("Você tem 1 serviço neste período. Fale com a gerente.")).toBeNull();
  });
  it("validates dates and time, preserves edits on failure and suppresses duplicate submissions", async () => {
    const service = fixture();
    let save;
    service.set.mockRejectedValueOnce(new Error("offline")).mockImplementationOnce(() => new Promise(resolve => { save = resolve; }));
    mount(service, { entries: [job, { ...job, jobId: "untimed", scheduledStart: null }] });
    await userEvent.click(await screen.findByRole("button", { name: "Adicionar período" }));
    edit("De", "2026-11-16");
    await userEvent.click(button("Salvar período"));
    expect(screen.getByRole("alert")).toHaveTextContent("uma data futura");
    edit("De", period.startDate);
    await userEvent.click(screen.getByLabelText("Parte do dia"));
    edit("Hora inicial", "09:00"); edit("Hora final", "08:00");
    await userEvent.click(button("Salvar período"));
    expect(screen.getByRole("alert")).toHaveTextContent("hora final");
    expect(service.set).not.toHaveBeenCalled();
    edit("Hora final", "11:00");
    expect(screen.getByText(/1 serviço sem horário/)).toBeVisible();
    await userEvent.click(button("Salvar período"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível salvar");
    await userEvent.click(button("Salvar período"));
    fireEvent.submit(screen.getByRole("form", { name: "Adicionar período" }));
    expect(service.set).toHaveBeenCalledTimes(2);
    expect(button("Salvar período")).toBeDisabled();
    expect(service.set).toHaveBeenLastCalledWith({ startDate: period.startDate, endDate: period.endDate, startTime: "09:00", endTime: "11:00" });
    await act(() => save({ block: { ...period, startTime: "09:00", endTime: "11:00" } }));
    expect(await screen.findByText("Período adicionado.")).toBeVisible();
    expect(within(screen.getByRole("list")).getByText(/9:00 – 11:00/)).toBeVisible();
  });
  it("keeps failed removals available for retry and hides private periods after loss of permission", async () => {
    const service = fixture();
    service.list.mockResolvedValue({ blocks: [period] });
    service.remove.mockRejectedValueOnce(new Error("offline")).mockRejectedValueOnce({ code: "functions/permission-denied" });
    mount(service);
    const remove = await screen.findByRole("button", { name: /^Remover/ });
    await userEvent.click(remove);
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível salvar");
    expect(remove).toBeEnabled();
    await userEvent.click(remove);
    expect(await screen.findByText("Não foi possível carregar os períodos.")).toBeVisible();
    expect(screen.queryByRole("list")).toBeNull();
  });
});
