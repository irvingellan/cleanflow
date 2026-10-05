import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { validateConfig } from "./config.mjs";
import { assertPublicFeedHost } from "./run.mjs";
import { pollIcal } from "./icalAdapter.mjs";
import { normalizeReservationObservation } from "../../src/features/reservation-intake/reservationNormalizer.js";
import { icalSourceSemantics } from "../../src/features/reservation-intake/reservationCandidateModel.js";

// No store, lock, state API, disappearance planner or receiver is opened here.
export async function probeSource(config, sourceId, { fetchImpl = fetch, checkHost = assertPublicFeedHost } = {}) {
  validateConfig(config);
  const source = config.sources.find(item => item.id === sourceId && item.enabled === true && item.type === "ICAL");
  if (!source) throw new Error("PROBE_SOURCE_DENIED");
  const summary = { provider: source.provider, sourceSemantics: icalSourceSemantics(source.provider),
    confidenceCeiling: "SHADOW_ONLY", persistentWrites: "NONE", disappearanceCounters: "UNCHANGED" };
  try {
    await checkHost(new URL(source.url).hostname);
  } catch { return { ...summary, fetch: "ERROR", errorCategory: "FEED_NETWORK_DENIED", candidates: [] }; }
  const poll = await pollIcal(source, { fetchImpl });
  if (poll.result !== "SUCCESS") return { ...summary, fetch: "ERROR", errorCategory: poll.errorCategory,
    eventsAccepted: 0, eventsRejected: null, recurrenceDetected: poll.errorCategory === "RECURRENCE_OR_DURATION_UNSUPPORTED" ? "UNSUPPORTED" : "UNKNOWN",
    candidates: [] };
  const candidates = []; let rejected = 0;
  for (const observation of poll.observations) {
    try {
      const row = await normalizeReservationObservation(observation, config);
      // Dates are the only event-level output. Never emit UID, guest, listing IDs or raw source text.
      candidates.push({ checkIn: row.checkIn, checkOut: row.checkOut, timezone: row.timezone,
        sourceEvidenceType: row.sourceEvidenceType, reviewRequired: true, reservationProven: false });
    } catch { rejected++; }
  }
  return { ...summary, fetch: "OK", eventsAccepted: candidates.length, eventsRejected: rejected,
    dateOnly: candidates.filter(row => row.checkIn?.length === 10 && row.checkOut?.length === 10).length,
    stableUidPresent: poll.observations.filter(row => row.sourceEventUid).length, recurrenceDetected: 0,
    completeSnapshot: poll.complete, candidates };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const config = JSON.parse(fs.readFileSync(process.argv[2] || "reservation-observer.local.json", "utf8"));
    const result = await probeSource(config, process.argv[3]);
    console.log(JSON.stringify(result, null, 2));
    if (result.fetch !== "OK" || result.eventsRejected > 0) process.exitCode = 1;
  } catch {
    // Raw filesystem/config/network errors can contain the secret feed URL. Never echo them.
    console.error("PROBE_REJECTED — review local config/source; persistent writes: NONE");
    process.exitCode = 1;
  }
}
