import { httpsCallable } from "firebase/functions";
import { functions } from "../../services/firebase/client.js";

const accessCall = httpsCallable(functions, "getDevCenterAccess");
const generateScenarioCall = httpsCallable(functions, "generateDevCenterScenario");
const clearDataCall = httpsCallable(functions, "clearDevCenterData");

export async function getDevCenterAccess() {
  const result = await accessCall();
  return result.data;
}

export async function generateDevCenterScenario(scenario) {
  const result = await generateScenarioCall({ scenario });
  return result.data;
}

export async function clearDevCenterData() {
  const result = await clearDataCall();
  return result.data;
}
