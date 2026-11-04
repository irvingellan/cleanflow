// Prints the scenario catalog as Markdown (used to keep README in sync).
// Run: node --experimental-strip-types scripts/catalog.ts
import { SCENARIOS } from "../src/scenarios/registry.ts";
import { createSession, run } from "../src/engine/session.ts";

const rows = SCENARIOS.map((s) => {
  const w = run(createSession(s)).world;
  const pass = s.checks.filter((c) => c.test(w)).length;
  return `| ${s.id} | ${s.name.en} | ${s.realProductStatus.join(" + ")} | ${s.proposal ? "proposal" : "published"} | ${pass}/${s.checks.length} |`;
});
console.log(["| ID | Scenario | Canonical-map status | Lab label | Checks |", "|---|---|---|---|---|", ...rows].join("\n"));
