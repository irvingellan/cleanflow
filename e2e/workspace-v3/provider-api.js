export * from "../authenticated-v2/provider-api.js";
import { getDoc as readDoc, getDocs as readDocs, onAuthStateChanged as auth } from "../authenticated-v2/provider-api.js";
export const onAuthStateChanged = (a, callback) => auth(a, user => callback(new URLSearchParams(location.search).has("nonDeveloper") ? { ...user, email: "operator@cleanflow.e2e" } : user));
export async function getDoc(ref) {
  if (ref.path?.at(-2) === "members" && new URLSearchParams(location.search).has("denied")) return { exists: () => true, data: () => ({ active: false, role: "CLEANER" }), metadata: { fromCache: false } };
  return readDoc(ref);
}
export const getDocFromServer = getDoc;
export async function getDocs(ref) {
  globalThis.__workspaceReads.push({ collection: ref.path?.at(-1) });
  const dashboardRead = ref.constraints?.some(c => c.field === "operationalStatus" && c.op === "in" && c.value.length === 2);
  if (dashboardRead && new URLSearchParams(location.search).has("slowRead") && !globalThis.__workspaceReleased) await new Promise(resolve => { globalThis.__releaseWorkspaceRead = () => { globalThis.__workspaceReleased = true; resolve(); }; });
  if (dashboardRead && new URLSearchParams(location.search).has("readFailure") && !globalThis.__failedWorkspaceRead) { globalThis.__failedWorkspaceRead = true; throw Object.assign(Error("Synthetic read failure"), { code: "unavailable" }); }
  return readDocs(ref);
}
export const getDocsFromServer = getDocs;
