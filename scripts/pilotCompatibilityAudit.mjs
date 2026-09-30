import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { buildCompatibilityAudit, validateAuditDate } from "./pilotCompatibilityAuditCore.mjs";

const productionProjectId = "clean-flow-prototipo";
const pilotTimeZone = "America/Los_Angeles";
const usage = "Usage: node scripts/pilotCompatibilityAudit.mjs --project <project-id> [--today YYYY-MM-DD] [--allow-production-read]";

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
    if (["--project", "--today"].includes(argument)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value.\n${usage}`);
      options[argument.slice(2)] = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}\n${usage}`);
  }

  if (options.help) return options;
  if (!options.project) throw new Error(usage);
  if (options.project === productionProjectId && !options.allowProductionRead) {
    throw new Error("Production compatibility reads require the explicit --allow-production-read acknowledgement.");
  }
  options.today = validateAuditDate(options.today || new Intl.DateTimeFormat("en-CA", { timeZone: pilotTimeZone }).format(new Date()));
  return options;
}

function printUsage() {
  console.log(`${usage}\nReads existing records only and prints aggregate counts. It has no write or repair mode.`);
}

function printSection(title, counts) {
  console.log(title);
  for (const [key, value] of Object.entries(counts)) {
    console.log(`  ${key}: ${typeof value === "object" ? JSON.stringify(value) : value}`);
  }
  console.log("");
}

function printAudit(report) {
  console.log("CleanFlow Pilot Compatibility Audit (read-only, aggregate counts only)");
  console.log(`Past-due boundary: scheduledDate before ${report.today} (${pilotTimeZone} default unless --today is supplied).`);
  console.log("");
  printSection("INVENTORY", report.inventory);
  printSection("REAL OPERATIONAL JOBS (non-archived)", report.realOperational);
  printSection("REAL CHILD RECORD GENERATIONS", report.childRecords);
  printSection("ARCHIVED / NON-REAL", report.archived);
  printSection("FINANCIAL HISTORY (report only; never migrate automatically)", report.financial);
  console.log(`REAL Jobs needing manager review: ${report.managerReview}`);
  console.log("");
  console.log("Limitations: counts describe current stored state only. A past-due open Job may be work that happened outside CleanFlow, did not happen, or awaits a cleaner; the command cannot tell which.");
}

async function readDocs(collectionReference, fields) {
  const snapshot = await collectionReference.select(...fields).get();
  return snapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
}

async function loadAuditData(database) {
  const organization = database.collection("organizations").doc("cleanflow-demo");
  const [jobs, properties] = await Promise.all([
    readDocs(organization.collection("jobs"), [
      "dataProvenance", "demoSeed", "fixture", "demoSeedBatch", "demoSeedScenario",
      "schemaVersion", "operationalStatus", "archivedAt", "scheduledDate", "completedAt",
      "checklistContextRevision", "assignedCleanerId", "assignedCleanerIds", "propertyId", "payoutId",
    ]),
    readDocs(organization.collection("properties"), ["archivedAt"]),
  ]);
  const propertiesById = new Map(properties.map((property) => [property.id, property]));

  return Promise.all(jobs.map(async (job) => {
    const jobReference = organization.collection("jobs").doc(job.id);
    const [offers, assignments, runDocs] = await Promise.all([
      readDocs(jobReference.collection("offers"), ["cleanerId", "status", "offeredCompensation", "publicOfferExpiresAt"]),
      readDocs(jobReference.collection("assignments"), ["cleanerId", "isActive", "source", "sourceOfferId"]),
      readDocs(jobReference.collection("checklistRuns"), ["status"]),
    ]);
    const checklistRuns = await Promise.all(runDocs.map(async (run) => {
      const runReference = jobReference.collection("checklistRuns").doc(run.id);
      const [capabilities, drafts, evidence] = await Promise.all([
        readDocs(runReference.collection("checklistCapabilities"), ["status", "contextRevision", "cleanerId", "expiresAt"]),
        readDocs(runReference.collection("drafts"), ["revision"]),
        readDocs(runReference.collection("evidence"), ["status", "contentType"]),
      ]);
      return { ...run, capabilities, drafts, evidence };
    }));
    const property = propertiesById.get(job.propertyId);
    return {
      ...job,
      property: property ? { archived: Boolean(property.archivedAt) } : null,
      offers,
      assignments,
      checklistRuns,
    };
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
    const jobs = await loadAuditData(getFirestore());
    printAudit(buildCompatibilityAudit({ jobs, today: options.today }));
  }
} catch (error) {
  console.error(`Pilot compatibility audit unavailable: ${error.message}`);
  process.exitCode = 1;
}
