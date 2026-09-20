import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checklistDraftRecoveryScope,
  checklistDraftRecoveryStoragePrefix,
  clearChecklistDraftRecovery,
  loadChecklistDraftRecovery,
  saveChecklistDraftRecovery,
} from "./checklistDraftRecovery.js";

const scope = "opaque-fingerprint";
const mutation = {
  mutationId: "mutation-identifier-1",
  baseRevision: 0,
  changes: { generalNotes: "Local note" },
};

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe("checklist draft local recovery", () => {
  it("stores only bounded sparse edits under an opaque scope", () => {
    expect(saveChecklistDraftRecovery(scope, {
      pendingMutation: mutation,
      queuedChanges: { issueNotes: "Later" },
    })).toBe(true);

    const raw = window.localStorage.getItem(`${checklistDraftRecoveryStoragePrefix}${scope}`);
    expect(raw).toContain("mutation-identifier-1");
    expect(raw).not.toContain("raw-capability-token");
    expect(loadChecklistDraftRecovery(scope)).toMatchObject({
      pendingMutation: mutation,
      queuedChanges: { issueNotes: "Later" },
    });
  });

  it("ignores malformed or expired recovery without blocking the public checklist", () => {
    window.localStorage.setItem(`${checklistDraftRecoveryStoragePrefix}${scope}`, "not-json");
    expect(loadChecklistDraftRecovery(scope)).toBeNull();

    saveChecklistDraftRecovery(scope, { pendingMutation: mutation, queuedChanges: {} }, { now: 0 });
    expect(loadChecklistDraftRecovery(scope, { now: 8 * 24 * 60 * 60 * 1000 })).toBeNull();
  });

  it("can explicitly discard local pending edits after conflict review", () => {
    saveChecklistDraftRecovery(scope, { pendingMutation: mutation, queuedChanges: {} });
    clearChecklistDraftRecovery(scope);
    expect(loadChecklistDraftRecovery(scope)).toBeNull();
  });

  it("uses different opaque SHA-256 scopes for different capabilities", async () => {
    const digest = vi.fn()
      .mockResolvedValueOnce(Uint8Array.from([1, 2, 3]).buffer)
      .mockResolvedValueOnce(Uint8Array.from([4, 5, 6]).buffer);
    vi.stubGlobal("crypto", { subtle: { digest } });

    const first = await checklistDraftRecoveryScope("capability-one");
    const second = await checklistDraftRecoveryScope("capability-two");

    expect(first).toBe("AQID");
    expect(second).toBe("BAUG");
    expect(first).not.toContain("capability-one");
    expect(second).not.toContain("capability-two");
  });
});
