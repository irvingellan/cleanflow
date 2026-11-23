import { useEffect, useState } from "react";
import { canAssignCleanerDirectly } from "./assignmentService.js";

/**
 * State of the assignment roster in Job Detail's Cleaner section: direct assignment, removal and replacement.
 * The direct assignment form resets when another Job is shown. Errors go to the shared assignment error.
 */
export function useJobRosterEdit({
  job, translate, availableCleaners, onAssignCleanerDirectly, onRemoveAssignment, onReplaceAssignment,
  setAssignmentError, currentJobIdRef,
}) {
  const [isDirectAssignmentOpen, setIsDirectAssignmentOpen] = useState(false);
  const [directCleanerSearch, setDirectCleanerSearch] = useState("");
  const [directCleanerId, setDirectCleanerId] = useState("");
  const [isAssigningDirectly, setIsAssigningDirectly] = useState(false);
  const [removingAssignmentId, setRemovingAssignmentId] = useState(null);
  const [replacementTargetId, setReplacementTargetId] = useState(null);
  const [replacingAssignmentId, setReplacingAssignmentId] = useState(null);
  const [replacementOfferId, setReplacementOfferId] = useState("");

  useEffect(() => {
    setIsDirectAssignmentOpen(false);
    setIsAssigningDirectly(false);
    setDirectCleanerSearch("");
    setDirectCleanerId("");
  }, [job.id]);

  async function assignCleanerDirectly(event) {
    event.preventDefault();
    const cleaner = availableCleaners.find((candidate) => candidate.id === directCleanerId);
    if (!canAssignCleanerDirectly(job, cleaner) || isAssigningDirectly) return;
    setIsAssigningDirectly(true);
    setAssignmentError(null);
    const jobId = job.id;
    try {
      await onAssignCleanerDirectly(cleaner.id);
      if (currentJobIdRef.current === jobId) {
        setIsDirectAssignmentOpen(false);
        setDirectCleanerId("");
        setDirectCleanerSearch("");
      }
    } catch {
      if (currentJobIdRef.current === jobId) setAssignmentError(translate("jobs.directAssignmentError"));
    } finally {
      if (currentJobIdRef.current === jobId) setIsAssigningDirectly(false);
    }
  }

  async function removeCleanerAssignment(assignmentId) {
    setRemovingAssignmentId(assignmentId);
    setAssignmentError(null);

    try {
      await onRemoveAssignment(assignmentId);
    } catch (error) {
      const reason = error?.details?.reason ?? error?.code;
      setAssignmentError(translate(reason === "assignment-has-approved-work" ? "jobs.removeApprovalBeforeRosterEdit" : "jobs.rosterUpdateError"));
    } finally {
      setRemovingAssignmentId(null);
    }
  }

  async function replaceCleanerAssignment(assignmentId) {
    if (!replacementOfferId) {
      return;
    }

    setReplacingAssignmentId(assignmentId);
    setAssignmentError(null);

    try {
      await onReplaceAssignment(assignmentId, replacementOfferId);
      setReplacementOfferId("");
      setReplacementTargetId(null);
    } catch (error) {
      const reason = error?.details?.reason ?? error?.code;
      setAssignmentError(translate(reason === "assignment-has-approved-work" ? "jobs.removeApprovalBeforeRosterEdit" : "jobs.rosterUpdateError"));
    } finally {
      setReplacingAssignmentId(null);
    }
  }

  return {
    isDirectAssignmentOpen, setIsDirectAssignmentOpen, directCleanerSearch, setDirectCleanerSearch, directCleanerId,
    setDirectCleanerId, isAssigningDirectly, removingAssignmentId, replacementTargetId, setReplacementTargetId,
    replacingAssignmentId, replacementOfferId, setReplacementOfferId, assignCleanerDirectly, removeCleanerAssignment,
    replaceCleanerAssignment,
  };
}
