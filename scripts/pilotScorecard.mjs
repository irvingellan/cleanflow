import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { buildPilotScorecard, validatePilotPeriod } from "./pilotScorecardCore.mjs";
import { isArchived } from "../src/lib/archiveState.js";

const productionProjectId = "clean-flow-prototipo";
const usage = "Usage: node scripts/pilotScorecard.mjs --project <project-id> --from YYYY-MM-DD --to YYYY-MM-DD [--expected-jobs N] [--allow-production-read]";

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--allow-production-read") {
      options.allowProductionRead = true;
      continue;
    }
    if (argument === "--help") {
      options.help = true;
      continue;
    }
    if (["--project", "--from", "--to", "--expected-jobs"].includes(argument)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value.\n${usage}`);
      options[argument.slice(2).replaceAll("-", "")] = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}\n${usage}`);
  }

  if (options.help) return options;
  if (!options.project || !options.from || !options.to) throw new Error(usage);
  validatePilotPeriod(options.from, options.to);
  if (options.project === productionProjectId && !options.allowProductionRead) {
    throw new Error("Production scorecard reads require the explicit --allow-production-read acknowledgement.");
  }
  if (options.expectedjobs !== undefined) {
    if (!/^\d+$/.test(options.expectedjobs)) throw new Error("--expected-jobs must be a non-negative integer.");
    options.expectedJobs = Number(options.expectedjobs);
    if (!Number.isSafeInteger(options.expectedJobs)) throw new Error("--expected-jobs must be a safe integer.");
    delete options.expectedjobs;
  }
  return options;
}

function printUsage() {
  console.log(`${usage}\nReads existing records only. Uses existing Application Default Credentials; it does not create credentials or write Firestore.`);
}

function printScorecard(report) {
  const { from, to } = report.period;
  console.log("CleanFlow Pilot Scorecard V0");
  console.log(`Period: ${from} through ${to} (inclusive)`);
  console.log("Scope: unarchived REAL Jobs only for active totals; DEMO and absent/UNKNOWN provenance are excluded.");
  console.log("Date handling: event timestamps use UTC dates; scheduledDate uses its stored YYYY-MM-DD value.");
  console.log("");

  console.log("REAL JOBS");
  console.log(`Created in period: ${report.jobs.created}`);
  console.log(`Scheduled in period: ${report.jobs.scheduled}`);
  console.log(`Completed in period (completedAt): ${report.jobs.completed}`);
  console.log(`Archived REAL Jobs scheduled in period (excluded from active totals): ${report.archivedJobs.scheduled}`);
  if (report.expectedJobs.supplied) {
    const coverage = report.expectedJobs.coveragePercent === null
      ? "not calculable (expected 0)"
      : `${report.expectedJobs.actualScheduledJobs} / ${report.expectedJobs.expected} = ${report.expectedJobs.coveragePercent.toFixed(1)}%`;
    console.log(`Expected from authoritative source: ${report.expectedJobs.expected}`);
    console.log(`CleanFlow scheduled coverage: ${coverage}`);
  } else {
    console.log("Expected Jobs from authoritative source: not supplied");
    console.log("CleanFlow scheduled coverage: not supplied");
  }
  console.log(`Scheduled Jobs with >=1 Offer: ${report.jobs.scheduledWithOffers}`);
  console.log(`Scheduled Jobs with >=1 active Assignment: ${report.jobs.scheduledWithActiveAssignments}`);
  console.log(`Scheduled Jobs with clientPrice set: ${report.jobs.scheduledWithClientPrice}`);
  console.log(`Legacy/single-cleaner scheduled Jobs with cleanerPayout set: ${report.jobs.scheduledWithLegacyCleanerPayout}`);
  console.log("");

  console.log("OFFERS");
  console.log(`Offer records created in period: ${report.offers.created}`);
  console.log(`INTERESTED responses in period (respondedAt): ${report.offers.interestedResponses}`);
  console.log(`DECLINED responses in period (respondedAt): ${report.offers.declinedResponses}`);
  console.log(`Scheduled-Job Offers with individual compensation snapshot: ${report.offers.scheduledJobOffersWithIndividualCompensation}`);
  console.log("");

  console.log("CHECKLISTS (Runs under Jobs scheduled in period; current state)");
  console.log(`DRAFT: ${report.checklists.draftRuns}`);
  console.log(`READY_FOR_REVIEW: ${report.checklists.readyForReviewRuns}`);
  console.log(`Runs with saved evidence photo: ${report.checklists.runsWithSavedEvidencePhoto}`);
  console.log("");

  console.log("CLIENT REPORTS");
  console.log(`Latest retained capability records issued in period: ${report.clientReports.latestCapabilityRecordsCreated}`);
  console.log("Opened: not currently measurable (public report reads are not recorded).");
  console.log("");
  console.log("Limitations: report-link replacements overwrite the per-Run capability record, so prior generations are not fully countable.");
  console.log("Completed Jobs are dated by completedAt; older completed records without that timestamp cannot be assigned to this period.");
  console.log("Offer responses are dated by respondedAt; older status-only responses cannot be assigned to this period.");
  console.log("Assignment counts use active Assignment documents; legacy assignedCleanerId-only Jobs are not counted.");
  console.log("Compensation counts use individual offeredCompensation snapshots; v2 Job cleanerPayout is not treated as Assignment compensation or paid wages.");
}

