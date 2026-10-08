export * from "../integrated-v2/provider-api.js";
import { getDoc as originalGetDoc } from "../integrated-v2/provider-api.js";
const deny = name => { globalThis.__integratedBlocked.push(name); throw Error(`Synthetic App QA denies ${name}`); };
// Existing navigation telemetry is simulated in memory, not a provider write.
// All operational persistence remains explicitly rejected.
export const serverTimestamp = () => ({ syntheticServerTimestamp: true });
export const addDoc = async ref => {
  if (!["managerPageLoadEvents", "managerOperationEvents"].includes(ref.path?.at(-1))) return deny("addDoc");
  return { id: "synthetic-telemetry" };
};
export const getAuth = () => ({});
export const onAuthStateChanged = (_auth, callback) => {
  queueMicrotask(() => callback({ uid: "synthetic-manager", email: "manager@cleanflow.e2e", displayName: "Synthetic manager", isAnonymous: false }));
  return () => {};
};
export const signInWithEmailAndPassword = () => deny("signIn");
export const signOut = () => deny("signOut");
export const connectAuthEmulator = () => deny("connectAuthEmulator");
export async function getDoc(ref) {
  if (ref.path?.at(-2) === "members") return { exists: () => true, data: () => ({ role: "MANAGER", active: true }), metadata: { fromCache: false } };
  return { ...await originalGetDoc(ref), metadata: { fromCache: false } };
}
export const getDocFromServer = getDoc;
// The real Dashboard uses <= date bounds and Timestamp comparisons, unlike the
// narrower history-only adapter. Keep this provider emulation local to App QA.
export async function getDocs(ref) {
  const comparable = value => value?.toMillis?.() ?? value;
  const context = globalThis.__integratedContext, kind = ref.path?.at(-1);
  const parent = ref.path?.at(-3) === "jobs"
    ? context.records.find(record => record.job.id === ref.path.at(-2)) : null;
  let rows = [...((parent ? parent[kind] : context?.[kind]) || [])];
  for (const c of ref.constraints || []) {
    if (c.field) rows = rows.filter(row => {
      const a = comparable(row[c.field]), b = comparable(c.value);
      if (c.op === "==") return a === b;
      if (c.op === "in") return c.value.includes(a);
      if (c.op === "array-contains") return a?.includes(b);
      if (c.op === ">=") return a >= b;
      if (c.op === "<=") return a <= b;
      if (c.op === "<") return a < b;
      throw Error(`Unsupported synthetic query: ${c.op}`);
    });
    if (c.order) rows.sort((a, b) => {
      const av = comparable(a[c.order]), bv = comparable(b[c.order]);
      return (av === bv ? 0 : av < bv ? -1 : 1) * (c.direction === "desc" ? -1 : 1);
    });
    if (c.limit) rows = rows.slice(0, c.limit);
  }
  return { docs: rows.map(row => ({ id: row.id, data: () => row })), metadata: { fromCache: false } };
}
export const getDocsFromServer = getDocs;
export const onSnapshot = (ref, _options, next) => {
  let active = true; getDoc(ref).then(snapshot => { if (active) next(snapshot); });
  return () => { active = false; };
};
export const httpsCallable = (_functions, name) => async input => {
  const record = globalThis.__integratedContext.records.find(record => record.job.id === input?.jobId);
  if (name === "getChecklistRun") return { data: { run: record?.checklistRun || null } };
  if (name === "getChecklistCapability") return { data: record?.checklistCapability || null };
  if (name === "getDevCenterAccess") return { data: { authorized: false } };
  throw Object.assign(new Error(`Synthetic App QA denies callable ${name}`), { code: "functions/unavailable" });
};
