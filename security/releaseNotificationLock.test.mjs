import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { assertFails, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { createLockWrite, deleteLockWrite } from "../scripts/notificationReleaseCloud.mjs";

const projectId = "demo-cleanflow";
const port = Number(process.env.CLEANFLOW_SECURITY_FIRESTORE_PORT || 8080);
assert.ok([8080, 18080].includes(port));
assert.equal(process.env.GCLOUD_PROJECT, projectId);
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, `127.0.0.1:${port}`);
const name = `projects/${projectId}/databases/(default)/documents/cleanflowReleaseControl/production`;
const commitUrl = `http://127.0.0.1:${port}/v1/projects/${projectId}/databases/(default)/documents:commit`;
const commit = (write) => fetch(commitUrl, {
  method: "POST",
  headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
  body: JSON.stringify({ writes: [write] }),
});

test("release mutex is exclusive, conditionally released and unreachable by browser identities", async () => {
  const environment = await initializeTestEnvironment({
    projectId, firestore: { host: "127.0.0.1", port, rules: await readFile("firestore.rules", "utf8") },
  });
  let current;
  try {
    const attempts = await Promise.all(["publish", "rollback"].map((action) =>
      commit(createLockWrite(name, { action, sha: "synthetic" }))));
    assert.equal(attempts.filter((response) => response.ok).length, 1);
    const loser = attempts.find((response) => !response.ok);
    assert.equal((await loser.json()).error.status, "ALREADY_EXISTS");
    const winner = attempts.find((response) => response.ok);
    current = (await winner.json()).writeResults[0].updateTime;
    assert.ok(current);
    const stale = await commit(deleteLockWrite(name, "2020-01-01T00:00:00Z"));
    assert.equal((await stale.json()).error.status, "FAILED_PRECONDITION");
    const context = environment.authenticatedContext("synthetic-user");
    const lock = doc(context.firestore(), "cleanflowReleaseControl/production");
    await assertFails(getDoc(lock));
    await assertFails(setDoc(lock, { action: "overwrite" }));
    assert.equal((await commit(deleteLockWrite(name, current))).status, 200);
    current = null;
    const next = await commit(createLockWrite(name, { action: "rollback", sha: "synthetic" }));
    assert.equal(next.status, 200);
    current = (await next.json()).writeResults[0].updateTime;
  } finally {
    if (current) assert.equal((await commit(deleteLockWrite(name, current))).status, 200);
    await environment.cleanup();
  }
});