async function readDocs(collectionReference, fields) {
  const snapshot = await collectionReference.select(...fields).get();
  return snapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
}

async function loadScorecardData(database, { from, to }) {
  const organization = database.collection("organizations").doc("cleanflow-demo");
  const jobs = await readDocs(organization.collection("jobs"), [
    "dataProvenance", "demoSeed", "fixture", "demoSeedBatch", "demoSeedScenario",
    "createdAt", "scheduledDate", "completedAt", "schemaVersion", "clientPrice", "cleanerPayout", "archivedAt",
  ]);
  const realJobs = jobs.filter((job) => job.dataProvenance === "REAL");
  return Promise.all(realJobs.map(async (job) => {
    // Retain only the aggregate archive count; archived children do not contribute to adoption.
    if (isArchived(job)) return job;
    const jobReference = organization.collection("jobs").doc(job.id);
    const [offers, assignments, runDocs] = await Promise.all([
      readDocs(jobReference.collection("offers"), ["createdAt", "respondedAt", "status", "offeredCompensation"]),
      job.scheduledDate >= from && job.scheduledDate <= to
        ? readDocs(jobReference.collection("assignments"), ["isActive"])
        : Promise.resolve([]),
      readDocs(jobReference.collection("checklistRuns"), ["status"]),
    ]);
    const checklistRuns = await Promise.all(runDocs.map(async (run) => {
      const runReference = jobReference.collection("checklistRuns").doc(run.id);
      const [evidence, clientReportCapabilities] = await Promise.all([
        job.scheduledDate >= from && job.scheduledDate <= to
          ? readDocs(runReference.collection("evidence"), ["status", "contentType"])
          : Promise.resolve([]),
        readDocs(runReference.collection("clientReportCapabilities"), ["createdAt"]),
      ]);
      return { ...run, evidence, clientReportCapabilities };
    }));
    return { ...job, offers, assignments, checklistRuns };
  }));
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
  } else {
    if (getApps().length === 0) {
      initializeApp({ credential: applicationDefault(), projectId: options.project });
    } else if (getApps()[0].options.projectId !== options.project) {
      throw new Error("The initialized Firebase Admin app does not match --project.");
    }
    const database = getFirestore();
    const jobs = await loadScorecardData(database, options);
    const report = buildPilotScorecard({
      jobs,
      from: options.from,
      to: options.to,
      ...(options.expectedJobs === undefined ? {} : { expectedJobs: options.expectedJobs }),
    });
    printScorecard(report);
  }
} catch (error) {
  console.error(`Pilot scorecard unavailable: ${error.message}`);
  process.exitCode = 1;
}
