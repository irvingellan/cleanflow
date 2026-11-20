import { unpaidPayoutShares } from "./payoutShares.js";

export function groupUnpaidJobsByCleaner(jobs, cleaners) {
  const cleanersById = new Map(cleaners.map(cleaner => [cleaner.id, cleaner]));
  const groups = new Map();
  for (const job of jobs) {
    for (const { cleanerId, cents } of unpaidPayoutShares(job)) {
      const cleaner = cleanersById.get(cleanerId) || {
        id: cleanerId,
        name: job.assignedCleanerId === cleanerId ? job.assignedCleanerName || "" : "",
        preferredPaymentMethod: "",
      };
      const group = groups.get(cleanerId) ?? { cleaner, jobs: [], totalCents: 0 };
      group.jobs.push(job.cleanerPayout === cents / 100
        ? job : { ...job, payoutShareCents: cents });
      group.totalCents += cents;
      groups.set(cleanerId, group);
    }
  }
  return [...groups.values()].sort((a, b) => (a.cleaner.name || "").localeCompare(b.cleaner.name || ""))
    .map(({ cleaner, jobs, totalCents }) => ({ cleaner, jobs, total: totalCents / 100 }));
}
