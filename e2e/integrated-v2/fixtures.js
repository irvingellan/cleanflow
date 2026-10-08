import { getServiceLifecycleFixture } from "../../scripts/serviceLifecycleFixtures.mjs";
export const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; })();
const day = offset => { const d = new Date(`${today}T12:00:00`); d.setDate(d.getDate()+offset); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const stamp = date => ({ toDate: () => new Date(date), toMillis: () => new Date(date).getTime() });
export function buildIntegratedContext() {
  const scenarios = ["unassigned", "offered", "assigned", "assigned-draft", "in-progress", "ready", "completed", "stale", "open-issue"];
  const records = Array.from({ length: 36 }, (_, i) => {
    const f = getServiceLifecycleFixture(scenarios[i % scenarios.length]);
    const id = `synthetic-service-${String(i+1).padStart(2,"0")}`;
    const propertyId = `synthetic-property-${i % 12 + 1}`;
    const clientId = `synthetic-client-${i % 3 + 1}`;
    const propertyName = `Demo ${["Garden", "Harbor", "Meadow", "Orchard"][i % 4]} ${i % 12 + 1}`;
    const scheduledDate = f.job.operationalStatus === "COMPLETED" ? day(-Math.floor(i/9)) : day(i < 9 ? 0 : i < 18 ? 1 : i < 27 ? 3 : -3);
    f.job = { ...f.job, id, propertyId, propertyName, clientId, clientName: `Demo Client ${i % 3 + 1}`, scheduledDate, scheduledStart: `${String(8 + i % 10).padStart(2,"0")}:00`, createdAt: stamp(`${today}T07:00:00`) };
    for (const key of ["startedAt", "completedAt"]) if (f.job[key]) f.job[key] = stamp(new Date(Date.now() - Math.floor(i/9)*86400000 - (key === "startedAt" ? 90 : 10)*60000));
    f.property = { ...f.property, id: propertyId, name: propertyName, clientId, clientName: f.job.clientName };
    f.client = { ...f.client, id: clientId, name: f.job.clientName };
    f.assignments = f.assignments.map(a => ({ ...a, id: `${id}-assignment`, jobId: id, propertyId, propertyName, scheduledDate }));
    f.offers = f.offers.map(a => ({ ...a, jobId: id }));
    f.issues = f.issues.map(a => ({ ...a, id: `${id}-issue`, jobId: id, propertyId }));
    if (f.checklistRun) f.checklistRun = { ...f.checklistRun, jobId: id, property: { id: propertyId, name: propertyName }, serviceDate: scheduledDate };
    return f;
  });
  const unknown = { ...getServiceLifecycleFixture("unassigned"), job: { ...records[0].job, id: "synthetic-unknown", operationalStatus: "UNRECOGNIZED" } };
  unknown.property = records[0].property; unknown.client=records[0].client; records.push(unknown);
  const archived = { ...records[6], job: { ...records[6].job, id: "synthetic-archived", archivedAt: today }, checklistRun: {...records[6].checklistRun,jobId:"synthetic-archived"} }; records.push(archived);
  for(let i=0;i<3;i++) records.push({...records[0],job:{...records[0].job,id:`synthetic-extra-${i+1}`,scheduledDate:day(1),scheduledStart:`${12+i}:30`}});
  const jobs = records.map(f => f.job);
  const properties = [...new Map(records.map(f => [f.property.id, f.property])).values()];
  const clients = [...new Map(records.map(f => [f.client.id, f.client])).values()];
  const cleaners = records[0].knownCleaners;
  const active = jobs.filter(j => !j.archivedAt);
  const offersByJob = Object.fromEntries(records.map(f => [f.job.id, f.offers]));
  const openIssues = records.flatMap(f => f.issues.map(i => ({ ...i, job: f.job }))).filter(i => !i.job.archivedAt);
  const dashboardData = {
    counts: { today: active.filter(j => j.scheduledDate === today).length, needsAssignment: active.filter(j => ["UNASSIGNED", "OFFERED"].includes(j.operationalStatus)).length, inProgress: active.filter(j => j.operationalStatus === "IN_PROGRESS").length, completedToday: active.filter(j => j.operationalStatus === "COMPLETED" && j.scheduledDate === today).length, openIssues: openIssues.length },
    attentionJobs: active.filter(j => j.operationalStatus !== "COMPLETED"), openIssues, offersByJob,
    pendingOffersByJob: Object.fromEntries(records.filter(f => f.offers.some(o => o.status === "PENDING")).map(f => [f.job.id, true])),
    cleanerNamesById: Object.fromEntries(cleaners.map(c => [c.id,c.name])),
    next48HoursJobs: active.filter(j => j.scheduledDate >= today && j.scheduledDate <= day(1) && j.operationalStatus !== "COMPLETED"),
    recentlyCompletedJobs: active.filter(j => j.operationalStatus === "COMPLETED"),
    weeklySummary: { scheduled: active.filter(j => j.scheduledDate >= today && j.scheduledDate <= day(6)).length, assigned: active.filter(j => j.scheduledDate >= today && j.scheduledDate <= day(6) && j.assignedCleanerIds?.length).length, needsAssignment: active.filter(j => j.scheduledDate >= today && j.scheduledDate <= day(6) && ["UNASSIGNED","OFFERED"].includes(j.operationalStatus)).length, completed: active.filter(j => j.scheduledDate >= today && j.scheduledDate <= day(6) && j.operationalStatus === "COMPLETED").length,
      dailyLoad: Array.from({length:7},(_,i)=>({date:day(i),count:active.filter(j=>j.scheduledDate===day(i)).length})) },
  };
  return { records, jobs, properties, clients, cleaners, dashboardData };
}
export function filteredServices(jobs, filters, excluded) {
  return jobs.filter(j => excluded || !j.archivedAt).filter(j => filters.status === "all" || (filters.status === "needs-assignment" ? ["UNASSIGNED","OFFERED"].includes(j.operationalStatus) : j.operationalStatus === ({offered:"OFFERED",assigned:"ASSIGNED","in-progress":"IN_PROGRESS",completed:"COMPLETED"}[filters.status])))
    .filter(j => filters.datePreset === "any" || (filters.datePreset === "today" ? j.scheduledDate === today : filters.datePreset === "next-7-days" ? j.scheduledDate >= today && j.scheduledDate <= day(7) : j.scheduledDate <= today && j.scheduledDate >= day(filters.datePreset === "past-7-days" ? -7 : -30)));
}
