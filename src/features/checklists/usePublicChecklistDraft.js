import { useCallback, useEffect, useRef, useState } from "react";
import {
  getPublicChecklist,
  readyPublicChecklistForReview,
  savePublicChecklistDraft,
} from "./checklistCapabilityService.js";
import {
  checklistDraftRecoveryScopeBounded,
  clearChecklistDraftRecovery,
  loadChecklistDraftRecovery,
  saveChecklistDraftRecovery,
} from "./checklistDraftRecovery.js";

export const checklistSaveStates = {
  LOADING: "LOADING",
  SAVED: "SAVED",
  SAVING: "SAVING",
  OFFLINE_PENDING: "OFFLINE_PENDING",
  CONFLICT: "CONFLICT",
  UNAVAILABLE: "UNAVAILABLE",
  RETRY: "RETRY",
  READY_FOR_REVIEW: "READY_FOR_REVIEW",
};

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasChanges(changes) {
  return isPlainObject(changes) && Object.keys(changes).length > 0;
}

export function mergeChecklistChanges(draft, changes) {
  return {
    ...draft,
    checklistAnswers: { ...(draft?.checklistAnswers || {}), ...(changes?.checklistAnswers || {}) },
    inventoryAnswers: { ...(draft?.inventoryAnswers || {}), ...(changes?.inventoryAnswers || {}) },
    ...(Object.hasOwn(changes || {}, "issueNotes") ? { issueNotes: changes.issueNotes } : {}),
    ...(Object.hasOwn(changes || {}, "generalNotes") ? { generalNotes: changes.generalNotes } : {}),
  };
}

export function mergeSparseChecklistChanges(current = {}, next = {}) {
  const merged = {
    ...current,
    ...(next.checklistAnswers ? {
      checklistAnswers: { ...(current.checklistAnswers || {}), ...next.checklistAnswers },
    } : {}),
    ...(next.inventoryAnswers ? {
      inventoryAnswers: { ...(current.inventoryAnswers || {}), ...next.inventoryAnswers },
    } : {}),
  };
  for (const field of ["issueNotes", "generalNotes"]) {
    if (Object.hasOwn(next, field)) merged[field] = next[field];
  }
  return merged;
}

