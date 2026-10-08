import { expect, it } from "vitest";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { buildIntegratedContext, filteredServices, today } from "../../../e2e/integrated-v2/fixtures.js";
it("one shared context reconciles Dashboard totals to the Services records",()=>{
 const c=buildIntegratedContext(),active=c.jobs.filter(j=>!j.archivedAt);
 expect(c.dashboardData.counts.today).toBe(active.filter(j=>j.scheduledDate===today).length);
 expect(c.dashboardData.counts.needsAssignment).toBe(active.filter(j=>["UNASSIGNED","OFFERED"].includes(j.operationalStatus)).length);
 expect(c.jobs.length).toBeGreaterThan(30);
 for(const j of c.dashboardData.next48HoursJobs)expect(c.jobs).toContain(j);
 for(const f of c.records){expect(f.property.id).toBe(f.job.propertyId);if(f.checklistRun)expect(f.checklistRun.jobId).toBe(f.job.id);}
});
it("synthetic fixtures exclude real identifiers/contact/access information",()=>{
 const c=buildIntegratedContext();expect(c.jobs.every(j=>j.dataProvenance==="DEMO")).toBe(true);
 for(const f of c.records){expect(f.knownCleaners.every(c=>!c.phone&&!c.email)).toBe(true);expect(f.property).not.toHaveProperty("keyCodeInfo");}
});
it("completed history contains only past instants and Dashboard excludes archived",()=>{
 const c=buildIntegratedContext();
 for(const j of c.jobs.filter(j=>j.operationalStatus==="COMPLETED"))expect(j.completedAt.toMillis()).toBeLessThanOrEqual(Date.now());
 expect(c.dashboardData.recentlyCompletedJobs.every(j=>!j.archivedAt)).toBe(true);
});
it("local pagination/filtering leaves the source context unchanged",()=>{
 const c=buildIntegratedContext();const all=filteredServices(c.jobs,{status:"all",datePreset:"any"},false);
 expect(all.slice(0,12).length).toBe(12);expect(all.slice(0,24).length).toBe(24);
 expect(filteredServices(c.jobs,{status:"in-progress",datePreset:"today"},false).every(j=>j.operationalStatus==="IN_PROGRESS"&&j.scheduledDate===today)).toBe(true);
 expect(c.jobs).toHaveLength(41);
});
it("provider/business-rule boundaries are exactly Phase B",()=>{
 for(const f of ["src/features/jobs/jobService.js","src/features/jobs/assignmentService.js","src/features/jobs/jobCompatibility.js","src/features/jobs/jobScheduleService.js","src/features/dashboard/dashboardService.js","firestore.rules","storage.rules","firebase.json"]){
 expect(fs.readFileSync(f,"utf8"),f).toBe(execFileSync("git",["show",`e4a3cfc:${f}`],{encoding:"utf8"}));}
});
