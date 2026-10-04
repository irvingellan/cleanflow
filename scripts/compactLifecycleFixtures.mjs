// Memory-only synthetic examples, not a seeder or a production data fallback.
export function buildCompactLifecycleFixtures(now = new Date()) {
  const localDay = offset => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  };
  const statuses = ["UNASSIGNED", "OFFERED", "ASSIGNED", "IN_PROGRESS", "ASSIGNED", "IN_PROGRESS", "UNASSIGNED", "COMPLETED", "COMPLETED", "ASSIGNED"];
  const cleaners = [{ id: "demo-alpha", name: "Demo Alpha" }, { id: "demo-beta", name: "Demo Beta" }];
  const jobs = statuses.map((status, index) => ({
    id: `compact-demo-${index}`, schemaVersion: 2, dataProvenance: "DEMO",
    propertyId: `compact-property-${index}`, propertyName: `Demo Property ${String(index + 1).padStart(2, "0")}`,
    clientId: "compact-client", clientName: "Demo Client", scheduledDate: localDay(index < 6 ? 0 : 1),
    scheduledStart: `${String(9 + index).padStart(2, "0")}:00`, operationalStatus: status,
    assignedCleanerIds: ["ASSIGNED", "IN_PROGRESS", "COMPLETED"].includes(status) ? [cleaners[index % 2].id] : [],
    clientPrice: 200, cleanerPayout: 100,
    ...(index === 4 ? { offeredAt: "2026-10-01T10:00:00Z" } : {}),
    ...(status === "IN_PROGRESS" || index === 7 ? { startedAt: "2026-10-01T11:00:00Z" } : {}),
    ...(status === "COMPLETED" ? { completedAt: "2026-10-01T13:00:00Z" } : {}),
  }));
  return { jobs, cleaners, properties: jobs.map(j => ({ id: j.propertyId, name: j.propertyName })),
    dashboardData: { counts: { today: 6, needsAssignment: 3, inProgress: 2, completedToday: 0, openIssues: 1 },
      attentionJobs: jobs.filter(j => ["UNASSIGNED", "OFFERED"].includes(j.operationalStatus)),
      offersByJob: { "compact-demo-1": [{ id: "demo-offer", jobId: "compact-demo-1", status: "INTERESTED", cleanerId: "demo-alpha" }] },
      pendingOffersByJob: {}, cleanerNamesById: Object.fromEntries(cleaners.map(c => [c.id, c.name])),
      openIssues: [{ id: "demo-issue", category: "OTHER", description: "Synthetic observation", status: "OPEN", job: jobs[3] }],
      next48HoursJobs: jobs.filter(j => j.operationalStatus !== "COMPLETED"), recentlyCompletedJobs: jobs.filter(j => j.operationalStatus === "COMPLETED"),
    },
  };
}
