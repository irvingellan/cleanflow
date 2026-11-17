import { JobDetailSection } from "./JobDetailSection.jsx";
import { DataProvenanceReview } from "../../components/DataProvenanceReview.jsx";
import { RecordArchiveControl } from "../../components/RecordArchiveControl.jsx";
import { DetailItem } from "../../components/UiPrimitives.jsx";
import { formatDate, formatOperationalStatus } from "../../lib/presentation.js";

/** The "History & administration" section of Job Detail: the record summary, data provenance and archive controls. */
export function JobHistorySection({
  job,
  translate,
  language,
  historySectionRef,
  isAssignmentAware,
  isAssigned,
  assignedCleanerName,
  assignedAt,
  startedAt,
  completedAt,
  createdAt,
  onSaveDataProvenance,
  canRestore,
  onArchive,
  onRestore,
}) {
  return (
    <JobDetailSection jobId={job.id} title={translate("jobs.section.history")}>
    <dl ref={historySectionRef} tabIndex={-1} className="detail-list job-detail__history-summary">
      <DetailItem
        label={translate("common.property")}
        value={job.propertyName || translate("properties.unnamed")}
      />
      <DetailItem
        label={translate("common.client")}
        value={job.clientName || translate("common.notProvided")}
      />
      {job.guestName && (
        <DetailItem label={translate("jobs.guestName")} value={job.guestName} />
      )}
      <DetailItem
        label={translate("jobs.scheduledDate")}
        value={formatDate(job.scheduledDate, translate, language)}
      />
      {job.scheduledStart && (
        <DetailItem label={translate("jobs.scheduledTime")} value={job.scheduledStart} />
      )}
      <DetailItem
        label={translate("jobs.operationalStatus")}
        value={formatOperationalStatus(job.operationalStatus, translate)}
      />
      {!isAssignmentAware && isAssigned && (
        <DetailItem
          label={translate("jobs.assignedCleaner")}
          value={assignedCleanerName}
        />
      )}
      {!isAssignmentAware && isAssigned && (
        <DetailItem
          label={translate("jobs.assignedTime")}
          value={assignedAt || translate("common.notProvided")}
        />
      )}
      {["IN_PROGRESS", "COMPLETED"].includes(job.operationalStatus) && (
        <DetailItem
          label={translate("jobs.startedTime")}
          value={startedAt || translate("common.notProvided")}
        />
      )}
      {job.operationalStatus === "COMPLETED" && (
        <DetailItem
          label={translate("jobs.completedTime")}
          value={completedAt || translate("common.notProvided")}
        />
      )}
      {createdAt && (
        <DetailItem label={translate("jobs.createdTime")} value={createdAt} />
      )}
    </dl>

    <DataProvenanceReview record={job} onSave={onSaveDataProvenance} />

    <RecordArchiveControl record={job} canRestore={canRestore} onArchive={onArchive} onRestore={onRestore} />
    </JobDetailSection>
  );
}
