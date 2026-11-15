import { projectID } from "firebase-functions/params";
import { developerUidsFromSecret } from "../devCenterAuthorization.js";
import { resolveDevCenterProjectId } from "../devCenterSafety.js";
import { devCenterDeveloperUids, devCenterSandboxProjectId } from "./params.js";

export function allowedDeveloperUids() {
  return developerUidsFromSecret(devCenterDeveloperUids.value());
}

export function devCenterEnvironmentOptions() {
  return {
    functionsEmulator: process.env.FUNCTIONS_EMULATOR,
    currentProjectId: resolveDevCenterProjectId({ projectIdValue: () => projectID.value(), environment: process.env }),
    sandboxProjectId: devCenterSandboxProjectId.value(),
  };
}
