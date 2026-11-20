import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Timestamp } from "firebase-admin/firestore";

// Bearer links work for any organization and can never cross organizations:
// the organization is the one the token's own document lives in. Every read is
// recorded, so a test can prove that no path of another organization was touched.
const firestore = vi.hoisted(() => ({ current: null }));
vi.mock("./runtime/firebase.js", () => ({
  get db() { return firestore.current.database; },
}));

import { pilotChecklistPhotoRequirementId } from "./checklistEvidenceDefinition.js";
import { loadPublicChecklistCapability, savePublicChecklistDraft } from "./checklistCapabilityService.js";
import { resolveActiveCapability } from "./checklistEvidenceService.js";
import { clientReportCapabilityId, downloadPublicClientReportPhoto, loadPublicClientReport } from "./clientReportService.js";
import {
  downloadPublicClientPortalPhoto, loadPublicClientPortal, loadPublicClientPortalReport,
} from "./clientPortalService.js";
import { publicOffer } from "./handlers/publicOffer.js";

const now = new Date("2026-11-13T20:00:00Z");
const later = Timestamp.fromMillis(now.getTime() + 86_400_000);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const token = (letter) => letter.repeat(43);
const organizations = ["org-a", "org-b"];
const letter = (org) => org.slice(-1);
const title = (org) => `House ${letter(org).toUpperCase()}`;
const root = (org) => `organizations/${org}`;
const runPath = (org) => `${root(org)}/jobs/job-${letter(org)}/checklistRuns/initial`;

const checklistHash = (org) => hash(`checklist-${org}`);
const reportHash = (org) => hash(`report-${org}`);
const portalHash = (org) => hash(`portal-${org}`);
const offerToken = (org) => token(letter(org));

function fakeFirestore(seed) {
  const data = new Map(Object.entries(seed));
  const reads = [];
  const snapshot = (path) => ({
    exists: data.get(path) !== undefined, id: path.split("/").at(-1), ref: reference(path), data: () => data.get(path),
  });
  function reference(path) {
    const segments = path.split("/");
    return {
      path,
      id: segments.at(-1),
      get parent() { return collection(segments.slice(0, -1).join("/")); },
      collection: (name) => collection(`${path}/${name}`),
      get: async () => { reads.push(path); return snapshot(path); },
    };
  }
  function query(collectionPath, group, filters = []) {
    return {
      where: (field, operator, value) => query(collectionPath, group, [...filters, [field, operator, value]]),
      orderBy: () => query(collectionPath, group, filters),
      limit: () => query(collectionPath, group, filters),
      get: async () => {
        reads.push(group ? `collectionGroup:${group}` : `${collectionPath}/*`);
        const depth = collectionPath ? collectionPath.split("/").length + 1 : 0;
        const docs = [...data.keys()].filter((path) => {
          const segments = path.split("/");
          return group ? segments.length % 2 === 0 && segments.at(-2) === group
            : path.startsWith(`${collectionPath}/`) && segments.length === depth;
        }).filter((path) => filters.every(([field, operator, value]) => {
          const stored = data.get(path)?.[field];
          return operator === "==" ? stored === value : operator === ">=" ? stored >= value : operator === "<=" && stored <= value;
        })).map(snapshot);
        return { size: docs.length, empty: docs.length === 0, docs };
      },
    };
  }
  function collection(path) {
    const segments = path.split("/");
    return {
      path,
      id: segments.at(-1),
      get parent() { return segments.length > 1 ? reference(segments.slice(0, -1).join("/")) : null; },
      doc: (id) => reference(`${path}/${id}`),
      ...query(path, null),
    };
  }
  const database = {
    doc: reference,
    collection,
    collectionGroup: (name) => query(null, name),
    getAll: (...references) => Promise.all(references.map((entry) => entry.get())),
    runTransaction: async (callback) => callback({
      get: (target) => target.get(),
      getAll: (...references) => Promise.all(references.map((entry) => entry.get())),
    }),
  };
  return { database, reads, data };
}

