import { getServicePeriodJobs } from "../jobs/jobService.js";
import { rosterCleanerIds } from "../jobs/offerSlots.js";
import { getServerRecordsById } from "../../services/firebase/serverReads.js";
import { servicePeriod } from "../weekly-close/weeklyCloseModel.js";
import { buildCleanerAgenda } from "./cleanerAgendaModel.js";

const organizationId = "cleanflow-demo";
const batchSize = 30;

async function readByIds(collectionName, values, pick, signal) {
  const ids = [...new Set(values.filter((id) => typeof id === "string" && id && !id.includes("/")))];
  const rows = [];
  for (let offset = 0; offset < ids.length; offset += batchSize) {
    signal?.throwIfAborted();
    const docs = await getServerRecordsById(organizationId, collectionName, ids.slice(offset, offset + batchSize));
    rows.push(...docs.map((doc) => ({ id: doc.id, ...pick(doc.data()) })));
  }
  return rows;
}

/** Read-only; existing manager rules protect Jobs, Cleaners and Properties. */
export async function loadCleanerAgenda(period, { signal } = {}) {
  const dates = servicePeriod(period);
  const { jobs, coverage } = await getServicePeriodJobs(dates, { signal });
  signal?.throwIfAborted();
  const [cleaners, properties] = await Promise.all([
    // Only what the agenda shows: never access codes or internal notes.
    readByIds("cleaners", jobs.flatMap(rosterCleanerIds),
      ({ name, phone, preferredLanguage }) => ({ name, phone, preferredLanguage }), signal),
    readByIds("properties", jobs.map((job) => job.propertyId),
      ({ name, address }) => ({ name, address }), signal),
  ]);
  signal?.throwIfAborted();
  return {
    ...buildCleanerAgenda({ period: dates, jobs, cleaners, properties }),
    coverage,
    // Job detail opens from the full record already read here.
    jobsById: new Map(jobs.map((job) => [job.id, job])),
  };
}
