import assert from "node:assert/strict";
import { test } from "node:test";
import { expectedAgendaHosting, interruptedPublishLock, validIosAcceptance } from "./hosting-release.mjs";

const marker = "CleanFlow Definitive UI reviewed-plan";
const baseline = {
  hosting: { release: "sites/demo/releases/old", version: "v1" },
  functions: { callable: { revision: "initial" } },
  rules: { id: "rules-v1" },
  schedules: [],
};
const live = { ...baseline, hosting: { release: "sites/demo/releases/new", version: "v2" } };
const entry = { state: "DEPLOYING", step: "hosting", snapshot: baseline, lock: "owned-lock-timestamp" };
const release = { name: live.hosting.release, version: { name: "sites/demo/versions/v2" }, message: marker };

test("interrupted publish rollback requires its journal, exact Hosting marker and unchanged backend", () => {
  assert.equal(interruptedPublishLock(baseline, live, entry, release, marker), entry.lock);
  assert.throws(() => interruptedPublishLock(baseline, live, entry, { ...release, message: "another release" }, marker), /ownership/);
  assert.throws(() => interruptedPublishLock(baseline, live, null, release, marker), /ownership/);
  assert.throws(() => interruptedPublishLock(baseline, { ...live, rules: { id: "drift" } }, entry, release, marker), /Concurrent rules/);
  assert.throws(() => interruptedPublishLock(baseline, { ...live, functions: {} }, entry, release, marker), /Unexpected Functions/);
});

test("the Hosting change inserts agenda routes ahead of the fallback and retains API rewrites", () => {
  const api = { source: "/api/public-checklist", function: { functionId: "publicChecklist" } };
  const fallback = { source: "**", destination: "/index.html" };
  const agenda = { source: "/agenda", headers: [{ key: "Cache-Control", value: "no-store, private" }] };
  const before = { firestore: { rules: "firestore.rules" }, hosting: { rewrites: [api, fallback], headers: [agenda] } };
  assert.deepEqual(expectedAgendaHosting(before), {
    firestore: before.firestore,
    hosting: {
      rewrites: [api, { source: "/agenda", destination: "/agenda.html" }, { source: "/agenda/", destination: "/agenda.html" }, fallback],
      headers: [agenda, { ...agenda, source: "/agenda/" }, { ...agenda, source: "/agenda.html" }],
    },
  });
});

test("physical installation acceptance must match the sealed candidate and preserve the manager icon", () => {
  const plan = { sha: "candidate", manifestHash: "manifest" };
  const receipt = {
    ...plan, state: "PASS", device: "physical-iphone", iosVersion: "26.1",
    checks: {
      managerIconRetained: true, managerIconOpensRoot: true, agendaIconOpensAgenda: true,
      identityAndSessionsSeparate: true, legacyIconChecked: true, safariAndWhatsAppLinksChecked: true,
      checklistHandoffChecked: true,
    },
  };
  assert.equal(validIosAcceptance(receipt, plan), true);
  assert.equal(validIosAcceptance({ ...receipt, device: "simulator" }, plan), false);
  assert.equal(validIosAcceptance({ ...receipt, manifestHash: "other" }, plan), false);
  assert.equal(validIosAcceptance({ ...receipt, checks: { ...receipt.checks, managerIconRetained: false } }, plan), false);
});