/** One complete, independent set of public links per organization. */
function organizationRecords(org) {
  const cleanerId = `cleaner-${letter(org)}`;
  const run = {
    organizationId: org,
    jobId: `job-${letter(org)}`,
    status: "READY_FOR_REVIEW",
    readyForReviewDraftRevision: 2,
    propertySnapshot: { propertyName: title(org) },
    jobSnapshot: { scheduledDate: "2026-11-13" },
    resolvedDefinition: {
      sections: [{ id: "bathrooms", titleKey: "checklistPreview.bathrooms",
        items: [{ id: "bathroom-sanitize", labelKey: "checklistPreview.bathroomSanitize" }] }],
      inventoryItems: [{ id: "hand-soap", labelKey: "checklistPreview.handSoap" }],
      requiredPhotoTypes: [],
    },
  };
  return {
    [`${root(org)}/clients/client-${letter(org)}`]: { organizationId: org, name: `Owner ${letter(org).toUpperCase()}` },
    [`${root(org)}/clients/client-${letter(org)}/portalAccess/active`]: { status: "ACTIVE", tokenHash: portalHash(org), expiresAt: later },
    [`${root(org)}/properties/house-${letter(org)}`]: { organizationId: org, clientId: `client-${letter(org)}`, name: title(org) },
    [`${root(org)}/cleaners/${cleanerId}`]: { organizationId: org, name: `Cleaner ${letter(org).toUpperCase()}`, preferredLanguage: org === "org-a" ? "pt" : "es" },
    [`${root(org)}/jobs/job-${letter(org)}`]: {
      organizationId: org, schemaVersion: 1, operationalStatus: "ASSIGNED", assignedCleanerId: cleanerId,
      assignedCleanerName: `Cleaner ${letter(org).toUpperCase()}`, checklistContextRevision: 0, clientId: `client-${letter(org)}`,
      propertyId: `house-${letter(org)}`, propertyName: title(org), scheduledDate: "2026-11-13", scheduledStart: "09:00",
    },
    // The offer handler reads the real clock, so its link expires relative to today.
    [`${root(org)}/jobs/open-job-${letter(org)}`]: {
      organizationId: org, schemaVersion: 1, operationalStatus: "OFFERED", propertyName: title(org),
      scheduledDate: "2026-11-13", scheduledStart: "09:00",
    },
    [`${root(org)}/jobs/open-job-${letter(org)}/offers/${cleanerId}`]: {
      organizationId: org, cleanerId, status: "PENDING", publicOfferTokenHash: hash(offerToken(org)),
      publicOfferExpiresAt: Timestamp.fromMillis(Date.now() + 86_400_000), offeredCompensation: org === "org-a" ? 111 : 222,
    },
    [runPath(org)]: run,
    [`${runPath(org)}/drafts/current`]: {
      revision: 2, checklistAnswers: { "bathroom-sanitize": "DONE" }, inventoryAnswers: { "hand-soap": "HIGH" },
      issueNotes: "", generalNotes: `Note from ${title(org)}`,
    },
    [`${runPath(org)}/evidence/${pilotChecklistPhotoRequirementId}`]: { status: "SAVED", requirementId: pilotChecklistPhotoRequirementId },
    [`${runPath(org)}/checklistCapabilities/active`]: {
      organizationId: org, jobId: `job-${letter(org)}`, runId: "initial", status: "ACTIVE", tokenHash: checklistHash(org),
      cleanerId, contextRevision: 0, expiresAt: later,
    },
    [`${runPath(org)}/clientReportCapabilities/${clientReportCapabilityId}`]: { status: "ACTIVE", tokenHash: reportHash(org), expiresAt: later },
    [`clientReportTokenLookups/${reportHash(org)}`]: { organizationId: org, jobId: `job-${letter(org)}`, runId: "initial", status: "ACTIVE", expiresAt: later },
    [`clientPortalTokenLookups/${portalHash(org)}`]: { organizationId: org, clientId: `client-${letter(org)}`, status: "ACTIVE", expiresAt: later },
  };
}

function seed(changes = {}) {
  firestore.current = fakeFirestore({ ...organizationRecords("org-a"), ...organizationRecords("org-b"), ...changes });
  return firestore.current;
}

/** Every organization path that was read belongs to `org`; lookups by token hash are the only global reads. */
function expectOnlyReads(org, reads) {
  const other = organizations.find((candidate) => candidate !== org);
  const organizationReads = reads.filter((path) => path.startsWith("organizations/"));
  expect(organizationReads.length).toBeGreaterThan(0);
  expect(organizationReads.filter((path) => !path.startsWith(`${root(org)}/`))).toEqual([]);
  expect(reads.filter((path) => path.includes(other))).toEqual([]);
  for (const path of reads.filter((entry) => !entry.startsWith("organizations/"))) {
    expect(path).toMatch(/^(collectionGroup:(checklistCapabilities|offers)|client(Report|Portal)TokenLookups\/[a-f0-9]{64})$/);
  }
}

function response() {
  const result = { headers: {}, statusCode: null, body: undefined };
  return Object.assign(result, {
    set: (name, value) => { result.headers[name] = value; return result; },
    status: (code) => { result.statusCode = code; return result; },
    json: (body) => { result.body = body; return result; },
    send: (body) => { result.body = body; return result; },
    end: () => result,
  });
}

