import fs from "node:fs";
import path from "node:path";
import { emptyShadowState, applyShadowPoll } from "../../src/features/reservation-intake/reservationShadowState.js";
import { validateConfig } from "./config.mjs";
import { sanitizeInboxSnapshot } from "../../src/features/reservation-intake/reservationInboxService.js";

export function openLocalStore(directory, config) {
  validateConfig(config);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (fs.lstatSync(directory).isSymbolicLink()) throw new Error("LOCAL_STATE_PATH_DENIED");
  const file = path.join(directory, "shadow-state.json");
  let state = emptyShadowState();
  if (fs.existsSync(file)) {
    try {
      if (fs.lstatSync(file).isSymbolicLink()) throw new Error();
      if (fs.statSync(file).size > 10 * 1024 * 1024) throw new Error();
      state = JSON.parse(fs.readFileSync(file, "utf8"));
      if (state.version !== 1 || !state.candidates || Array.isArray(state.candidates) || !state.polls || !Array.isArray(state.diagnostics)
        || state.binding?.organizationId !== config.organizationId || state.binding?.projectId !== config.target.projectId) throw new Error();
      sanitizeInboxSnapshot({ candidates: Object.values(state.candidates) });
    } catch { throw new Error("LOCAL_STATE_CORRUPTED_REVIEW_REQUIRED"); }
  }
  state.binding = { organizationId: config.organizationId, projectId: config.target.projectId };
  let pending = Promise.resolve();
  return {
    snapshot: () => structuredClone(state),
    ingest(poll) {
      const operation = pending.then(async () => {
        const updated = await applyShadowPoll(state, poll, config);
        sanitizeInboxSnapshot({ candidates: Object.values(updated.candidates) });
        const serialized = JSON.stringify(updated);
        if (Buffer.byteLength(serialized) > 10 * 1024 * 1024) throw new Error("LOCAL_STATE_LIMIT_REVIEW_REQUIRED");
        const temp = `${file}.tmp`;
        if (fs.existsSync(temp) && fs.lstatSync(temp).isSymbolicLink()) throw new Error("LOCAL_STATE_PATH_DENIED");
        fs.writeFileSync(temp, serialized, { mode: 0o600 });
        fs.renameSync(temp, file); state = updated;
        return structuredClone(updated);
      });
      pending = operation.catch(() => {});
      return operation;
    },
  };
}
