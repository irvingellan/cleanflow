import { renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { resetCurrentOrganizationId, setCurrentOrganizationId } from "../../services/organization/currentOrganization.js";
import { uploadPayoutProof } from "./payoutProofService.js";
import { usePayoutsController } from "./usePayoutsController.js";

vi.mock("./payoutProofService.js", () => ({ getPayoutProofUrl: vi.fn(), uploadPayoutProof: vi.fn() }));
vi.mock("./payoutService.js", () => ({ getRecentPayouts: vi.fn(), getUnpaidCompletedJobs: vi.fn(), recordPayout: vi.fn() }));
vi.mock("../cleaners/cleanerService.js", () => ({ getAllCleaners: vi.fn() }));

afterEach(() => {
  resetCurrentOrganizationId();
  vi.resetAllMocks();
});

function openReview() {
  setCurrentOrganizationId("company-one");
  return renderHook(() => usePayoutsController({ view: "payout-review" }));
}

it.each(["switch", "unmount"])("rejects a follow-up proof upload after a session %s", async (change) => {
  const { result, unmount } = openReview();
  const attach = result.current.proof.attachProof;
  uploadPayoutProof.mockResolvedValueOnce(undefined);
  if (change === "switch") setCurrentOrganizationId("company-two");
  else unmount();
  await expect(attach("payout-1", new Blob(["example"]))).rejects.toMatchObject({ code: "organization-changed" });
  expect(uploadPayoutProof).not.toHaveBeenCalled();
});

it("keeps the original upload arguments on a retry in the same company", async () => {
  const { result } = openReview();
  const file = new Blob(["example"]);
  const progress = vi.fn();
  uploadPayoutProof.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(undefined);
  await expect(result.current.proof.attachProof("payout-1", file, progress)).rejects.toThrow("offline");
  await result.current.proof.attachProof("payout-1", file, progress);
  expect(uploadPayoutProof).toHaveBeenCalledTimes(2);
  expect(uploadPayoutProof).toHaveBeenLastCalledWith({ payoutId: "payout-1", file, onProgress: progress });
});