beforeEach(() => { seed(); });

describe.each([["org-a", "org-b"], ["org-b", "org-a"]])("public links of %s", (org, other) => {
  it("public checklist: the token returns only its own organization's checklist", async () => {
    const { database, reads } = firestore.current;
    // A caller-supplied organization is ignored: nothing but the token selects the record.
    const result = await loadPublicChecklistCapability(database, { organizationId: other, tokenHash: checklistHash(org), now });
    expect(result.state).toBe("active");
    expect(result.checklist.preferredLanguage).toBe(org === "org-a" ? "pt" : "es");
    expect(JSON.stringify(result)).toContain(title(org));
    expect(JSON.stringify(result)).not.toContain(title(other));
    expectOnlyReads(org, reads);
  });

  it("public checklist photos: the capability resolves inside its own organization", async () => {
    const { database, reads } = firestore.current;
    const resolved = await resolveActiveCapability(database, { tokenHash: checklistHash(org), now });
    expect(resolved.location).toEqual({ organizationId: org, jobId: `job-${letter(org)}`, runId: "initial" });
    expect(resolved.runRef.path).toBe(runPath(org));
    expect(resolved.jobRef.path).toBe(`${root(org)}/jobs/job-${letter(org)}`);
    expectOnlyReads(org, reads);
  });

  it("client report: the token returns only its own organization's report", async () => {
    const { database, reads } = firestore.current;
    const report = await loadPublicClientReport(database, { organizationId: other, tokenHash: reportHash(org), now });
    expect(report.propertyName).toBe(title(org));
    expect(JSON.stringify(report)).not.toContain(title(other));
    expectOnlyReads(org, reads);
  });

  it("client portal: the token lists and opens only its own organization's services", async () => {
    const { database, reads } = firestore.current;
    const portal = await loadPublicClientPortal(database, { organizationId: other, tokenHash: portalHash(org), now });
    expect(JSON.stringify(portal)).toContain(title(org));
    expect(JSON.stringify(portal)).not.toContain(title(other));
    const report = await loadPublicClientPortalReport(database, { tokenHash: portalHash(org), jobId: `job-${letter(org)}`, now });
    expect(report.propertyName).toBe(title(org));
    expectOnlyReads(org, reads);
  });

  it("client portal: a service of another organization is not found, and nothing of it is read", async () => {
    const { database, reads } = firestore.current;
    const request = { tokenHash: portalHash(org), jobId: `job-${letter(other)}`, now };
    await expect(loadPublicClientPortalReport(database, request)).rejects.toMatchObject({ code: "not-found" });
    await expect(downloadPublicClientPortalPhoto(database, { ...request, storage: {} })).rejects.toMatchObject({ code: "not-found" });
    expect(reads.filter((path) => path.startsWith(`${root(other)}/`))).toEqual([]);
  });

  it("public offer: the token shows and answers only its own organization's offer", async () => {
    const { reads } = firestore.current;
    const shown = response();
    await publicOffer({ method: "GET", query: { token: offerToken(org) } }, shown);
    expect(shown.statusCode).toBe(200);
    expect(shown.body.offer).toMatchObject({ propertyName: title(org), offeredCompensation: org === "org-a" ? 111 : 222,
      preferredLanguage: org === "org-a" ? "pt" : "es" });
    expectOnlyReads(org, reads);

    // The answer runs in the offer's own organization; an unsupported status proves the route without writing.
    reads.length = 0;
    const answered = response();
    await publicOffer({ method: "POST", body: { token: offerToken(org), status: "ACCEPTED" } }, answered);
    expect(answered.statusCode).toBe(400);
    expect(reads).toEqual([]);
  });
});

