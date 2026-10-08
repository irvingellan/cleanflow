import { formatCreatedAt, formatDate } from "../../lib/presentation.js";
import { getAssignedCleanerIds, isAssignmentAwareJob } from "./jobCompatibility.js";

// Presentation only. Explicit completed-read flags are required for absence
// claims: callers without that evidence receive the neutral fallback.
export function jobDisclosureSummaries(props, translate, language) {
  const { job } = props;
  const unknown = translate("common.notProvided");
  const text = (key, count) => translate(`jobV2.summary.${key}`).replace("{count}", String(count));
  const state = (loading, error) => loading === true ? text("loading") : error === true ? unknown : null;
  const loaded = (loading, error) => loading === false && error === false;
  const listSummary = (items, loading, error, validStatuses, render) => {
    const unavailable = state(loading, error);
    if (unavailable) return unavailable;
    if (!loaded(loading, error) || !Array.isArray(items) || items.some(item => !validStatuses.includes(item?.status))) return unknown;
    return render(items);
  };
  const aware = isAssignmentAwareJob(job);
  const ids = aware ? getAssignedCleanerIds(job) : [job.assignedCleanerId].filter(Boolean);
  const names = Object.fromEntries((props.knownCleaners || []).map(cleaner => [cleaner.id, cleaner.name]));
  const cleanerNames = ids.map(id => names[id] || (aware
    ? props.assignments?.find(assignment => assignment.isActive === true && assignment.cleanerId === id)?.cleanerName
    : job.assignedCleanerName));
  const rosterKnown = aware ? Array.isArray(job.assignedCleanerIds) && job.assignedCleanerIds.every(id => typeof id === "string" && id.trim())
    : Boolean(job.assignedCleanerId) || ["UNASSIGNED", "OFFERED"].includes(job.operationalStatus);
  const cleaner = state(props.isLoadingAssignments, props.hasAssignmentsError) || (rosterKnown
    ? ids.length ? cleanerNames.every(name => typeof name === "string" && name.trim()) ? cleanerNames.join(", ") : text("assigned", ids.length)
      : text("noCleaner") : unknown);
  const runKeys = { DRAFT: "draft", READY_FOR_REVIEW: "ready", ABANDONED: "abandoned" };
  const checklist = state(props.isLoadingChecklistRun, props.hasChecklistRunError)
    || (loaded(props.isLoadingChecklistRun, props.hasChecklistRunError)
      ? props.checklistRun === null ? text("noChecklist") : Object.hasOwn(runKeys, props.checklistRun?.status) ? text(runKeys[props.checklistRun.status]) : unknown
      : unknown);
  const offers = listSummary(props.offers, props.isLoadingOffers, props.hasOffersError,
    ["PENDING", "INTERESTED", "DECLINED"], items => {
      if (!items.length) return text("noOffers");
      const pending = items.filter(item => item.status === "PENDING").length;
      const interested = items.filter(item => item.status === "INTERESTED").length;
      return [pending ? text("pending", pending) : null, interested ? text("interested", interested) : null].filter(Boolean).join(" · ") || text("offersRecorded", items.length);
    });
  const issues = listSummary(props.issues, props.isLoadingIssues, props.hasIssuesError,
    ["OPEN", "RESOLVED"], items => {
      const open = items.filter(item => item.status === "OPEN").length;
      return open ? text("openIssues", open) : text("noIssues");
    });
  let created = null;
  try { created = formatCreatedAt(job.createdAt, language); } catch { /* Invalid timestamp is not evidence. */ }
  const dateValid = typeof job.scheduledDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(job.scheduledDate)
    && !Number.isNaN(new Date(`${job.scheduledDate}T00:00:00Z`).getTime())
    && new Date(`${job.scheduledDate}T00:00:00Z`).toISOString().slice(0, 10) === job.scheduledDate;
  const timeValid = typeof job.scheduledStart === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(job.scheduledStart);
  return {
    details: dateValid ? [formatDate(job.scheduledDate, translate, language), timeValid ? job.scheduledStart : null].filter(Boolean).join(" · ") : unknown,
    cleaner, checklist, offers, issues,
    financial: text("financial"),
    history: job.archivedAt ? text("archived") : created ? text("created").replace("{date}", created) : unknown,
  };
}
