import { describe, expect, it, vi } from "vitest";
import { onOfferWrite } from "./cleanerAgendaTriggers.js";
import { syncCleanerAgendaForJob } from "../cleanerAgenda.js";
import { recordCleanerOfferInboxEvent } from "../cleanerNotificationEvents.js";

vi.mock("../cleanerAgenda.js", () => ({ syncCleanerAgendaForJob: vi.fn() }));
vi.mock("../cleanerNotificationEvents.js", () => ({ recordCleanerJobInboxEvents: vi.fn(), recordCleanerOfferInboxEvent: vi.fn() }));
vi.mock("../runtime/firebase.js", () => ({ db: {} }));

describe("agenda refresh for additional automatic invitations", () => {
  it("leaves the initial batch to the Job trigger and refreshes each extension once without extra notification events", async () => {
    async function created(id, extension) {
      const event = { params: { orgId: "org", jobId: "job", offerId: id }, id, data: {
        before: { exists: false }, after: { data: () => ({ offerDistributionMode: "FIRST_ACCEPT_WINS", ...extension }) },
      } };
      await onOfferWrite(event);
    }
    await created("initial-1");
    await created("initial-2");
    expect(syncCleanerAgendaForJob).not.toHaveBeenCalled();
    await created("extension-1", { syncExtendedBatchAgenda: true });
    await created("extension-2");
    expect(syncCleanerAgendaForJob).toHaveBeenCalledExactlyOnceWith({}, { organizationId: "org", jobId: "job" });
    expect(recordCleanerOfferInboxEvent.mock.calls.map(([, { offerId }]) => offerId))
      .toEqual(["initial-1", "initial-2", "extension-1", "extension-2"]);
  });
});
