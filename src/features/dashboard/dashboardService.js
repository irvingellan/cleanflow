import { getJobIssues } from "../issues/issueService.js";
import { getJobOffers } from "../jobs/jobOfferService.js";
import { getJobs } from "../jobs/jobService.js";

export async function getOperationalDashboard() {
  const jobs = await getJobs();
  const [issueGroups, offeredJobOffers] = await Promise.all([
    Promise.all(
      jobs.map(async (job) => ({
        job,
        issues: await getJobIssues(job.id),
      })),
    ),
    Promise.all(
      jobs
        .filter((job) => job.operationalStatus === "OFFERED")
        .map(async (job) => ({
          jobId: job.id,
          offers: await getJobOffers(job.id),
        })),
    ),
  ]);

  return {
    jobs,
    issues: issueGroups.flatMap(({ job, issues }) =>
      issues.map((issue) => ({ ...issue, job })),
    ),
    offersByJob: Object.fromEntries(
      offeredJobOffers.map(({ jobId, offers }) => [jobId, offers]),
    ),
  };
}
