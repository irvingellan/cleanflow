import { globalChecklistDefinition } from "../functions/src/checklistDefinition.js";

export const serviceLifecycleSandboxProjectId = "clean-flow-sandbox-irving";
export const serviceLifecycleOrganizationId = "cleanflow-demo";
const scenarioDefinitions = [
  { id: "unassigned", label: "Unassigned" },
  { id: "offered", label: "Offered" },
  { id: "assigned", label: "Assigned" },
  { id: "assigned-draft", label: "Assigned · Draft checklist" },
  { id: "in-progress", label: "In progress · Draft checklist" },
  { id: "ready", label: "Ready for review" },
  { id: "completed", label: "Completed" },
  { id: "stale", label: "Assigned · Stale checklist link" },
  { id: "open-issue", label: "In progress · Open issue" },
];

const instant = "2026-10-03T12:00:00.000Z";
const savedInstant = "2026-10-03T12:07:00.000Z";
const date = () => new Date(instant);
const marker = () => ({
  organizationId: serviceLifecycleOrganizationId, dataProvenance: "DEMO", demoSeed: true,
  demoSeedBatch: "dev-center-lifecycle-v0", demoSeedScenario: "serviceLifecycleV0", createdAt: date(),
});

function checklistProjection(job, status, answered) {
  const definition = globalChecklistDefinition;
  const itemIds = definition.sections.flatMap(section => section.items.map(item => item.id));
  const checklistAnswers = Object.fromEntries(itemIds.map((id, index) => [id, index < answered ? "DONE" : "UNANSWERED"]));
  const inventoryAnswers = Object.fromEntries(definition.inventoryItems.map((item, index) => [item.id, status === "READY_FOR_REVIEW" || index < 2 ? "HIGH" : "UNANSWERED"]));
  const progress = {
    checklist: { total: itemIds.length, done: answered, notApplicable: 0, unanswered: itemIds.length - answered },
    inventory: { total: definition.inventoryItems.length, answered: Object.values(inventoryAnswers).filter(answer => answer !== "UNANSWERED").length, needsRestock: 0 },
  };
  return {
    syntheticPreview: true, id: "initial", jobId: job.id, status,
    definitionVersion: definition.definitionVersion,
    property: { id: job.propertyId, name: job.propertyName }, serviceDate: job.scheduledDate,
    sections: definition.sections.map(section => ({
      ...section, items: section.items.map(item => ({ ...item, answer: checklistAnswers[item.id] })),
    })),
    inventoryItems: definition.inventoryItems.map(item => ({ ...item, answer: inventoryAnswers[item.id] })),
    checklistItemCount: itemIds.length, inventoryItemCount: definition.inventoryItems.length,
    requiredPhotoTypes: [], requiredPhotoCount: definition.sections.flatMap(section => section.items).filter(item => item.requiresPhoto).length,
    cleanerInstructions: "", createdAt: instant,
    readyForReviewAt: status === "READY_FOR_REVIEW" ? "2026-10-03T12:30:00.000Z" : null,
    draft: { revision: 1, checklistAnswers, inventoryAnswers, issueNotes: "", generalNotes: "", lastSavedAt: savedInstant, progress },
    // No evidence bytes/URL are fabricated. This is a memory-only state preview,
    // never an authoritative Run and never suitable for submission/reporting.
    evidence: null,
  };
}

function buildSeedableServiceLifecycleFixtures() {
  const client = { id: "lifecycle-v0-client", name: "Lifecycle Demo Client", active: true, ...marker() };
  const knownCleaners = ["Alpha", "Beta"].map(label => ({
    id: `lifecycle-v0-cleaner-${label.toLowerCase()}`, name: `Demo Cleaner ${label}`,
    active: true, preferredLanguage: "en", ...marker(),
  }));
  return scenarioDefinitions.map(({ id, label }, index) => {
    const operationalStatus = id === "unassigned" ? "UNASSIGNED" : id === "offered" ? "OFFERED"
      : id === "completed" ? "COMPLETED" : ["in-progress", "ready", "open-issue"].includes(id) ? "IN_PROGRESS" : "ASSIGNED";
    const assigned = !["UNASSIGNED", "OFFERED"].includes(operationalStatus);
    const property = {
      id: `lifecycle-v0-property-${id}`, name: `Lifecycle Demo ${label}`,
      clientId: client.id, clientName: client.name, active: true,
      defaultClientPrice: 250, defaultCleanerPrice: 140, ...marker(),
    };
    const job = {
      id: `lifecycle-v0-job-${id}`, schemaVersion: 2, operationalStatus,
      propertyId: property.id, propertyName: property.name,
      clientId: client.id, clientName: client.name,
      scheduledDate: "2026-10-05", scheduledStart: `${String(8 + index).padStart(2, "0")}:00`,
      assignedCleanerIds: assigned ? [knownCleaners[0].id] : [],
      checklistContextRevision: id === "stale" ? 1 : 0,
      clientPrice: 250, cleanerPayout: 140, ...marker(),
      ...(["IN_PROGRESS", "COMPLETED"].includes(operationalStatus) ? { startedAt: date() } : {}),
      ...(operationalStatus === "COMPLETED" ? { completedAt: new Date("2026-10-03T13:00:00.000Z") } : {}),
    };
    const assignments = assigned ? [{
      id: `lifecycle-v0-assignment-${id}`, schemaVersion: 1, jobId: job.id,
      cleanerId: knownCleaners[0].id, cleanerNameSnapshot: knownCleaners[0].name,
      source: "MANAGER_DIRECT", isActive: true, executionStatus: operationalStatus,
      propertyId: property.id, propertyName: property.name, scheduledDate: job.scheduledDate,
      scheduledStart: job.scheduledStart, assignedAt: date(), ...marker(),
    }] : [];
    const offers = id === "offered" ? [{
      id: knownCleaners[0].id, jobId: job.id, cleanerId: knownCleaners[0].id,
      cleanerName: knownCleaners[0].name, status: "PENDING", ...marker(),
    }] : [];
    const issues = id === "open-issue" ? [{
      id: "lifecycle-v0-issue", jobId: job.id, propertyId: property.id,
      cleanerId: knownCleaners[0].id, cleanerName: knownCleaners[0].name,
      category: "SUPPLIES", status: "OPEN", description: "Synthetic supply issue for lifecycle preview.", ...marker(),
    }] : [];
    const hasRun = ["assigned-draft", "in-progress", "ready", "completed", "stale", "open-issue"].includes(id);
    const checklistRun = hasRun ? checklistProjection(job, ["ready", "completed"].includes(id) ? "READY_FOR_REVIEW" : "DRAFT", ["ready", "completed"].includes(id) ? 28 : 7) : null;
    const checklistCapability = {
      syntheticPreview: true,
      state: id === "completed" ? "UNAVAILABLE" : id === "stale" ? "STALE" : hasRun ? "ACTIVE" : "NONE",
      ...(hasRun ? { cleanerId: knownCleaners[0].id, issuedAt: instant, expiresAt: "2026-10-10T12:00:00.000Z" } : {}),
    };
    return { id, label, syntheticPreview: true, job, client, property, knownCleaners, assignments, offers, issues, checklistRun, checklistCapability };
  });
}

