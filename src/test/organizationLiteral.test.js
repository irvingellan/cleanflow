import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { expect, it } from "vitest";

// The hardcoded organization ID may only live in the files listed here.
// A step that removes the literal from a file deletes its entry in the same change.
const literal = "cleanflow-demo";
// Vitest runs from the repository root.
const repositoryRoot = process.cwd();

const allowed = [
  "functions/src/devCenterData.js",
  "functions/src/runtime/firebase.js",
  "src/features/auth/managerAccessService.js",
  "src/features/cleaner-agenda/cleanerAgendaService.js",
  "src/features/dashboard/dashboardReads.js",
  "src/features/issues/issueService.js",
  "src/features/jobs/assignmentService.js",
  "src/features/jobs/cleanerReminderLog.js",
  "src/features/jobs/jobOfferService.js",
  "src/features/jobs/jobService.js",
  "src/features/payouts/payoutProofService.js",
  "src/features/payouts/payoutService.js",
  "src/features/telemetry/managerOperationTelemetryService.js",
  "src/features/telemetry/managerPageLoadDiagnosticsService.js",
  "src/features/telemetry/managerPageLoadService.js",
  "src/features/weekly-close/weeklyCloseModel.js",
  "src/features/weekly-close/weeklyCloseService.js",
  "src/services/organization/currentOrganization.js",
];

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules") return [];
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && !entry.name.includes(".test.") ? [path] : [];
  });
}

it("keeps the hardcoded organization ID in the allowed files only", () => {
  const found = ["src", "functions/src"]
    .flatMap((directory) => sourceFiles(join(repositoryRoot, directory)))
    .filter((path) => readFileSync(path, "utf8").includes(literal))
    .map((path) => relative(repositoryRoot, path).split(sep).join("/"))
    .sort();

  expect(found).toEqual(allowed);
});
