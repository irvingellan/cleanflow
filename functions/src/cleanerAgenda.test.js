import { describe, expect, it } from "vitest";
import {
  computeAgendaEntries,
  offeredCompensationFor,
  checklistAgendaSummary,
  rosterCleanerIds,
  sameEntry,
} from "./cleanerAgenda.js";

const now = new Date("2026-11-03T12:00:00Z");
const future = { toMillis: () => now.getTime() + 86400000 };
const past = { toMillis: () => now.getTime() - 1000 };

function job(extra = {}) {
  return {
    schemaVersion: 2,
    operationalStatus: "ASSIGNED",
    assignedCleanerIds: ["ana"],
    propertyName: "  Maple   Example House ",
    scheduledDate: "2026-11-06",
    scheduledStart: "10:30",
    scheduleRevision: 2,
    clientPrice: 250,
    cleanerPayout: 150,
    notes: "  Synthetic task A\nSynthetic task B  ",
    guestName: "private",
    ...extra,
  };
}

describe("cleaner agenda projection", () => {
  it("projects only cleaner-safe fields for the current roster", () => {
    const entries = computeAgendaEntries({ organizationId: "org", jobId: "j1", job: job(), assignments: [{ cleanerId: "ana", isActive: true, cleanerAcknowledgedAt: {} }], now });
    expect([...entries.keys()]).toEqual(["ana"]);
    expect(entries.get("ana")).toEqual({
      organizationId: "org", cleanerId: "ana", jobId: "j1", jobStatus: "ASSIGNED",
      scheduledDate: "2026-11-06", scheduledStart: "10:30", propertyName: "Maple Example House",
      address: null, notes: "Synthetic task A\nSynthetic task B",
      scheduleRevision: 2, reschedule: null, kind: "ASSIGNED", serviceType: "STANDARD", acknowledged: true, offerStatus: null, offeredCompensation: null,
      checklist: { status: "NONE", started: false }, checklistStatus: "NONE", checklistStarted: false,
    });
    expect(JSON.stringify([...entries.values()])).not.toMatch(/250|150|private/);
  });

  it("drops everything for archived (cancelled) or missing Jobs", () => {
    expect(computeAgendaEntries({ organizationId: "o", jobId: "j", job: job({ archivedAt: {} }) }).size).toBe(0);
    expect(computeAgendaEntries({ organizationId: "o", jobId: "j", job: null }).size).toBe(0);
  });

  it("keeps legacy single-cleaner Jobs only while assigned, in progress or completed", () => {
    const legacy = { assignedCleanerId: "ana", operationalStatus: "IN_PROGRESS" };
    expect(rosterCleanerIds(legacy)).toEqual(["ana"]);
    expect(rosterCleanerIds({ ...legacy, operationalStatus: "OFFERED" })).toEqual([]);
    expect(rosterCleanerIds(job({ assignedCleanerIds: ["ana", "ana", "bia/../x", ""] }))).toEqual(["ana"]);
  });

  it("shows only live, unanswered-or-interested Offers that are not already assignments", () => {
    const offers = [
      { cleanerId: "bia", status: "PENDING", publicOfferExpiresAt: future, offeredCompensation: 140 },
      { cleanerId: "cris", status: "INTERESTED", publicOfferExpiresAt: future },
      { cleanerId: "dani", status: "DECLINED", publicOfferExpiresAt: future },
      { cleanerId: "eva", status: "PENDING", publicOfferExpiresAt: past },
      { cleanerId: "fia", status: "PENDING" },
      { cleanerId: "gia", status: "PENDING", publicOfferExpiresAt: { toMillis: () => NaN } },
      { cleanerId: "ana", status: "INTERESTED", publicOfferExpiresAt: future },
    ];
    const entries = computeAgendaEntries({ organizationId: "o", jobId: "j", job: job({ operationalStatus: "OFFERED", assignedCleanerIds: ["ana"], requiredCleanerCount: 3 }), offers, now });
    expect([...entries.entries()].map(([id, entry]) => [id, entry.kind, entry.offerStatus, entry.offeredCompensation])).toEqual([
      ["ana", "ASSIGNED", null, null],
      ["bia", "OFFER", "PENDING", 140],
      ["cris", "OFFER", "INTERESTED", null],
    ]);
    // FB08: with the default single spot filled, the live invites read as taken.
    const filled = computeAgendaEntries({ organizationId: "o", jobId: "j", job: job({ operationalStatus: "ASSIGNED", assignedCleanerIds: ["ana"] }), offers, now });
    expect([...filled.entries()].map(([id, entry]) => [id, entry.kind, entry.offerStatus])).toEqual([
      ["ana", "ASSIGNED", null], ["bia", "OFFER", "ALREADY_TAKEN"], ["cris", "OFFER", "ALREADY_TAKEN"],
    ]);
    expect(entries.get("bia").offerExpiresAtMs).toBe(future.toMillis());
    expect(sameEntry(entries.get("bia"), { ...entries.get("bia"), offerExpiresAtMs: future.toMillis() + 1 })).toBe(false);
  });

  it("refreshes only a recipient's rate and keeps client and other pay fields out of the projection", () => {
    const offeredPay = { mode: "HOURLY", rateCents: 3125 };
    const input = { organizationId: "o", jobId: "j", now,
      job: job({ operationalStatus: "OFFERED", assignedCleanerIds: [], pay: { mode: "HOURLY", rateCents: 8080 } }),
      offers: [{ cleanerId: "first", status: "PENDING", publicOfferExpiresAt: future, offeredPay: { ...offeredPay, private: true } },
        { cleanerId: "second", status: "PENDING", publicOfferExpiresAt: future, offeredPay: { ...offeredPay, rateCents: 2525 } }] };
    const entries = computeAgendaEntries(input);
    expect(entries.get("first").offeredPay).toEqual(offeredPay);
    expect(entries.get("second").offeredPay.rateCents).toBe(2525);
    expect(entries.get("first")).not.toHaveProperty("offeredCompensation");
    expect(sameEntry(entries.get("first"), structuredClone(entries.get("first")))).toBe(true);
    expect(sameEntry(entries.get("first"), { ...entries.get("first"), offeredPay: { ...offeredPay, rateCents: 4000 } })).toBe(false);
  });

  it("refreshes type, address and job instructions for current offer and assignment holders", () => {
    const input = {
      organizationId: "o", jobId: "j", now,
      offers: [{ cleanerId: "bia", status: "PENDING", publicOfferExpiresAt: future }],
    };
    const openJob = job({ requiredCleanerCount: 2 });
    const before = computeAgendaEntries({ ...input, job: openJob });
    const after = computeAgendaEntries({ ...input, address: "Synthetic site A", job: {
      ...openJob, serviceType: "POST_CONSTRUCTION", notes: "Revised synthetic task",
    } });
    for (const id of ["ana", "bia"]) {
      const entry = after.get(id);
      expect(entry).toMatchObject({ serviceType: "POST_CONSTRUCTION", address: "Synthetic site A", notes: "Revised synthetic task" });
      expect(sameEntry(before.get(id), entry)).toBe(false);
      for (const field of ["serviceType", "address", "notes"]) {
        expect(sameEntry(entry, { ...entry, [field]: null })).toBe(false);
      }
    }
    expect(after.has("unrelated")).toBe(false);
    const closed = computeAgendaEntries({ ...input, job: job() }).get("bia");
    for (const key of ["serviceType", "address", "notes"]) expect(closed).not.toHaveProperty(key);
  });


  it("keeps a non-actionable automatic offer for the original recipient after another cleaner takes it", () => {
    const offers = [{
      jobId: "j",
      cleanerId: "bia",
      status: "PENDING",
      offerDistributionMode: "FIRST_ACCEPT_WINS",
      offeredChecklistContextRevision: 0,
      offeredPropertyName: "Original Property",
      offeredScheduledDate: "2026-11-05",
      offeredScheduledStart: "09:00",
      publicOfferExpiresAt: future,
      offeredCompensation: 140,
    }];
    const entries = computeAgendaEntries({
      organizationId: "o", jobId: "j",
      job: job({ offerDistributionMode: "FIRST_ACCEPT_WINS", offerDistributionClosedAt: {} }),
      offers, now,
    });
    expect(entries.get("bia")).toMatchObject({
      kind: "OFFER", offerStatus: "ALREADY_TAKEN", offerDistributionMode: "FIRST_ACCEPT_WINS",
      jobStatus: "OFFERED", propertyName: "Original Property", scheduledDate: "2026-11-05",
      scheduledStart: "09:00", scheduleRevision: 0,
    });
    expect(JSON.stringify(entries.get("bia"))).not.toMatch(/ana|250|150|private|Maple|10:30|Synthetic task/);
  });

  it.each(["ACCEPTED", "INTERESTED", "SELECTED"])("uses the active assignment's own %s offer, including zero", status => {
    const offers = [
      { offerReferenceId: "older", cleanerId: "holder", status, offeredCompensation: 120 },
      { offerReferenceId: "current", cleanerId: "holder", status, offeredCompensation: 0 },
      { offerReferenceId: "another", cleanerId: "other", status, offeredCompensation: 180 },
    ];
    const project = (assignment, records = offers) => computeAgendaEntries({
      organizationId: "o", jobId: "j", now, job: job({ assignedCleanerIds: ["holder"] }),
      assignments: [{ cleanerId: "holder", isActive: true, ...assignment }], offers: records,
    }).get("holder").offeredCompensation;
    expect(project({ sourceOfferId: "current" })).toBe(0);
    expect(project({ sourceOfferId: "older" })).toBe(120);
    expect(project({ sourceOfferId: "another" })).toBeNull();
    expect(project({ sourceOfferId: "current", isActive: false })).toBeNull();
    expect(project({ sourceOfferId: "current", organizationId: "other-org" })).toBeNull();
    expect(project({})).toBeNull();
    expect(project({ sourceOfferId: "current" }, [{ ...offers[1], organizationId: "other-org" }])).toBeNull();
  });

  it("shows only the active holder's frozen offer or direct agreement and resolves the actual first slot", () => {
    const quote = { offeredCompensation: 3.33, offeredFirstSlotExtraCents: 1 };
    const input = {
      organizationId: "o", jobId: "j", now,
      job: job({ requiredCleanerCount: 3, assignedCleanerIds: ["second-invite", "first-invite", "direct"], cleanerPayout: 900 }),
      offers: ["first-invite", "second-invite"].map(id => ({ cleanerId: id, offerReferenceId: id, status: "ACCEPTED", ...quote })),
      assignments: ["first-invite", "second-invite"].map(id => ({ cleanerId: id, sourceOfferId: id, isActive: true })),
    };
    input.assignments.push({ cleanerId: "direct", source: "MANAGER_DIRECT", isActive: true, paySnapshot: { ...quote, internal: "private" } });
    const entries = computeAgendaEntries(input);
    expect(entries.get("second-invite").offeredCompensation).toBe(3.34);
    expect(entries.get("first-invite").offeredCompensation).toBe(3.33);
    expect(entries.get("direct").offeredCompensation).toBe(3.33);
    expect(JSON.stringify([...entries.values()])).not.toMatch(/900|offeredFirstSlotExtraCents|private/);
    expect(sameEntry(entries.get("direct"), { ...entries.get("direct"), offeredFirstSlotExtraCents: 1 })).toBe(false);
  });

  it("uses the legacy holder's interested offer before the single-cleaner payout", () => {
    const legacy = { operationalStatus: "ASSIGNED", assignedCleanerId: "holder", cleanerPayout: 90 };
    const own = { offerReferenceId: "holder", cleanerId: "holder", status: "INTERESTED", offeredCompensation: 45 };
    const amount = (offers) => computeAgendaEntries({ organizationId: "o", jobId: "j", now, job: legacy, offers })
      .get("holder").offeredCompensation;
    expect(amount([own])).toBe(45);
    expect(amount([{ ...own, offeredCompensation: null }])).toBeNull();
    expect(amount([{ ...own, status: "DECLINED" }])).toBe(90);
    expect(amount([{ ...own, cleanerId: "other" }])).toBe(90);
    expect(amount([])).toBe(90);
  });

  it("never gives a closed legacy invitation the current job payout", () => {
    const input = {
      organizationId: "o", jobId: "j", now,
      job: { operationalStatus: "OFFERED", assignedCleanerId: "selected", cleanerPayout: 210 },
    };
    const offer = { cleanerId: "previous-invitee", status: "INTERESTED", publicOfferExpiresAt: future };
    const entry = (snapshot) => computeAgendaEntries({ ...input, offers: [{ ...offer, ...snapshot }] })
      .get("previous-invitee");
    expect(entry({})).toMatchObject({ offerStatus: "ALREADY_TAKEN", offeredCompensation: null });
    expect(entry({ offeredCompensation: 0 }).offeredCompensation).toBe(0);
  });

  it("never treats a v2 Job-level payout as one cleaner's offered amount", () => {
    expect(offeredCompensationFor({}, job())).toBeNull();
    expect(offeredCompensationFor({}, { cleanerPayout: 120 })).toBe(120);
    expect(offeredCompensationFor({ offeredCompensation: -1 }, job())).toBeNull();
  });

  it("exposes only the current assignment's own reschedule state and the revision's before/after", () => {
    const organizationId = "org-a", jobId = "job-a";
    const active = (id, cleanerId) => ({ organizationId, jobId, cleanerId, id, isActive: true });
    const assignments = [active("active-a", "a"), active("active-b", "b"), active("replacement-c", "c")];
    const input = {
      organizationId, jobId, now, assignments, offers: [{ cleanerId: "d", status: "PENDING", publicOfferExpiresAt: future }],
      job: job({ organizationId, assignedCleanerIds: ["a", "b", "c"], requiredCleanerCount: 4, scheduleRevision: 4,
        scheduleConfirmation: { revision: 4, byCleaner: { a: { state: "PENDING", assignmentId: "active-a" },
          b: { state: "CONFIRMED", assignmentId: "active-b" }, c: { state: "PENDING", assignmentId: "old-c" } } } }),
      scheduleHistory: { scheduleRevision: 4, newScheduledDate: "2026-11-06", newScheduledStart: "10:30",
        previousScheduledDate: "2026-11-03", previousScheduledStart: "09:00", actorUid: "excluded" },
    };
    const entries = computeAgendaEntries(input);
    const details = { scheduleRevision: 4, scheduledDate: "2026-11-06", scheduledStart: "10:30",
      previousScheduledDate: "2026-11-03", previousScheduledStart: "09:00" };
    expect(entries.get("a").reschedule).toEqual({ ...details, state: "PENDING" });
    expect(entries.get("b").reschedule).toEqual({ ...details, state: "CONFIRMED" });
    expect(entries.get("c").reschedule).toBeNull();
    expect(entries.get("d")).not.toHaveProperty("reschedule");
    const replay = computeAgendaEntries(input).get("a");
    expect(sameEntry(entries.get("a"), replay)).toBe(true);
    expect(sameEntry(replay, { ...replay, reschedule: { ...replay.reschedule, state: "CONFIRMED" } })).toBe(false);
    const later = computeAgendaEntries({ ...input, job: { ...input.job, scheduleRevision: 5 } }).get("a");
    expect(later.reschedule).toBeNull();
    expect(sameEntry(replay, later)).toBe(false);
    // Even if the revision itself is unchanged, losing the active Assignment clears the prompt.
    const replaced = computeAgendaEntries({ ...input, assignments: [active("new-a", "a")] }).get("a");
    expect(replaced.reschedule).toBeNull();
    expect(sameEntry(replay, replaced)).toBe(false);
  });

  it("distinguishes older projections from a checked revision with no confirmation", () => {
    const assigned = (scheduleRevision) => computeAgendaEntries({
      organizationId: "o", jobId: "j", job: job({ scheduleRevision }),
    }).get("ana");
    const checked = assigned(2);
    const { reschedule, ...old } = checked;
    expect(reschedule).toBeNull();
    expect(sameEntry(old, checked)).toBe(false);
    expect(sameEntry(checked, assigned(2))).toBe(true);
    expect(assigned(0)).not.toHaveProperty("reschedule");
  });

  it("detects unchanged entries so syncs do not rewrite them", () => {
    const entry = computeAgendaEntries({ organizationId: "o", jobId: "j", job: job() }).get("ana");
    expect(sameEntry({ ...entry, syncedAt: "x" }, entry)).toBe(true);
    expect(sameEntry({ ...entry, scheduledStart: "11:00" }, entry)).toBe(false);
    expect(sameEntry(undefined, entry)).toBe(false);
  });

  it("FB04: carries the Job's checklist state on assigned entries only", () => {
    expect(checklistAgendaSummary()).toEqual({ status: "NONE", started: false });
    expect(checklistAgendaSummary({ run: { status: "DRAFT" } })).toEqual({ status: "DRAFT", started: false });
    expect(checklistAgendaSummary({ run: { status: "DRAFT" }, draft: { revision: 3 } })).toEqual({ status: "DRAFT", started: true });
    expect(checklistAgendaSummary({ run: { status: "DRAFT" }, evidenceState: { photos: [{}] } })).toEqual({ status: "DRAFT", started: true, photoCount: 1 });
    expect(checklistAgendaSummary({ run: { status: "READY_FOR_REVIEW" }, draft: { revision: 9 } })).toEqual({ status: "READY_FOR_REVIEW", started: false });
    expect(checklistAgendaSummary({ run: { status: "SOMETHING_ELSE" } })).toEqual({ status: "NONE", started: false });
    const checklist = { status: "DRAFT", started: true };
    const entries = computeAgendaEntries({ organizationId: "o", jobId: "j", checklist, now,
      job: job({ operationalStatus: "ASSIGNED", assignedCleanerIds: ["ana"], requiredCleanerCount: 2 }),
      offers: [{ cleanerId: "bia", status: "PENDING", publicOfferExpiresAt: future }] });
    expect(entries.get("ana")).toMatchObject({ checklist, checklistStatus: "DRAFT", checklistStarted: true });
    expect(entries.get("bia")).not.toHaveProperty("checklist");
    expect(sameEntry(entries.get("ana"), { ...entries.get("ana"), checklistStarted: false })).toBe(false);
  });

  it("counts snapshot tasks, inventory answers and only saved photos for active and submitted Runs", () => {
    const resolvedDefinition = {
      sections: [{ items: [{ id: "done" }, { id: "skipped", canBeNotApplicable: true }, { id: "blank" }] }],
      inventoryItems: [{ id: "stock" }],
    };
    const draft = { revision: 2, checklistAnswers: {
      done: "DONE", skipped: "NOT_APPLICABLE", blank: "NOT_APPLICABLE", deleted: "DONE",
    }, inventoryAnswers: { stock: "HIGH" } };
    const evidenceState = { photos: [{ evidenceId: "photo" }], pending: [{ status: "RESERVED" }], contentCount: 3 };
    for (const status of ["DRAFT", "READY_FOR_REVIEW"]) {
      expect(checklistAgendaSummary({ run: { status, resolvedDefinition }, draft, evidenceState })).toEqual({
        status, started: status === "DRAFT", answeredItems: 3, totalItems: 4, photoCount: 1,
      });
    }
    expect(checklistAgendaSummary({ run: { status: "DRAFT", resolvedDefinition, evidencePolicy: { version: 2 } } }))
      .toEqual({ status: "DRAFT", started: false, answeredItems: 0, totalItems: 4, photoCount: 0 });
    expect(checklistAgendaSummary({ run: { status: "ABANDONED", resolvedDefinition }, draft, evidenceState }))
      .toEqual({ status: "ABANDONED", started: false });
  });

  it("projects the start and guest check-in on assigned entries and detects facts changing or clearing", () => {
    const input = {
      organizationId: "o", jobId: "j", now,
      job: job({ operationalStatus: "IN_PROGRESS", startedAt: { toMillis: () => now.getTime() }, guestCheckInTime: "15:00" }),
      checklist: { status: "DRAFT", started: true, answeredItems: 1, totalItems: 3, photoCount: 0 },
    };
    const entry = computeAgendaEntries(input).get("ana");
    expect(entry).toMatchObject({ startedAtMs: now.getTime(), guestCheckInTime: "15:00" });
    expect(sameEntry(entry, { ...entry, checklist: { ...entry.checklist, answeredItems: 2 } })).toBe(false);
    const cleared = computeAgendaEntries({ ...input, job: { ...input.job, startedAt: null, guestCheckInTime: "24:00" } }).get("ana");
    expect(cleared).not.toHaveProperty("guestCheckInTime");
    expect(cleared).not.toHaveProperty("startedAtMs");
    expect(sameEntry(entry, cleared)).toBe(false);

    const offer = computeAgendaEntries({ ...input, job: { ...input.job, operationalStatus: "OFFERED" },
      offers: [{ cleanerId: "bia", status: "PENDING", publicOfferExpiresAt: future }] }).get("bia");
    expect(offer).toBeDefined();
    expect(offer).not.toHaveProperty("guestCheckInTime");
    expect(offer).not.toHaveProperty("startedAtMs");
  });
});
