import { lstatSync, realpathSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { calendarEventKinds, providers, validInstant, validSourceId } from "../../functions/src/reservationIntake/reservationCandidateModel.js";
import { normalizeDate } from "../../functions/src/reservationIntake/reservationNormalizer.js";
import { applyShadowPoll } from "../../functions/src/reservationIntake/reservationShadowState.js";
import { buildCleaningSuggestions } from "../../functions/src/reservationIntake/cleaningSuggestions.js";
import { parseIcal } from "./icalAdapter.mjs";
import { readBoundedText, withShadowState } from "./localStore.mjs";

const maxIcalBytes = 2 * 1024 * 1024;
const manifestError = "INVALID_SYNTHETIC_MANIFEST";
const jobStates = new Set(["UNASSIGNED", "OFFERED", "ASSIGNED", "IN_PROGRESS", "COMPLETED"]);
const parserErrors = new Set(["FEED_TOO_LARGE", "MALFORMED_ICAL", "DUPLICATE_ICAL_FIELD", "RECURRENCE_OR_DURATION_UNSUPPORTED"]);
const publicErrors = new Set([manifestError, "SYNTHETIC_SCOPE_REQUIRED", "STATE_DIRECTORY_MUST_BE_PRIVATE",
  "LOCAL_STATE_BUSY", "LOCAL_STATE_SCOPE_MISMATCH", "INVALID_LOCAL_STATE", "LOCAL_STATE_TOO_LARGE", "LOCAL_CANDIDATE_LIMIT"]);

function expect(condition) {
  if (!condition) throw new Error(manifestError);
}

function hasOnly(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).every(key => keys.includes(key));
}

function readManifest(path) {
  let manifest;
  try {
    manifest = JSON.parse(readBoundedText(path, 128 * 1024, manifestError));
  } catch {
    throw new Error(manifestError);
  }
  if (manifest?.mode !== "SHADOW_ONLY" || manifest.projectId !== "demo-cleanflow"
    || typeof manifest.organizationId !== "string" || !/^synthetic-[a-z0-9-]{1,48}$/.test(manifest.organizationId)) {
    throw new Error("SYNTHETIC_SCOPE_REQUIRED");
  }
  expect(hasOnly(manifest, ["mode", "projectId", "organizationId", "sources", "properties", "jobs", "snapshots"]));
  const { sources, properties, jobs, snapshots } = manifest;
  expect([sources, properties, jobs, snapshots].every(entries => Array.isArray(entries) && entries.length <= 100));

  for (const property of properties) {
    expect(hasOnly(property, ["id", "timeZone", "minimumTurnoverMinutes"]) && validSourceId(property.id));
    if (Object.hasOwn(property, "timeZone")) {
      expect(typeof property.timeZone === "string" && property.timeZone.length <= 64);
      try { new Intl.DateTimeFormat("en", { timeZone: property.timeZone }); } catch { throw new Error(manifestError); }
    }
    if (Object.hasOwn(property, "minimumTurnoverMinutes")) {
      expect(Number.isSafeInteger(property.minimumTurnoverMinutes) && property.minimumTurnoverMinutes > 0);
    }
  }
  expect(new Set(properties.map(property => property.id)).size === properties.length);

  const allSources = new Map();
  const mappings = [];
  for (const source of sources) {
    expect(hasOnly(source, ["id", "provider", "listingExternalId", "propertyIds", "completeSnapshot", "eventKinds"])
      && validSourceId(source.id) && !allSources.has(source.id) && providers.includes(source.provider)
      && (source.listingExternalId === undefined || validSourceId(source.listingExternalId))
      && (source.completeSnapshot === undefined || typeof source.completeSnapshot === "boolean")
      && Array.isArray(source.propertyIds) && source.propertyIds.length <= 100
      && Array.isArray(source.eventKinds) && source.eventKinds.length <= 1000);
    const eventKinds = new Map();
    for (const mapping of source.eventKinds) {
      expect(hasOnly(mapping, ["uid", "kind"]) && typeof mapping.uid === "string" && mapping.uid.length > 0 && mapping.uid.length <= 256
        && calendarEventKinds.includes(mapping.kind) && !eventKinds.has(mapping.uid));
      eventKinds.set(mapping.uid, mapping.kind);
    }
    for (const propertyId of source.propertyIds) {
      expect(properties.some(property => property.id === propertyId));
      mappings.push({ sourceId: source.id, listingExternalId: source.listingExternalId ?? null, propertyId });
    }
    allSources.set(source.id, { id: source.id, provider: source.provider,
      listingExternalId: source.listingExternalId, completeSnapshot: source.completeSnapshot, eventKinds });
  }

  for (const job of jobs) {
    expect(hasOnly(job, ["id", "propertyId", "scheduledDate", "operationalStatus", "assigned", "checklistStarted", "manuallyEdited", "archived"])
      && validSourceId(job.id) && properties.some(property => property.id === job.propertyId)
      && typeof job.scheduledDate === "string" && job.scheduledDate.length === 10
      && normalizeDate(job.scheduledDate) === job.scheduledDate && jobStates.has(job.operationalStatus)
      && [job.assigned, job.checklistStarted, job.manuallyEdited, job.archived].every(value => typeof value === "boolean"));
  }
  expect(new Set(jobs.map(job => job.id)).size === jobs.length);

  for (const snapshot of snapshots) {
    expect(hasOnly(snapshot, ["sourceId", "observedAt", "file", "result"])
      && allSources.has(snapshot.sourceId) && validInstant(snapshot.observedAt));
    if (snapshot.file !== undefined) {
      expect(snapshot.result === undefined && typeof snapshot.file === "string" && snapshot.file.length <= 128
        && /^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.ics$/.test(snapshot.file));
    } else {
      expect(snapshot.result === "ERROR" || snapshot.result === "NOT_MODIFIED");
    }
  }
  return { manifest, allSources, mappings };
}

