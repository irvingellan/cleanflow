import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useLegacyAgendaReschedules } from "./useLegacyAgendaReschedules.js";

const legacy = { kind: "ASSIGNED", jobStatus: "ASSIGNED", jobId: "j1", scheduleRevision: 4 };
const pending = { state: "PENDING", scheduleRevision: 4, scheduledDate: "2026-11-20", scheduledStart: "11:00" };
const confirmation = { jobId: "j1", scheduleRevision: 4, reschedule: pending };

function mount(entries, loadAgendaReschedules, online = true) {
  const props = { entries, service: { loadAgendaReschedules }, scope: 1, online, attempt: 0 };
  return { props, ...renderHook(useLegacyAgendaReschedules, { initialProps: props }) };
}

describe("older agenda projections", () => {
  it("looks up only active legacy revisions in bounded batches and remembers empty results", async () => {
    const candidates = Array.from({ length: 26 }, (_, i) => ({ ...legacy, jobId: "j" + (i + 1) }));
    const projected = [
      { ...legacy, jobId: "new", reschedule: pending },
      { ...legacy, jobId: "explicit-none", reschedule: null },
      { ...legacy, jobId: "offer", kind: "OFFER" },
      { ...legacy, jobId: "complete", jobStatus: "COMPLETED" },
      { ...legacy, jobId: "original", scheduleRevision: 0 },
    ];
    const entries = [...candidates, ...projected];
    const load = vi.fn().mockResolvedValue({ confirmations: [
      confirmation, { ...confirmation, jobId: "j2", scheduleRevision: 3 }, { ...confirmation, jobId: "not-in-batch" },
    ] });
    const { result, rerender, props } = mount(entries, load);
    await waitFor(() => expect(result.current[0].reschedule).toEqual(pending));
    expect(load.mock.calls.map(([batch]) => batch.length)).toEqual([25, 1]);
    expect(load.mock.calls.flatMap(([batch]) => batch.map(item => item.jobId)).sort()).toEqual(candidates.map(item => item.jobId).sort());
    expect(result.current[1].reschedule).toBeUndefined();
    expect(result.current.slice(26)).toEqual(projected);
    rerender({ ...props, entries: [...entries], attempt: 1 });
    act(() => window.dispatchEvent(new Event("focus")));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("discards old requests when membership disappears or another session receives the same Job", async () => {
    let finish;
    const load = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
      .mockResolvedValue({ confirmations: [] });
    const { result, props, rerender } = mount([legacy], load);
    rerender({ ...props, scope: null });
    expect(result.current[0].reschedule).toBeUndefined();
    rerender({ ...props, scope: 2 });
    await act(() => finish({ confirmations: [confirmation] }));
    expect(result.current[0].reschedule).toBeUndefined();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("preserves explicit revocation and never adds data from a superseded revision", async () => {
    let finish;
    const load = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
      .mockResolvedValue({ confirmations: [] });
    const { result, props, rerender } = mount([legacy], load);
    rerender({ ...props, entries: [{ ...legacy, scheduleRevision: 5 }] });
    await act(() => finish({ confirmations: [confirmation] }));
    expect(result.current[0].reschedule).toBeUndefined();
    rerender({ ...props, entries: [{ ...legacy, reschedule: null }] });
    act(() => window.dispatchEvent(new Event("focus")));
    expect(result.current[0].reschedule).toBeNull();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("keeps the Job usable offline and retries a failed lookup on return without polling", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ confirmations: [confirmation] });
    const { result, props, rerender } = mount([legacy], load, false);
    expect(load).not.toHaveBeenCalled();
    await act(() => rerender({ ...props, online: true }));
    expect(load).toHaveBeenCalledTimes(1);
    expect(result.current[0]).toEqual(legacy);
    await act(() => window.dispatchEvent(new Event("online")));
    expect(result.current[0].reschedule).toEqual(pending);
    act(() => window.dispatchEvent(new Event("focus")));
    expect(load).toHaveBeenCalledTimes(2);
  });
});
