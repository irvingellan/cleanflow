import { randomUUID } from "node:crypto";
import { closeSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { emptyShadowState } from "../../functions/src/reservationIntake/reservationShadowState.js";

export const maxStateBytes = 10 * 1024 * 1024;

export function readBoundedText(path, maxBytes, errorCode) {
  const info = lstatSync(path);
  if (!info.isFile() || info.size > maxBytes) throw new Error(errorCode);
  const bytes = readFileSync(path);
  if (bytes.length > maxBytes) throw new Error(errorCode);
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function loadState(path, scope) {
  let value;
  try {
    value = JSON.parse(readBoundedText(path, maxStateBytes, "INVALID_LOCAL_STATE"));
  } catch (error) {
    if (error.code === "ENOENT") return emptyShadowState();
    throw new Error("INVALID_LOCAL_STATE");
  }
  if (value?.scope?.projectId !== scope.projectId || value?.scope?.organizationId !== scope.organizationId) {
    throw new Error("LOCAL_STATE_SCOPE_MISMATCH");
  }
  const { state } = value;
  if (state?.version !== 1 || !state.candidates || Array.isArray(state.candidates)
    || typeof state.candidates !== "object" || !state.polls || Array.isArray(state.polls)
    || typeof state.polls !== "object" || !Array.isArray(state.diagnostics)
    || (state.audit !== undefined && !Array.isArray(state.audit))
    || (state.receipts !== undefined && !Array.isArray(state.receipts))) throw new Error("INVALID_LOCAL_STATE");
  return state;
}

export async function withShadowState(directory, scope, update) {
  const root = resolve(directory);
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const info = lstatSync(root);
  if (!info.isDirectory() || (info.mode & 0o077) !== 0) throw new Error("STATE_DIRECTORY_MUST_BE_PRIVATE");
  const lock = join(root, "state.lock");
  let lockFd;
  try {
    lockFd = openSync(lock, "wx", 0o600);
  } catch (error) {
    if (error.code === "EEXIST") throw new Error("LOCAL_STATE_BUSY");
    throw error;
  }
  const path = join(root, "reservation-shadow.json");
  const temporary = join(root, `state-${randomUUID()}.tmp`);
  let temporaryOwned = false;
  try {
    const state = await update(loadState(path, scope));
    const serialized = `${JSON.stringify({ scope, state }, null, 2)}\n`;
    if (Buffer.byteLength(serialized) > maxStateBytes) throw new Error("LOCAL_STATE_TOO_LARGE");
    const output = openSync(temporary, "wx", 0o600);
    temporaryOwned = true;
    try {
      writeFileSync(output, serialized);
    } finally {
      closeSync(output);
    }
    renameSync(temporary, path);
    temporaryOwned = false;
    return state;
  } finally {
    if (temporaryOwned) unlinkSync(temporary);
    closeSync(lockFd);
    unlinkSync(lock);
  }
}
