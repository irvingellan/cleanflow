import { enrichPayoutAgreements } from "../payouts/payoutAgreements.js";
import { getServicePeriodJobs } from "../jobs/jobService.js";
import { rosterCleanerIds } from "../jobs/offerSlots.js";
import { getServerRecordsById } from "../../services/firebase/serverReads.js";
import { servicePeriod } from "../weekly-close/weeklyCloseModel.js";
import { payoutTimestamp, recordedShareCents } from "../payouts/payoutReceipt.js";
import { isAssignmentAwareJob } from "../jobs/jobCompatibility.js";
import { agendaScheduleKey, buildCleanerAgenda } from "./cleanerAgendaModel.js";

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

async function readReceiptAmounts(jobs, signal) {
  const references = jobs.filter(job => job.operationalStatus === "COMPLETED").flatMap(job =>
    rosterCleanerIds(job).map(cleanerId => ({ jobId: job.id, cleanerId, team: isAssignmentAwareJob(job),
      payoutId: isAssignmentAwareJob(job) ? job.payoutIdsByCleaner?.[cleanerId] : job.payoutId })))
    .filter(entry => entry.payoutId);
  const receipts = await readByIds("payouts", references.map(entry => entry.payoutId),
    ({ organizationId, cleanerId, paidAt, status, amount, jobAmountsCents, jobIds }) =>
      ({ organizationId, cleanerId, paidAt, status, amount, jobAmountsCents, jobIds }), signal);
  const byId = new Map(receipts.map(receipt => [receipt.id, receipt]));
  const amounts = new Map();
  for (const { jobId, cleanerId, payoutId, team } of references) {
    const receipt = byId.get(payoutId);
    if (receipt?.organizationId !== organizationId || receipt.cleanerId !== cleanerId || receipt.status !== "PAID"
      || payoutTimestamp(receipt.paidAt) === null || (team && !receipt.jobAmountsCents)) continue;
    const cents = recordedShareCents(receipt, jobId);
    if (cents !== null) amounts.set(agendaScheduleKey(cleanerId, jobId), cents);
  }
  return amounts;
}

/** Read-only. Payment amounts come from linked receipts or the completed service's fixed agreement. */
export async function loadCleanerAgenda(period, { signal } = {}) {
  const dates = servicePeriod(period);
  const { jobs: original, coverage } = await getServicePeriodJobs(dates, { signal });
  signal?.throwIfAborted();
  const completed = original.filter(job => job.operationalStatus === "COMPLETED" && !job.archivedAt);
  const [cleaners, properties, receiptAmounts, agreed] = await Promise.all([
    // Only what the agenda shows: never access codes or internal notes.
    readByIds("cleaners", original.flatMap(rosterCleanerIds),
      ({ name, phone, preferredLanguage }) => ({ name, phone, preferredLanguage }), signal),
    readByIds("properties", original.map((job) => job.propertyId),
      ({ name, address, clientId }) => ({ name, address, clientId }), signal),
    readReceiptAmounts(completed, signal),
    enrichPayoutAgreements(completed, { organizationId, signal }),
  ]);
  signal?.throwIfAborted();
  const byOriginal = new Map(completed.map((job, i) => [job, agreed[i]]));
  const jobs = original.map(job => byOriginal.get(job) ?? job);
  // Client names only, for the client filter.
  const clients = await readByIds("clients",
    [...properties.map((property) => property.clientId), ...jobs.map((job) => job.clientId)],
    ({ name }) => ({ name }), signal);
  signal?.throwIfAborted();
  return {
    ...buildCleanerAgenda({ period: dates, jobs, cleaners, properties, receiptAmounts }),
    // Raw rows so the view can rebuild the agenda for a house or client filter.
    source: { period: dates, jobs, cleaners, properties, clients, receiptAmounts },
    coverage,
    // Job detail opens from the full record already read here.
    jobsById: new Map(original.map((job) => [job.id, job])),
  };
}