describe("public links whose records disagree about the organization are rejected", () => {
  it("checklist capability that stores another organization than its path", async () => {
    const path = `${runPath("org-b")}/checklistCapabilities/active`;
    const { database, data } = seed();
    data.set(path, { ...data.get(path), organizationId: "org-a" });
    const options = { tokenHash: checklistHash("org-b"), now };
    await expect(loadPublicChecklistCapability(database, options)).resolves.toMatchObject({ state: "not-found" });
    await expect(resolveActiveCapability(database, options)).rejects.toMatchObject({ code: "failed-precondition" });
    await expect(savePublicChecklistDraft(database, { ...options, request: {} })).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("checklist capability outside the organization tree", async () => {
    const stray = "elsewhere/org-b/jobs/job-b/checklistRuns/initial/checklistCapabilities/active";
    const strayHash = hash("stray");
    const { database } = seed({ [stray]: { status: "ACTIVE", tokenHash: strayHash, cleanerId: "cleaner-b", contextRevision: 0, expiresAt: later } });
    await expect(loadPublicChecklistCapability(database, { tokenHash: strayHash, now })).resolves.toMatchObject({ state: "not-found" });
    await expect(resolveActiveCapability(database, { tokenHash: strayHash, now })).rejects.toMatchObject({ code: "not-found" });
  });

  it("client report lookup that points at another organization than the report's own path", async () => {
    // The report lives in org-b; the lookup claims org-a, where that Job does not exist.
    const lookup = `clientReportTokenLookups/${reportHash("org-b")}`;
    const { database, data, reads } = seed();
    data.set(lookup, { ...data.get(lookup), organizationId: "org-a" });
    await expect(loadPublicClientReport(database, { tokenHash: reportHash("org-b"), now })).rejects.toMatchObject({ code: "not-found" });
    await expect(downloadPublicClientReportPhoto(database, { tokenHash: reportHash("org-b"), now, storage: {} }))
      .rejects.toMatchObject({ code: "not-found" });
    expect(reads.filter((path) => path.startsWith(`${root("org-b")}/`))).toEqual([]);
  });

  it("client report lookup that points at another organization's real report", async () => {
    // Same Job ID in both organizations: the other report has another token, so the lookup opens nothing.
    const lookup = `clientReportTokenLookups/${reportHash("org-b")}`;
    const { database, data } = seed();
    data.set(lookup, { ...data.get(lookup), organizationId: "org-a", jobId: "job-a" });
    await expect(loadPublicClientReport(database, { tokenHash: reportHash("org-b"), now })).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it.each([undefined, null, "", 7, "org/b"])("client report lookup with the invalid organization %j", async (organizationId) => {
    const lookup = `clientReportTokenLookups/${reportHash("org-b")}`;
    const { database, data, reads } = seed();
    data.set(lookup, { ...data.get(lookup), organizationId });
    await expect(loadPublicClientReport(database, { tokenHash: reportHash("org-b"), now })).rejects.toMatchObject({ code: "not-found" });
    expect(reads.filter((path) => path.startsWith("organizations/"))).toEqual([]);
  });

  it("client report whose Job stores another organization than its path", async () => {
    const job = `${root("org-b")}/jobs/job-b`;
    const { database, data } = seed();
    data.set(job, { ...data.get(job), organizationId: "org-a" });
    await expect(loadPublicClientReport(database, { tokenHash: reportHash("org-b"), now })).rejects.toMatchObject({ code: "not-found" });
  });

  it("client portal lookup that points at another organization than the access record", async () => {
    const lookup = `clientPortalTokenLookups/${portalHash("org-b")}`;
    const { database, data } = seed();
    // Same client ID in the other organization: its access record has another token.
    data.set(lookup, { ...data.get(lookup), organizationId: "org-a", clientId: "client-a" });
    await expect(loadPublicClientPortal(database, { tokenHash: portalHash("org-b"), now })).rejects.toMatchObject({ code: "failed-precondition" });
    await expect(loadPublicClientPortalReport(database, { tokenHash: portalHash("org-b"), jobId: "job-a", now }))
      .rejects.toMatchObject({ code: "failed-precondition" });
  });

  it.each([undefined, null, "", 7, "org/b"])("client portal lookup with the invalid organization %j", async (organizationId) => {
    const lookup = `clientPortalTokenLookups/${portalHash("org-b")}`;
    const { database, data, reads } = seed();
    data.set(lookup, { ...data.get(lookup), organizationId });
    await expect(loadPublicClientPortal(database, { tokenHash: portalHash("org-b"), now })).rejects.toMatchObject({ code: "not-found" });
    expect(reads.filter((path) => path.startsWith("organizations/"))).toEqual([]);
  });

  it("client portal whose client stores another organization than its path", async () => {
    const client = `${root("org-b")}/clients/client-b`;
    const { database, data } = seed();
    data.set(client, { ...data.get(client), organizationId: "org-a" });
    await expect(loadPublicClientPortal(database, { tokenHash: portalHash("org-b"), now })).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("public offer outside the organization tree", async () => {
    const strayToken = token("z");
    seed({ "elsewhere/org-b/jobs/open-job-b/offers/cleaner-b": { status: "PENDING", publicOfferTokenHash: hash(strayToken), publicOfferExpiresAt: later } });
    const shown = response();
    await publicOffer({ method: "GET", query: { token: strayToken } }, shown);
    expect(shown.statusCode).toBe(404);
    expect(shown.body).toEqual({ error: "offer_not_found" });
  });
});
