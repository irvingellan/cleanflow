import { buildCompactLifecycleFixtures } from "../../scripts/compactLifecycleFixtures.mjs";

// Memory-only fixtures; never imported by App or a cloud seeder.
export function dashboardFixture(scenario = "normal") {
  const fixture = buildCompactLifecycleFixtures().dashboardData;
  const day = offset => { const date = new Date(); date.setDate(date.getDate() + offset); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`; };
  fixture.recentlyCompletedJobs = fixture.recentlyCompletedJobs.map(job => ({ ...job, completedAt: { toDate: () => new Date(`${day(0)}T08:30:00`) } }));
  fixture.weeklySummary = { scheduled: 10, assigned: 7, needsAssignment: 3, completed: 2,
    dailyLoad: [1,4,2,2,1,0,0].map((count, index) => ({ date: day(index), count })) };
  const pending = { id:"pending-demo", propertyName:"Demo Pending Reply", scheduledDate:day(1), operationalStatus:"OFFERED", scheduledStart:"14:00" };
  fixture.attentionJobs.push(pending);
  fixture.pendingOffersByJob[pending.id] = true;
  if (scenario === "heavy") fixture.attentionJobs.push(...Array.from({length:8},(_,index)=>({id:`heavy-${index}`, propertyName:`Synthetic Attention ${index + 1}`,scheduledDate:day(0),operationalStatus:"UNASSIGNED"})));
  if (scenario === "empty") return {counts:{today:0,needsAssignment:0,inProgress:0,completedToday:0,openIssues:0},attentionJobs:[],openIssues:[],next48HoursJobs:[],recentlyCompletedJobs:[],weeklySummary:{scheduled:0,assigned:0,needsAssignment:0,completed:0,dailyLoad:fixture.weeklySummary.dailyLoad.map(day=>({...day,count:0}))}};
  if (scenario === "sparse") { fixture.attentionJobs=[];fixture.openIssues=[];fixture.next48HoursJobs=fixture.next48HoursJobs.slice(2,3);fixture.next48HoursJobs[0]={...fixture.next48HoursJobs[0],scheduledStart:undefined};fixture.counts={today:1,needsAssignment:0,inProgress:0,completedToday:0,openIssues:0}; }
  return fixture;
}
