import { httpsCallable } from "firebase/functions";
import { functions } from "./client.js";
import { startFunctionWarmup } from "./functionWarmup.js";

// The Functions a manager waits on when opening a service: checklist, link,
// photo counts and photos. `warmup: true` returns right after authorization.
const managerWarmFunctions = ["getChecklistRun", "getChecklistCapability", "getJobPhotoCounts", "getChecklistEvidence"];

export function startManagerFunctionWarmup() {
  return startFunctionWarmup(managerWarmFunctions.map((name) => [
    name, () => httpsCallable(functions, name, { timeout: 30_000 })({ warmup: true }),
  ]));
}