const previewScenarioDefinitions = [
  { id: "direct-assigned", label: "Direct assignment · No Offer", source: "assigned" },
  { id: "direct-in-progress", label: "Direct assignment · In progress", source: "in-progress" },
  { id: "completed-with-started", label: "Completed · Cleaning started", source: "completed" },
  { id: "completed-without-started", label: "Completed · No cleaning start", source: "completed" },
  { id: "completed-reviewed", label: "Completed · Saved checklist", source: "completed" },
  { id: "offer-error", label: "Assigned · Offer history unavailable", source: "assigned" },
];

function memoryTimestamp(value) {
  const milliseconds = value.getTime();
  return {
    seconds: Math.floor(milliseconds / 1000),
    nanoseconds: (milliseconds % 1000) * 1_000_000,
    toDate: () => new Date(milliseconds),
    toMillis: () => milliseconds,
  };
}

export function buildServiceLifecycleFixtures() {
  const seedable = buildSeedableServiceLifecycleFixtures();
  const previews = previewScenarioDefinitions.map(({ id, label, source }) => {
    const fixture = structuredClone(seedable.find(item => item.id === source));
    fixture.id = id;
    fixture.label = label;
    fixture.previewOnly = true;
    fixture.job.id = `lifecycle-v0-preview-job-${id}`;
    fixture.property.id = `lifecycle-v0-preview-property-${id}`;
    fixture.property.name = `Lifecycle Demo ${label}`;
    fixture.job.propertyId = fixture.property.id;
    fixture.job.propertyName = fixture.property.name;
    fixture.offers = [];
    delete fixture.job.offeredAt;
    for (const assignment of fixture.assignments) {
      assignment.id = `lifecycle-v0-preview-assignment-${id}`;
      assignment.jobId = fixture.job.id;
      assignment.propertyId = fixture.property.id;
      assignment.propertyName = fixture.property.name;
    }
    if (fixture.checklistRun) {
      fixture.checklistRun.jobId = fixture.job.id;
      fixture.checklistRun.property.id = fixture.property.id;
      fixture.checklistRun.property.name = fixture.property.name;
    }
    if (id === "completed-without-started") {
      delete fixture.job.startedAt;
      // This is the existing eligible no-Run completion path, represented only
      // in memory. Do not fabricate a Draft/approved checklist or a start time.
      fixture.checklistRun = null;
      fixture.checklistCapability = { syntheticPreview: true, state: "NONE" };
    }
    if (id === "offer-error") {
      fixture.isLoadingOffers = false;
      fixture.hasOffersError = true;
    }
    // New previews use the same synthetic instants in the Timestamp interface
    // understood by the actual detail formatter. No SDK or seed mutation.
    for (const [key, value] of Object.entries(fixture.job)) {
      if (value instanceof Date) fixture.job[key] = memoryTimestamp(value);
    }
    return fixture;
  });
  return [...seedable, ...previews];
}

export function getServiceLifecycleFixture(id) {
  const fixture = buildServiceLifecycleFixtures().find(item => item.id === id);
  if (!fixture) throw new Error("Unknown synthetic lifecycle scenario.");
  return fixture;
}

export function buildServiceLifecycleSeedDocuments() {
  const records = new Map();
  const add = (path, record) => {
    const { id, ...data } = record;
    records.set(path, { path, data });
  };
  // Preserve the exact previously seeded nine-scenario/30-document dataset.
  // Evidence regressions above are preview-only and never become cloud writes.
  for (const fixture of buildServiceLifecycleFixtures().filter(item => !item.previewOnly)) {
    add(`clients/${fixture.client.id}`, fixture.client);
    add(`properties/${fixture.property.id}`, fixture.property);
    for (const cleaner of fixture.knownCleaners) add(`cleaners/${cleaner.id}`, cleaner);
    add(`jobs/${fixture.job.id}`, fixture.job);
    for (const kind of ["assignments", "offers", "issues"]) {
      for (const record of fixture[kind]) add(`jobs/${fixture.job.id}/${kind}/${record.id}`, record);
    }
  }
  return [...records.values()].sort((left, right) => left.path.localeCompare(right.path));
}

export const serviceLifecycleScenarios = /* @__PURE__ */ buildServiceLifecycleFixtures();
