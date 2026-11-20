import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { resetCurrentOrganizationId, setCurrentOrganizationId } from "../../services/organization/currentOrganization.js";
import { clearJobPhotoCountCache, fetchJobPhotoCounts, useJobPhotoCounts } from "./jobPhotoCountService.js";

const getCounts = vi.hoisted(() => vi.fn());
vi.mock("firebase/functions", () => ({ httpsCallable: () => getCounts }));
vi.mock("../../services/firebase/client.js", () => ({ functions: {} }));

const jobs = [{ id: "service", operationalStatus: "COMPLETED" }];
const resultWithCount = photoCount => ({ service: { photoCount } });

afterEach(() => {
  resetCurrentOrganizationId();
  clearJobPhotoCountCache();
  getCounts.mockReset();
});

it("looks up a shared job ID again when the company changes", async () => {
  setCurrentOrganizationId("company-one");
  const load = vi.fn().mockResolvedValueOnce(resultWithCount(2)).mockResolvedValueOnce(resultWithCount(8));
  const hook = renderHook(() => useJobPhotoCounts(jobs, load));
  await waitFor(() => expect(hook.result.current.counts).toEqual({ service: 2 }));

  setCurrentOrganizationId("company-two");
  hook.rerender();
  expect(hook.result.current.counts).toEqual({});
  await waitFor(() => expect(hook.result.current.counts).toEqual({ service: 8 }));
  expect(load).toHaveBeenCalledTimes(2);
});

it("ignores a previous session's pending response even if its company and job ID are reused", async () => {
  let finish;
  const stale = new Promise(resolve => { finish = resolve; });
  const first = renderHook(() => useJobPhotoCounts(jobs, () => stale));
  first.unmount();
  clearJobPhotoCountCache();

  const load = vi.fn().mockResolvedValue(resultWithCount(8));
  const second = renderHook(() => useJobPhotoCounts(jobs, load));
  await waitFor(() => expect(second.result.current.counts).toEqual({ service: 8 }));
  await act(async () => { finish(resultWithCount(2)); });
  second.unmount();

  const reused = renderHook(() => useJobPhotoCounts(jobs, load));
  expect(reused.result.current.counts).toEqual({ service: 8 });
  expect(load).toHaveBeenCalledTimes(1);
});

it("stops fetching later batches after the account changes", async () => {
  let finishBatch;
  getCounts.mockReturnValueOnce(new Promise(resolve => { finishBatch = resolve; }));
  const pending = fetchJobPhotoCounts(Array.from({ length: 101 }, (_, index) => `service-${index}`));
  clearJobPhotoCountCache();
  finishBatch({ data: { counts: { "service-0": { photoCount: 2 } } } });
  await expect(pending).resolves.toEqual({});
  expect(getCounts).toHaveBeenCalledTimes(1);
});
