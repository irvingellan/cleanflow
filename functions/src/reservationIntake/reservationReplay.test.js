// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it, vi } from "vitest";
import { replayFixture } from "../../../tools/reservation-observer/replay.mjs";

const fixtureRoot = fileURLToPath(new URL("../../../tools/reservation-observer/fixtures/", import.meta.url));
const demo = join(fixtureRoot, "demo.json");
const cli = fileURLToPath(new URL("../../../tools/reservation-observer/replay.mjs", import.meta.url));
const stateName = "reservation-shadow.json";
const scratch = [];
function setup() {
  const root = mkdtempSync(join(tmpdir(), "cleanflow-shadow-test-"));
  scratch.push(root);
  return { root, stateDirectory: join(root, "state"), fixturePath: join(root, "fixture.json") };
}
function fixture(value = {}) {
  return { mode: "SHADOW_ONLY", projectId: "demo-cleanflow", organizationId: "synthetic-tests",
    sources: [], properties: [], jobs: [], snapshots: [], ...value };
}
afterEach(() => {
  for (const root of scratch.splice(0)) rmSync(root, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

it("replays the full synthetic calendar into private durable state without network or raw payload", async () => {
  const { stateDirectory } = setup();
  const network = vi.fn(() => { throw new Error("UNEXPECTED_NETWORK"); });
  vi.stubGlobal("fetch", network);
  const result = await replayFixture({ fixturePath: demo, stateDirectory });
  expect(network).not.toHaveBeenCalled();
  expect(result.candidateCount).toBe(6);
  expect(result.suggestions).toEqual(expect.arrayContaining([
    expect.objectContaining({ recommendation: "SUGGEST_NEW_CLEANING", checkoutDate: "2026-12-06", propertyId: "property-beta" }),
    expect.objectContaining({ recommendation: "REVIEW", conflictingJobIds: ["job-alpha"],
      reasons: ["POSSIBLE_DUPLICATE_SOURCE", "CHANGED_BOOKING_WITH_EXISTING_JOB"] }),
    expect.objectContaining({ recommendation: "EXCLUDED", reasons: ["OWNER_STAY"] }),
  ]));
  const localState = join(stateDirectory, stateName);
  const previous = readFileSync(localState, "utf8");
  expect((statSync(localState).mode & 0o777)).toBe(0o600);
  expect((statSync(stateDirectory).mode & 0o777)).toBe(0o700);
  for (const output of [JSON.stringify(result), previous]) {
    expect(output).not.toMatch(/synthetic-alpha-stay|private notes|SUMMARY|DESCRIPTION/);
  }
  const recovered = execFileSync(process.execPath, [cli, "--fixture", demo, "--state-dir", stateDirectory], { encoding: "utf8" });
  expect(JSON.parse(recovered)).toEqual(result);
  expect(readFileSync(localState, "utf8")).toBe(previous);
});

it("turns a malformed calendar between snapshots into a safe diagnostic that preserves known evidence", async () => {
  const paths = setup();
  const { root, fixturePath } = paths;
  writeFileSync(join(root, "good.ics"), readFileSync(join(fixtureRoot, "alpha-initial.ics")));
  writeFileSync(join(root, "bad.ics"), "STOP synthetic-bad-body");
  writeFileSync(fixturePath, JSON.stringify(fixture({
    sources: [{ id: "source-one", provider: "HOSPITABLE", completeSnapshot: true, propertyIds: [],
      eventKinds: [{ uid: "synthetic-alpha-stay", kind: "BOOKING" }] }],
    snapshots: [
      { sourceId: "source-one", observedAt: "2026-11-01T10:00:00Z", file: "good.ics" },
      { sourceId: "source-one", observedAt: "2026-11-02T10:00:00Z", file: "bad.ics" },
      { sourceId: "source-one", observedAt: "2026-11-03T10:00:00Z", file: "missing.ics" },
    ],
  })));
  const result = await replayFixture(paths);
  expect(result.observations.find(event => event.calendarEventKind === "BOOKING").missingCount).toBe(0);
  expect(result.diagnostics.map(event => event.errorCategory)).toEqual(["MALFORMED_ICAL", "FIXTURE_UNREADABLE"]);
  expect(JSON.stringify(result)).not.toMatch(/synthetic-bad-body|bad\.ics|missing\.ics/);
});

it("rejects non-synthetic scope, unknown metadata and input outside the fixture folder", async () => {
  const paths = setup();
  const { root, fixturePath, stateDirectory } = paths;
  writeFileSync(fixturePath, JSON.stringify(fixture({ projectId: "production-example" })));
  await expect(replayFixture(paths)).rejects.toThrow("SYNTHETIC_SCOPE_REQUIRED");
  writeFileSync(fixturePath, JSON.stringify(fixture({ sourceUrl: "https://example.invalid/private-secret" })));
  await expect(replayFixture(paths)).rejects.toThrow("INVALID_SYNTHETIC_MANIFEST");
  expect(() => statSync(stateDirectory)).toThrow(/ENOENT/);

  symlinkSync(join(fixtureRoot, "alpha-initial.ics"), join(root, "aliased.ics"));
  writeFileSync(fixturePath, JSON.stringify(fixture({
    sources: [{ id: "source-one", provider: "HOSPITABLE", eventKinds: [], propertyIds: [] }],
    snapshots: [{ sourceId: "source-one", observedAt: "2026-11-01T10:00:00Z", file: "aliased.ics" }],
  })));
  await expect(replayFixture(paths)).rejects.toThrow("INVALID_SYNTHETIC_MANIFEST");
  expect(() => statSync(join(stateDirectory, stateName))).toThrow(/ENOENT/);
});

it("preserves differently scoped, locked, or corrupt state", async () => {
  const paths = setup();
  const { fixturePath, stateDirectory } = paths;
  writeFileSync(fixturePath, JSON.stringify(fixture()));
  mkdirSync(stateDirectory, { mode: 0o700 });
  const lock = join(stateDirectory, "state.lock");
  const path = join(stateDirectory, stateName);
  writeFileSync(lock, "external-owner");
  await expect(replayFixture(paths)).rejects.toThrow("LOCAL_STATE_BUSY");
  expect(readFileSync(lock, "utf8")).toBe("external-owner");
  rmSync(lock);
  const scoped = JSON.stringify({ scope: { projectId: "demo-cleanflow", organizationId: "synthetic-other" } });
  writeFileSync(path, scoped);
  await expect(replayFixture(paths)).rejects.toThrow("LOCAL_STATE_SCOPE_MISMATCH");
  expect(readFileSync(path, "utf8")).toBe(scoped);
  writeFileSync(path, "{");
  await expect(replayFixture(paths)).rejects.toThrow("INVALID_LOCAL_STATE");
  expect(readFileSync(path, "utf8")).toBe("{");
});
