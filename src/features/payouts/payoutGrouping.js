export function groupUnpaidJobsByCleaner(jobs, cleaners) {
  const cleanersById = Object.fromEntries(
    cleaners.map((cleaner) => [cleaner.id, cleaner]),
  );
  const groupsByCleanerId = new Map();

  jobs.forEach((job) => {
    const cleaner = cleanersById[job.assignedCleanerId] || {
      id: job.assignedCleanerId,
      name: job.assignedCleanerName || "",
      preferredPaymentMethod: "",
    };
    const currentGroup = groupsByCleanerId.get(cleaner.id) || {
      cleaner,
      jobs: [],
      total: 0,
    };

    currentGroup.jobs.push(job);
    currentGroup.total += job.cleanerPayout;
    groupsByCleanerId.set(cleaner.id, currentGroup);
  });

  return [...groupsByCleanerId.values()].sort((firstGroup, secondGroup) =>
    (firstGroup.cleaner.name || "").localeCompare(secondGroup.cleaner.name || ""),
  );
}
