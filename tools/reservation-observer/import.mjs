import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { validateConfig } from "./config.mjs";
import { openLocalStore } from "./localStore.mjs";
export async function importManualObservations(config, observations, directory = ".reservation-observer") {
  validateConfig(config);
  if (!Array.isArray(observations) || observations.length > 1000 || observations.length === 0) throw new Error("INVALID_MANUAL_IMPORT");
  const sourceId = observations[0].sourceId;
  const source = config.sources.find(source => source.id === sourceId && source.enabled === true && source.type === "MANUAL_IMPORT");
  if (!source || observations.some(row => row.sourceType !== "MANUAL_IMPORT" || row.sourceProvider !== source.provider)) throw new Error("MANUAL_SOURCE_DENIED");
  const observedAt = new Date().toISOString();
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (fs.lstatSync(directory).isSymbolicLink()) throw new Error("LOCAL_STATE_PATH_DENIED");
  const lock = path.join(directory, "observer.lock");
  let handle;
  try { handle = fs.openSync(lock, "wx", 0o600); }
  catch { throw new Error("LOCAL_OBSERVER_BUSY"); }
  try {
    const store = openLocalStore(directory, config);
    return await store.ingest({ sourceId, observedAt, result: "SUCCESS", complete: false, observations: observations.map(row => ({ ...row, observedAt })) });
  } finally { fs.closeSync(handle); fs.unlinkSync(lock); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const config = JSON.parse(fs.readFileSync(process.argv[2] || "reservation-observer.local.json", "utf8"));
    const file = process.argv[3]; if (!file || fs.statSync(file).size > 256 * 1024) throw new Error();
    const state = await importManualObservations(config, JSON.parse(fs.readFileSync(file, "utf8")));
    console.log(JSON.stringify({ result: "LOCAL_SHADOW_IMPORTED", count: Object.keys(state.candidates).length }));
  } catch { console.error("MANUAL_IMPORT_REJECTED — no operational actions"); process.exitCode = 1; }
}