function createMutationId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID().replaceAll("-", "");
  const bytes = new Uint8Array(18);
  globalThis.crypto?.getRandomValues?.(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isOnline() {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

function isUnavailable(error) {
  if (Number.isInteger(error?.status)) return error.status === 404 || error.status === 410;
  return error?.code === "checklist_not_found" || error?.code === "checklist_unavailable";
}

function isRevisionConflict(error) {
  return error?.status === 409;
}

function validDraft(value) {
  return isPlainObject(value) && Number.isInteger(value.revision) && value.revision >= 0;
}

function checklistIsReadyForReview(checklist) {
  return checklist?.status === checklistSaveStates.READY_FOR_REVIEW;
}

/**
 * Serializes one cleaner editor's sparse mutations. A recovery record retains
 * the original mutation ID before dispatch, allowing an uncertain response to
 * retry without creating a second server mutation.
 */
export function usePublicChecklistDraft(token) {
  const [checklist, setChecklist] = useState(null);
  const [draft, setDraft] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [loadDiagnostics, setLoadDiagnostics] = useState(null);
  const [saveState, setSaveState] = useState(checklistSaveStates.LOADING);
  const [hasRecoveryWarning, setHasRecoveryWarning] = useState(false);
  const [isResolvingConflict, setIsResolvingConflict] = useState(false);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState(null);
  const [reviewRequirements, setReviewRequirements] = useState(null);
  const scopeRef = useRef(null);
  const pendingMutationRef = useRef(null);
  const queuedChangesRef = useRef({});
  const draftRef = useRef(null);
  const isSavingRef = useRef(false);
  const isSubmittingReviewRef = useRef(false);
  const reviewSubmissionRef = useRef(null);
  const isMountedRef = useRef(false);
  const noteDebounceRef = useRef(null);
  const flushRef = useRef(null);
  const saveStateRef = useRef(checklistSaveStates.LOADING);

  const setCurrentSaveState = useCallback((nextState) => {
    saveStateRef.current = nextState;
    if (isMountedRef.current) setSaveState(nextState);
  }, []);

  const persistRecovery = useCallback(() => {
    if (!scopeRef.current) {
      if (isMountedRef.current) setHasRecoveryWarning(true);
      return;
    }
    if (!pendingMutationRef.current && !hasChanges(queuedChangesRef.current)) {
      clearChecklistDraftRecovery(scopeRef.current);
      if (isMountedRef.current) setHasRecoveryWarning(false);
      return;
    }
    const saved = saveChecklistDraftRecovery(scopeRef.current, {
      pendingMutation: pendingMutationRef.current,
      queuedChanges: queuedChangesRef.current,
    });
    if (isMountedRef.current) setHasRecoveryWarning(!saved);
  }, []);

  const setVisibleDraft = useCallback((nextDraft) => {
    draftRef.current = nextDraft;
    if (isMountedRef.current) setDraft(nextDraft);
  }, []);

  const pendingLocalChanges = useCallback(() => mergeSparseChecklistChanges(
    pendingMutationRef.current?.changes || {},
    queuedChangesRef.current,
  ), []);

  const enterConflict = useCallback(() => {
    clearTimeout(noteDebounceRef.current);
    persistRecovery();
    setCurrentSaveState(checklistSaveStates.CONFLICT);
  }, [persistRecovery, setCurrentSaveState]);

  const flush = useCallback(async () => {
    const pending = pendingMutationRef.current;
    if (!pending || isSavingRef.current || isSubmittingReviewRef.current
      || saveStateRef.current === checklistSaveStates.READY_FOR_REVIEW) return;
    if (!isOnline()) {
      setCurrentSaveState(checklistSaveStates.OFFLINE_PENDING);
      persistRecovery();
      return;
    }

    isSavingRef.current = true;
    setCurrentSaveState(checklistSaveStates.SAVING);
    try {
      const result = await savePublicChecklistDraft({ token, ...pending });
      if (!validDraft(result?.draft)) throw new Error("Checklist save response was invalid.");
      if (pendingMutationRef.current !== pending) return;

      pendingMutationRef.current = null;
      const queued = queuedChangesRef.current;
      queuedChangesRef.current = {};
      if (hasChanges(queued)) {
        // A duplicate receipt can legitimately return a newer authoritative draft.
        // Never replay sparse edits from an older base revision without the cleaner's choice.
        if (result.draft.revision !== result.revision) {
          queuedChangesRef.current = queued;
          setVisibleDraft(result.draft);
          enterConflict();
          return;
        }
        const nextMutation = {
          mutationId: createMutationId(),
          baseRevision: result.draft.revision,
          changes: queued,
        };
        pendingMutationRef.current = nextMutation;
        setVisibleDraft(mergeChecklistChanges(result.draft, queued));
        persistRecovery();
        setCurrentSaveState(checklistSaveStates.SAVING);
        queueMicrotask(() => flushRef.current?.());
      } else {
        setVisibleDraft(result.draft);
        persistRecovery();
        setCurrentSaveState(checklistSaveStates.SAVED);
      }
    } catch (error) {
      if (isRevisionConflict(error)) {
        enterConflict();
      } else if (isUnavailable(error)) {
        setCurrentSaveState(checklistSaveStates.UNAVAILABLE);
      } else {
        setCurrentSaveState(isOnline() ? checklistSaveStates.RETRY : checklistSaveStates.OFFLINE_PENDING);
      }
      persistRecovery();
    } finally {
      isSavingRef.current = false;
    }
  }, [enterConflict, persistRecovery, setCurrentSaveState, setVisibleDraft, token]);

  flushRef.current = flush;

  const load = useCallback(async ({ discardRecovery = false } = {}) => {
    if (isMountedRef.current) {
      setIsLoading(true);
      setLoadError(null);
      setCurrentSaveState(checklistSaveStates.LOADING);
    }
    try {
      const [scope, result] = await Promise.all([checklistDraftRecoveryScopeBounded(token), getPublicChecklist(token)]);
      if (!isMountedRef.current) return;
      scopeRef.current = scope;
      setHasRecoveryWarning(!scope);
      setLoadDiagnostics(result?.diagnostics || null);
      if (!result?.checklist || !validDraft(result?.draft)) throw new Error("Checklist response was invalid.");
      if (discardRecovery && scope) clearChecklistDraftRecovery(scope);

      if (checklistIsReadyForReview(result.checklist)) {
        clearTimeout(noteDebounceRef.current);
        pendingMutationRef.current = null;
        queuedChangesRef.current = {};
        if (scope) clearChecklistDraftRecovery(scope);
        setChecklist(result.checklist);
        setVisibleDraft(result.draft);
        setHasRecoveryWarning(false);
        setIsLoading(false);
        setCurrentSaveState(checklistSaveStates.READY_FOR_REVIEW);
        return;
      }

      const recovery = discardRecovery || !scope ? null : loadChecklistDraftRecovery(scope);
      setChecklist(result.checklist);
      pendingMutationRef.current = recovery?.pendingMutation || null;
      queuedChangesRef.current = recovery?.queuedChanges || {};
      const pending = pendingMutationRef.current;
      const compatiblePending = pending && pending.baseRevision === result.draft.revision;
      const optimisticDraft = compatiblePending
        ? mergeChecklistChanges(mergeChecklistChanges(result.draft, pending.changes), queuedChangesRef.current)
        : result.draft;
      setVisibleDraft(optimisticDraft);
      setIsLoading(false);

      if (pending || hasChanges(queuedChangesRef.current)) {
        if (pending && !compatiblePending) {
          // Recovery from a different server revision is preserved but never replayed automatically.
          persistRecovery();
          setCurrentSaveState(checklistSaveStates.CONFLICT);
          return;
        }
        if (!pending && hasChanges(queuedChangesRef.current)) {
          pendingMutationRef.current = {
            mutationId: createMutationId(),
            baseRevision: result.draft.revision,
            changes: queuedChangesRef.current,
          };
          queuedChangesRef.current = {};
          setVisibleDraft(mergeChecklistChanges(result.draft, pendingMutationRef.current.changes));
        }
        persistRecovery();
        setCurrentSaveState(checklistSaveStates.OFFLINE_PENDING);
        if (isOnline()) queueMicrotask(() => flushRef.current?.());
      } else {
        setCurrentSaveState(checklistSaveStates.SAVED);
      }
    } catch (error) {
      if (!isMountedRef.current) return;
      setIsLoading(false);
      const terminalUnavailable = isUnavailable(error);
      setLoadError(terminalUnavailable ? error?.code || "checklist_unavailable" : "checklist_request_failed");
      setLoadDiagnostics(error?.diagnostics || {
        capabilityResolutionMs: null,
        capabilityResult: "error",
        draftLoadMs: null,
        draftResult: "unknown",
        errorStage: error?.stage || "request",
        errorCode: error?.code || "unknown",
      });
      setCurrentSaveState(terminalUnavailable ? checklistSaveStates.UNAVAILABLE : checklistSaveStates.RETRY);
    }
  }, [persistRecovery, setCurrentSaveState, setVisibleDraft, token]);

  useEffect(() => {
    isMountedRef.current = true;
    load();
    const retryOnOnline = () => {
      if (![checklistSaveStates.CONFLICT, checklistSaveStates.READY_FOR_REVIEW].includes(saveStateRef.current)) {
        flushRef.current?.();
      }
    };
    window.addEventListener("online", retryOnOnline);
    return () => {
      isMountedRef.current = false;
      window.removeEventListener("online", retryOnOnline);
      clearTimeout(noteDebounceRef.current);
    };
  }, [load]);

  const queueChanges = useCallback((changes, { debounce = false } = {}) => {
    if (!hasChanges(changes)
      || saveStateRef.current === checklistSaveStates.UNAVAILABLE
      || saveStateRef.current === checklistSaveStates.CONFLICT
      || saveStateRef.current === checklistSaveStates.READY_FOR_REVIEW
      || isSubmittingReviewRef.current) return;
    setReviewError(null);
    setReviewRequirements(null);
    setVisibleDraft(mergeChecklistChanges(draftRef.current, changes));
    if (pendingMutationRef.current) {
      queuedChangesRef.current = mergeSparseChecklistChanges(queuedChangesRef.current, changes);
    } else {
      pendingMutationRef.current = {
        mutationId: createMutationId(),
        baseRevision: draftRef.current?.revision || 0,
        changes,
      };
    }
    persistRecovery();
    setCurrentSaveState(checklistSaveStates.SAVING);
    clearTimeout(noteDebounceRef.current);
    if (debounce) {
      noteDebounceRef.current = setTimeout(() => flushRef.current?.(), 650);
    } else {
      flushRef.current?.();
    }
  }, [persistRecovery, setCurrentSaveState, setReviewError, setReviewRequirements, setVisibleDraft]);

  const retrySave = useCallback(() => {
    if ([checklistSaveStates.CONFLICT, checklistSaveStates.UNAVAILABLE, checklistSaveStates.READY_FOR_REVIEW].includes(saveStateRef.current)) return;
    clearTimeout(noteDebounceRef.current);
    flushRef.current?.();
  }, []);

  const discardLocalChanges = useCallback(() => {
    pendingMutationRef.current = null;
    queuedChangesRef.current = {};
    if (scopeRef.current) clearChecklistDraftRecovery(scopeRef.current);
    load({ discardRecovery: true });
  }, [load]);

  const reapplyLocalChanges = useCallback(async () => {
    if (saveStateRef.current !== checklistSaveStates.CONFLICT || isResolvingConflict) return;
    const changes = pendingLocalChanges();
    setIsResolvingConflict(true);
    try {
      const result = await getPublicChecklist(token);
      if (!result?.checklist || !validDraft(result?.draft)) throw new Error("Checklist response was invalid.");
      setChecklist(result.checklist);
      if (!hasChanges(changes)) {
        pendingMutationRef.current = null;
        queuedChangesRef.current = {};
        setVisibleDraft(result.draft);
        persistRecovery();
        setCurrentSaveState(checklistSaveStates.SAVED);
        return;
      }
      pendingMutationRef.current = {
        mutationId: createMutationId(),
        baseRevision: result.draft.revision,
        changes,
      };
      queuedChangesRef.current = {};
      setVisibleDraft(mergeChecklistChanges(result.draft, changes));
      persistRecovery();
      setCurrentSaveState(checklistSaveStates.SAVING);
      await flushRef.current?.();
    } catch (error) {
      if (isUnavailable(error)) setCurrentSaveState(checklistSaveStates.UNAVAILABLE);
      else setCurrentSaveState(checklistSaveStates.CONFLICT);
      persistRecovery();
    } finally {
      if (isMountedRef.current) setIsResolvingConflict(false);
    }
  }, [isResolvingConflict, pendingLocalChanges, persistRecovery, setCurrentSaveState, setVisibleDraft, token]);

  const submitForManagerReview = useCallback(async () => {
    if (isSubmittingReviewRef.current || saveStateRef.current !== checklistSaveStates.SAVED
      || pendingMutationRef.current || hasChanges(queuedChangesRef.current) || !validDraft(draftRef.current)) return;
    clearTimeout(noteDebounceRef.current);
    isSubmittingReviewRef.current = true;
    if (isMountedRef.current) {
      setIsSubmittingReview(true);
      setReviewError(null);
      setReviewRequirements(null);
    }
    const submission = reviewSubmissionRef.current || {
      submissionId: createMutationId(),
      baseRevision: draftRef.current.revision,
    };
    reviewSubmissionRef.current = submission;
    try {
      const result = await readyPublicChecklistForReview({ token, ...submission });
      if (!result?.checklist || !validDraft(result?.draft) || !checklistIsReadyForReview(result.checklist)) {
        throw new Error("Checklist review response was invalid.");
      }
      pendingMutationRef.current = null;
      queuedChangesRef.current = {};
      reviewSubmissionRef.current = null;
      if (scopeRef.current) clearChecklistDraftRecovery(scopeRef.current);
      setChecklist((current) => ({
        ...result.checklist,
        // The successful handoff response may omit this already-safe server
        // projection field; retain it for the confirmation view.
        assignedCleanerName: result.checklist.assignedCleanerName ?? current?.assignedCleanerName ?? null,
      }));
      setVisibleDraft(result.draft);
      setHasRecoveryWarning(false);
      setCurrentSaveState(checklistSaveStates.READY_FOR_REVIEW);
    } catch (error) {
      if (isUnavailable(error)) {
        setCurrentSaveState(checklistSaveStates.UNAVAILABLE);
      } else if (error?.status === 422 && error?.code === "checklist_requirements_missing") {
        // The server confirms no transition was committed. A later edit uses
        // a new submission ID/base revision; answers and the active link stay usable.
        reviewSubmissionRef.current = null;
        if (isMountedRef.current) {
          setReviewError(error.code);
          setReviewRequirements(error.requirements || null);
        }
      } else if (isRevisionConflict(error)) {
        // The authoritative draft changed before handoff. Refresh rather than
        // guessing how to reconcile a terminal review transition.
        reviewSubmissionRef.current = null;
        if (isMountedRef.current) setReviewError("checklist_conflict");
        await load();
      } else if (isMountedRef.current) {
        // Keep the same submission ID for a deliberate retry after an uncertain response.
        setReviewError("checklist_review_failed");
      }
    } finally {
      isSubmittingReviewRef.current = false;
      if (isMountedRef.current) setIsSubmittingReview(false);
    }
  }, [load, setCurrentSaveState, setVisibleDraft, token]);

  return {
    checklist,
    draft,
    loadDiagnostics,
    isLoading,
    loadError,
    saveState,
    hasRecoveryWarning,
    isResolvingConflict,
    isSubmittingReview,
    reviewError,
    reviewRequirements,
    queueChanges,
    retrySave,
    saveNow: retrySave,
    discardLocalChanges,
    reapplyLocalChanges,
    submitForManagerReview,
    retryLoad: load,
  };
}