async function parseSnapshot(snapshot, source, directory) {
  const { sourceId, observedAt, result, file } = snapshot;
  if (!file) return { sourceId, observedAt, result };
  const path = resolve(directory, file);
  try {
    if (lstatSync(path).isSymbolicLink() || !realpathSync(path).startsWith(directory + sep)) throw new Error("UNSAFE_FIXTURE_PATH");
    const calendar = readBoundedText(path, maxIcalBytes, "FEED_TOO_LARGE");
    return await parseIcal(calendar, source, observedAt);
  } catch (error) {
    if (error.message === "UNSAFE_FIXTURE_PATH") throw new Error(manifestError);
    return { sourceId, observedAt, result: "PARSER_NEEDS_REVIEW",
      errorCategory: parserErrors.has(error.message) ? error.message : "FIXTURE_UNREADABLE" };
  }
}

export async function replayFixture({ fixturePath, stateDirectory }) {
  const { manifest, allSources, mappings } = readManifest(fixturePath);
  const scope = { projectId: manifest.projectId, organizationId: manifest.organizationId };
  const directory = dirname(realpathSync(fixturePath));
  const state = await withShadowState(stateDirectory, scope, async previous => {
    let next = previous;
    for (const snapshot of manifest.snapshots) {
      const poll = await parseSnapshot(snapshot, allSources.get(snapshot.sourceId), directory);
      next = await applyShadowPoll(next, poll, { organizationId: scope.organizationId, mappings });
    }
    return next;
  });

  const candidates = Object.values(state.candidates);
  return {
    scope,
    candidateCount: candidates.length,
    observations: candidates.map(candidate => ({
      id: candidate.id, sourceId: candidate.sourceId, calendarEventKind: candidate.calendarEventKind,
      checkIn: candidate.checkIn, checkOut: candidate.checkOut, observedAt: candidate.observedAt,
      sourceReservationStatus: candidate.sourceReservationStatus, missingCount: candidate.missingCount,
      changeType: candidate.changeType, changes: candidate.changeSet,
      possibleDuplicateOf: candidate.possibleDuplicateOf,
    })).sort((a, b) => a.id.localeCompare(b.id)),
    suggestions: buildCleaningSuggestions(candidates, { properties: manifest.properties, jobs: manifest.jobs }),
    diagnostics: state.diagnostics,
    audit: state.audit || [],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { values } = parseArgs({ options: { fixture: { type: "string" }, "state-dir": { type: "string" } } });
    if (!values.fixture || !values["state-dir"]) throw new Error(manifestError);
    console.log(JSON.stringify(await replayFixture({ fixturePath: values.fixture, stateDirectory: values["state-dir"] }), null, 2));
  } catch (error) {
    console.error(publicErrors.has(error.message) ? error.message : "SHADOW_REPLAY_FAILED");
    process.exitCode = 1;
  }
}
