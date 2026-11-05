import assert from "node:assert/strict";
import { test } from "node:test";
import { releaseId, validReadiness, versionId } from "./hosting-two-phase.mjs";

const now = Date.parse("2026-11-05T02:00:00Z");
const deadline = now + 15 * 60_000;
const receipt = {
  sealHash: "sealed-operation",
  origin: "https://clean-flow-prototipo.web.app",
  confirmedAt: new Date(now - 60_000).toISOString(),
  exclusiveUntil: new Date(deadline + 5 * 60_000).toISOString(),
  checks: {
    exclusiveCliConsoleCi: true, physicalIphoneMirroring: true,
    managerTestSession: true, cleanerTestSession: true, legacyTestShortcut: true,
    safariWhatsAppTestLinks: true, authorizedChecklist: true,
  },
};

test("Production staging needs current owner readiness for all physical checks and rollback time", () => {
  const valid = (value) => validReadiness(value, receipt.sealHash, now, deadline);
  assert.equal(valid(receipt), true);
  assert.equal(valid(null), false);
  assert.equal(valid({ ...receipt, sealHash: "different" }), false);
  assert.equal(valid({ ...receipt, origin: "https://clean-flow-sandbox-irving.web.app" }), false);
  assert.equal(valid({ ...receipt, exclusiveUntil: new Date(deadline).toISOString() }), false);
  assert.equal(valid({ ...receipt, confirmedAt: new Date(now - 31 * 60_000).toISOString() }), false);
  assert.equal(valid({ ...receipt, checks: { ...receipt.checks, authorizedChecklist: false } }), false);
});

test("Hosting accepts only the exact site and live channel in either Firebase resource format", () => {
  const short = "sites/clean-flow-prototipo";
  const canonical = "projects/470414797064/" + short;
  assert.equal(releaseId(short + "/releases/1793827781258000"), "1793827781258000");
  assert.equal(releaseId(canonical + "/channels/live/releases/1793827781258000"), "1793827781258000");
  assert.equal(versionId(canonical + "/versions/2aa48a01a2244d34"), "2aa48a01a2244d34");
  assert.throws(() => releaseId(canonical + "/channels/preview/releases/1793827781258000"), /Unexpected live/);
  assert.throws(() => versionId("projects/1234/" + short + "/versions/2aa48a01a2244d34"), /Unexpected Hosting project/);
});
