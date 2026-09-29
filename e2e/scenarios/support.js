import { randomUUID } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { expect, test } from "@playwright/test";
import { e2eManager, getE2eFirestore } from "../globalSetup.js";

export { expect, test };

const organizationId = "cleanflow-demo";
const demoProjectId = "demo-cleanflow";

// A real, tiny PNG. The evidence endpoint checks file signatures, not just MIME type.
export const syntheticPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==",
  "base64",
);

function requireScenarioEmulators() {
  const firestoreHosts = new Set(["127.0.0.1:8080", "localhost:8080"]);
  const authHosts = new Set(["127.0.0.1:9099", "localhost:9099"]);
  const storageHosts = new Set(["127.0.0.1:9199", "localhost:9199"]);
  if (
    process.env.GCLOUD_PROJECT !== demoProjectId ||
    !firestoreHosts.has(process.env.FIRESTORE_EMULATOR_HOST) ||
    !authHosts.has(process.env.FIREBASE_AUTH_EMULATOR_HOST) ||
    !storageHosts.has(process.env.FIREBASE_STORAGE_EMULATOR_HOST)
  ) {
    throw new Error("Scenarios require local demo-cleanflow Auth, Firestore, and Storage emulators.");
  }
}

export async function step(percent, name, action) {
  const label = `[${String(percent).padStart(3)}%] ${name}`;
  console.log(label);
  try {
    return await test.step(name, action);
  } catch (error) {
    console.error(`FAIL at ${percent}% — ${name}`);
    throw error;
  }
}

export async function seedScenarioFixture(testInfo, scenarioName) {
  requireScenarioEmulators();
  const db = getE2eFirestore();
  const orgRef = db.collection("organizations").doc(organizationId);
  const runLabel = `scenario-${scenarioName}-${testInfo.repeatEachIndex}-${randomUUID().slice(0, 8)}`;
  const clientId = `${runLabel}-client`;
  const propertyId = `${runLabel}-property`;
  const cleanerAId = `${runLabel}-cleaner-pt`;
  const cleanerBId = `${runLabel}-cleaner-en`;
  const propertyName = `Scenario Property ${runLabel}`;
  const clientName = "Scenario Client";
  const cleanerAName = "Scenario Cleaner PT";
  const cleanerBName = "Scenario Cleaner EN";
  const now = Timestamp.now();
  const shared = { organizationId, active: true, dataProvenance: "DEMO", createdAt: now, updatedAt: now };
  const batch = db.batch();
  batch.set(orgRef.collection("clients").doc(clientId), { ...shared, name: clientName });
  batch.set(orgRef.collection("properties").doc(propertyId), {
    ...shared,
    name: propertyName,
    clientId,
    clientName,
    defaultClientPrice: 250,
    defaultCleanerPrice: 150,
  });
  batch.set(orgRef.collection("cleaners").doc(cleanerAId), {
    ...shared, name: cleanerAName, preferredLanguage: "pt",
  });
  batch.set(orgRef.collection("cleaners").doc(cleanerBId), {
    ...shared, name: cleanerBName, preferredLanguage: "en",
  });
  await batch.commit();
  return {
    db, orgRef, runLabel, clientId, clientName, propertyId, propertyName,
    cleanerAId, cleanerAName, cleanerBId, cleanerBName,
  };
}

export async function cleanupScenarioFixture(fixture) {
  if (!fixture) return;
  requireScenarioEmulators();
  const { db, orgRef, propertyId, clientId, cleanerAId, cleanerBId } = fixture;
  const jobs = await orgRef.collection("jobs").where("propertyId", "==", propertyId).get();
  for (const job of jobs.docs) {
    const reportLookups = await db.collection("clientReportTokenLookups")
      .where("organizationId", "==", organizationId)
      .where("jobId", "==", job.id).get();
    for (const lookup of reportLookups.docs) await lookup.ref.delete();
    await db.recursiveDelete(job.ref);
  }
  const batch = db.batch();
  batch.delete(orgRef.collection("properties").doc(propertyId));
  batch.delete(orgRef.collection("clients").doc(clientId));
  batch.delete(orgRef.collection("cleaners").doc(cleanerAId));
  batch.delete(orgRef.collection("cleaners").doc(cleanerBId));
  await batch.commit();
}

export async function loginManager(page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.getByLabel("Email").fill(e2eManager.email);
  await page.getByLabel("Password").fill(e2eManager.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Operations dashboard" })).toBeVisible();
}

function futureDateKey(daysFromToday) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + daysFromToday);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")].join("-");
}

export async function createScenarioJob(page, fixture) {
  await page.getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Jobs" }).click();
  await expect(page.getByRole("heading", { name: "Cleaning jobs" })).toBeVisible();
  await page.getByRole("button", { name: "New service" }).click();
  const form = page.locator(".cleaning-form");
  await expect(form).toBeVisible();
  await form.getByRole("searchbox").fill(fixture.propertyName);
  await form.getByRole("combobox", { name: "Property" }).selectOption(fixture.propertyId);
  await expect(form.getByRole("textbox", { name: "Client" })).toHaveValue(fixture.clientName);
  await expect(form.getByRole("spinbutton", { name: "Client price" })).toHaveValue("250");
  await expect(form.getByRole("spinbutton", { name: "Cleaner payout" })).toHaveValue("150");
  const scheduledDate = futureDateKey(7);
  const scheduledStart = "10:30";
  await form.getByRole("textbox", { name: "Date" }).fill(scheduledDate);
  await form.getByRole("textbox", { name: "Scheduled time" }).fill(scheduledStart);
  await form.getByRole("textbox", { name: "Notes" }).fill(fixture.runLabel);
  await form.getByRole("button", { name: "Create cleaning" }).click();
  await expect(page.getByRole("heading", { name: fixture.propertyName })).toBeVisible();
  await expect(page.getByText("Job details", { exact: true })).toBeVisible();
  const jobs = await fixture.orgRef.collection("jobs").where("propertyId", "==", fixture.propertyId).get();
  expect(jobs.size).toBe(1);
  const jobRef = jobs.docs[0].ref;
  const job = jobs.docs[0].data();
  expect(job).toMatchObject({
    propertyId: fixture.propertyId, clientId: fixture.clientId,
    scheduledDate, scheduledStart, clientPrice: 250, cleanerPayout: 150,
    operationalStatus: "UNASSIGNED",
  });
  return { jobId: jobRef.id, jobRef, scheduledDate, scheduledStart };
}
