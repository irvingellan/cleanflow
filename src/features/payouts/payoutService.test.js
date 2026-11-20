import { afterEach, describe, expect, it, vi } from "vitest";
import { runTransaction, updateDoc } from "firebase/firestore";
import { uploadBytesResumable } from "firebase/storage";
import { resetCurrentOrganizationId, setCurrentOrganizationId } from "../../services/organization/currentOrganization.js";
import { uploadPayoutProof } from "./payoutProofService.js";
import { isEligibleForLegacyPayout, recordPayout } from "./payoutService.js";

vi.mock("../../services/firebase/client.js", () => ({ db: {}, storage: {} }));
vi.mock("firebase/firestore", () => ({
  collection: (_db, ...parts) => parts.join("/"),
  doc: (reference, ...parts) => parts.length ? parts.join("/") : reference + "/payout-1",
  runTransaction: vi.fn(),
  serverTimestamp: () => "server-time",
  updateDoc: vi.fn(),
}));
vi.mock("firebase/storage", () => ({
  ref: (_storage, path) => path,
  uploadBytesResumable: vi.fn(),
}));

describe("legacy payout eligibility", () => {
  it("keeps compatible singular Jobs eligible while excluding v2 team Jobs", () => {
    const legacyJob = {
      operationalStatus: "COMPLETED",
      assignedCleanerId: "cleaner-1",
      cleanerPayout: 100,
    };

    expect(isEligibleForLegacyPayout(legacyJob)).toBe(true);
    expect(isEligibleForLegacyPayout({ ...legacyJob, schemaVersion: 2 })).toBe(false);
  });
});

describe("organization changes during a payout", () => {
  afterEach(resetCurrentOrganizationId);

  it("writes the original organization into the payout after reading its Jobs", async () => {
    setCurrentOrganizationId("company-one");
    const transaction = { get: vi.fn(), set: vi.fn(), update: vi.fn() };
    const job = { operationalStatus: "COMPLETED", assignedCleanerId: "cleaner-1", cleanerPayout: 25 };
    transaction.get.mockResolvedValue({ id: "job-1", data: () => job });
    runTransaction.mockImplementationOnce((_db, callback) => callback(transaction));
    const pending = recordPayout({ cleaner: { id: "cleaner-1" }, jobIds: ["job-1"], paymentMethod: "CASH" });
    setCurrentOrganizationId("company-two");
    await pending;
    expect(transaction.get).toHaveBeenCalledWith("organizations/company-one/jobs/job-1");
    expect(transaction.set).toHaveBeenCalledWith("organizations/company-one/payouts/payout-1",
      expect.objectContaining({ organizationId: "company-one" }));
  });

  it("keeps the proof upload and its metadata on the same payout", async () => {
    setCurrentOrganizationId("company-one");
    let finishUpload;
    uploadBytesResumable.mockReturnValueOnce({
      on: (_event, _progress, _error, complete) => { finishUpload = complete; },
    });
    updateDoc.mockResolvedValueOnce(undefined);
    const file = new File(["example"], "proof.png", { type: "image/png" });
    const pending = uploadPayoutProof({ payoutId: "payout-1", file });
    setCurrentOrganizationId("company-two");
    finishUpload();
    await pending;
    const payout = "organizations/company-one/payouts/payout-1";
    const proof = payout + "/proof/payment-proof";
    expect(uploadBytesResumable).toHaveBeenCalledWith(proof, file, { contentType: "image/png" });
    expect(updateDoc).toHaveBeenCalledWith(payout, expect.objectContaining({ proofStoragePath: proof }));
  });
});
