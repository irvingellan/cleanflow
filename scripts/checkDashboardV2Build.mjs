import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

// Pure artifact inspection; no build, deploy, credentials or provider access.
export function checkDashboardV2Build(directory, environment) {
  assert(["production", "sandbox"].includes(environment), "Explicit environment required");
  const version = JSON.parse(fs.readFileSync(path.join(directory,"version.json"),"utf8"));
  assert.equal(version.environment, environment);
  const assets = fs.readdirSync(path.join(directory,"assets"));
  const text = assets.filter(file=>/\.(js|css)$/.test(file)).map(file=>fs.readFileSync(path.join(directory,"assets",file),"utf8")).join("\n");
  for (const marker of ["dashboard-pilot-comparison", "dashboard-v2-attention-row", "dashboard-v2-workload"])
    assert.equal(text.includes(marker), environment === "sandbox", `${marker} boundary`);
  for (const marker of ["Local synthetic scenario", "Synthetic handler:", "Demo Pending Reply", "e2e/dashboard-v2"])
    assert.equal(text.includes(marker), false, `${marker} must remain harness-only`);
  assert(text.includes("dashboard-next-item"), "CURRENT Dashboard retained");
  return { environment, v2Included: environment === "sandbox", harnessExcluded: true, currentRetained: true };
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname))
  console.log(JSON.stringify(checkDashboardV2Build(process.argv[2],process.argv[3])));
