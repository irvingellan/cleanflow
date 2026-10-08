// Memory-only provider-shaped adapter for CURRENT history views. No SDK is loaded.
const deny = name => (...args) => { globalThis.__integratedBlocked ||= []; globalThis.__integratedBlocked.push(name); throw new Error(`Synthetic preview: ${name} disabled`); };
export const collection = (_db, ...path) => ({ path });
export const doc = (_db, ...path) => ({ path });
export const where = (field, op, value) => ({ field, op, value });
export const orderBy = (field, direction = "asc") => ({ order: field, direction });
export const limit = count => ({ limit: count });
export const startAfter = () => ({});
export const documentId = () => "id";
export const query = (ref, ...constraints) => ({ ...ref, constraints });
export async function getDocs(ref) {
  const context = globalThis.__integratedContext;
  const kind = ref.path?.at(-1);
  let rows = [...(context?.[kind] || [])];
  for (const c of ref.constraints || []) {
    if (c.field) rows = rows.filter(row => c.op === "==" ? row[c.field] === c.value : c.op === "in" ? c.value.includes(row[c.field]) : c.op === "array-contains" ? row[c.field]?.includes(c.value) : c.op === ">=" ? row[c.field] >= c.value : c.op === "<" ? row[c.field] < c.value : false);
    if (c.order) rows.sort((a,b) => String(a[c.order]?.toMillis?.() || a[c.order] || "").localeCompare(String(b[c.order]?.toMillis?.() || b[c.order] || "")) * (c.direction === "desc" ? -1 : 1));
    if (c.limit) rows = rows.slice(0,c.limit);
  }
  return { docs: rows.map(row => ({ id: row.id, data: () => row })), metadata: { fromCache: false } };
}
export async function getDocsFromServer(ref) { return getDocs(ref); }
export async function getDoc(ref) { const kind=ref.path?.at(-2),id=ref.path?.at(-1);const value=globalThis.__integratedContext?.[kind]?.find(r=>r.id===id);return {id,exists:()=>Boolean(value),data:()=>value}; }
export const getDocFromServer = getDoc;
export class Timestamp {
  constructor(seconds, nanoseconds = 0) { this.seconds=seconds; this.nanoseconds=nanoseconds; }
  static fromDate(date) { return new Timestamp(Math.floor(date.getTime()/1000),(date.getTime()%1000)*1e6); }
  static now() { return Timestamp.fromDate(new Date()); }
  toDate() { return new Date(this.seconds*1000+this.nanoseconds/1e6); }
  toMillis() { return this.toDate().getTime(); }
}
export const addDoc = deny("addDoc"), updateDoc = deny("updateDoc"), setDoc = deny("setDoc"), deleteDoc = deny("deleteDoc"), runTransaction = deny("runTransaction"), writeBatch = deny("writeBatch"), serverTimestamp = deny("serverTimestamp");
export const httpsCallable = (_functions,name) => deny(`httpsCallable:${name}`);
export const deleteField = deny("deleteField"), increment = deny("increment"), onSnapshot = deny("onSnapshot"), getAuth = deny("getAuth"), getToken = deny("getToken"), deleteToken = deny("deleteToken"), isSupported = async () => false, getMessaging = deny("getMessaging"), onMessage = deny("onMessage");
export const getDownloadURL = deny("getDownloadURL"), ref = deny("storage.ref"), uploadBytesResumable = deny("uploadBytesResumable");
