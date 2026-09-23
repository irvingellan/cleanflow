import { useEffect, useState } from "react";
import { OperationalIcon } from "../../components/OperationalIcon.jsx";
import { DataProvenanceReview } from "../../components/DataProvenanceReview.jsx";
import { RecordArchiveControl } from "../../components/RecordArchiveControl.jsx";
import { ScrollToTopButton } from "../../components/ScrollToTopButton.jsx";
import {
  BackButton,
  DetailItem,
  StateCard,
} from "../../components/UiPrimitives.jsx";
import { currentCleanerName } from "../cleaners/cleanerIdentity.js";
import { getCleanerNamesById } from "../cleaners/cleanerService.js";
import { formatIssueCategory } from "../issues/issuePresentation.js";
import {
  formatCreatedAt,
  formatDate,
  formatOperationalStatus,
  formatPrice,
  hasValue,
} from "../../lib/presentation.js";
import { useTranslation } from "../../i18n/translations.js";
import { ChecklistCapabilityControls } from "../checklists/ChecklistCapabilityControls.jsx";
import {
  canManageAssignmentAwareOffers,
  getJobGrossMargin,
  getAssignedCleanerIds,
  isAssignmentAwareJob,
  optionalJobPrice,
} from "./jobCompatibility.js";
import {
  buildCleanerReminderMessage,
  copyCleanerReminderMessage,
} from "./cleanerReminderMessage.js";

export function JobDetail({
  job,
  knownCleaners,
  offers,
  isLoadingOffers,
  hasOffersError,
  assignments,
  isLoadingAssignments,
  hasAssignmentsError,
  issues,
  isLoadingIssues,
  hasIssuesError,
  checklistRun,
  isLoadingChecklistRun,
  hasChecklistRunError,
  isCreatingChecklistRun,
  hasCreateChecklistRunError,
  checklistCapability,
  isLoadingChecklistCapability,
  hasChecklistCapabilityError,
  isIssuingChecklistCapability,
  hasIssueChecklistCapabilityError,
  isRevokingChecklistCapability,
  hasRevokeChecklistCapabilityError,
  onBack,
  onOfferToCleaners,
  onRefreshOffers,
  onRefreshIssues,
  onRefreshChecklistRun,
  onCreateChecklistRun,
  onOpenChecklistRun,
  onRefreshChecklistCapability,
  onIssueChecklistCapability,
  onRevokeChecklistCapability,
  onCreatePublicOfferLink,
  onAssignCleaner,
  onRemoveAssignment,
  onReplaceAssignment,
  onStartCleaning,
  onCompleteCleaning,
  onUpdatePrices,
  onSimulateAssignedCleaner,
  onResolveIssue,
  onSaveDataProvenance,
  onArchive,
  onRestore,
  canRestore,
}) {
  const { language, translate } = useTranslation();
  const [resolvedCleanerNames, setResolvedCleanerNames] = useState({});
  const [assigningCleanerId, setAssigningCleanerId] = useState(null);
  const [assignmentError, setAssignmentError] = useState(null);
  const [removingAssignmentId, setRemovingAssignmentId] = useState(null);
  const [replacementTargetId, setReplacementTargetId] = useState(null);
  const [replacingAssignmentId, setReplacingAssignmentId] = useState(null);
  const [replacementOfferId, setReplacementOfferId] = useState("");
  const [resolvingIssueId, setResolvingIssueId] = useState(null);
  const [resolutionNote, setResolutionNote] = useState("");
  const [isResolvingIssue, setIsResolvingIssue] = useState(false);
  const [resolutionError, setResolutionError] = useState(null);
  const [publicOfferLink, setPublicOfferLink] = useState(null);
  const [isCreatingPublicOfferLinkFor, setIsCreatingPublicOfferLinkFor] =
    useState(null);
  const [publicOfferLinkError, setPublicOfferLinkError] = useState(null);
  const [isStartingCleaning, setIsStartingCleaning] = useState(false);
  const [hasStartCleaningError, setHasStartCleaningError] = useState(false);
  const [isCompletingCleaning, setIsCompletingCleaning] = useState(false);
  const [hasCompleteCleaningError, setHasCompleteCleaningError] = useState(false);
  const [isEditingPrices, setIsEditingPrices] = useState(false);
  const [priceValues, setPriceValues] = useState(() => ({
    clientPrice: hasValue(job.clientPrice) ? String(job.clientPrice) : "",
    cleanerPayout: hasValue(job.cleanerPayout) ? String(job.cleanerPayout) : "",
  }));
  const [isSavingPrices, setIsSavingPrices] = useState(false);
  const [priceSaveError, setPriceSaveError] = useState("");
  const [hasSavedPrices, setHasSavedPrices] = useState(false);
  const [copiedCleanerId, setCopiedCleanerId] = useState(null);
  const [copyMessageErrorCleanerId, setCopyMessageErrorCleanerId] = useState(null);
  const createdAt = formatCreatedAt(job.createdAt, language);
  const assignedAt = formatCreatedAt(job.assignedAt, language);
  const startedAt = formatCreatedAt(job.startedAt, language);
  const completedAt = formatCreatedAt(job.completedAt, language);
  const isAssignmentAware = isAssignmentAwareJob(job);
  const assignedCleanerIds = getAssignedCleanerIds(job);
  const activeAssignments = (assignments || []).filter(
    (assignment) => assignment.isActive === true,
  );
  const isAssigned = Boolean(
    job.assignedCleanerId ||
      ["ASSIGNED", "IN_PROGRESS", "COMPLETED"].includes(
        job.operationalStatus,
      ),
  );
  const canSimulateAssignedCleaner = !isAssignmentAware && [
    "ASSIGNED",
    "IN_PROGRESS",
    "COMPLETED",
  ].includes(job.operationalStatus);
  const isInProgress = job.operationalStatus === "IN_PROGRESS";
  const isCompleted = job.operationalStatus === "COMPLETED";
  const grossMargin = getJobGrossMargin(job);
  const canEditRoster =
    isAssignmentAware &&
    ["OFFERED", "ASSIGNED"].includes(job.operationalStatus);
  const canManageOffers = isAssignmentAware
    ? canManageAssignmentAwareOffers(job)
    : !isCompleted;
  // An assignment-aware Job can still need additional cleaners before work starts.
  const canOfferToCleaners = canManageOffers;
  const knownCleanerNames = Object.fromEntries(
    knownCleaners.map((cleaner) => [cleaner.id, cleaner.name]),
  );
  const cleanerNamesById = { ...resolvedCleanerNames, ...knownCleanerNames };
  const unresolvedCleanerIds = [
    job.assignedCleanerId,
    ...activeAssignments.map((assignment) => assignment.cleanerId),
    ...offers.map((offer) => offer.cleanerId),
  ]
    .filter(Boolean)
    .filter(
      (cleanerId, index, cleanerIds) =>
        cleanerIds.indexOf(cleanerId) === index &&
        !knownCleanerNames[cleanerId],
    )
    .sort();
  const cleanerLookupKey = unresolvedCleanerIds.join(",");
  const assignedCleanerName = currentCleanerName(
    job.assignedCleanerId,
    job.assignedCleanerName,
    cleanerNamesById,
    translate("common.notProvided"),
  );
  const sortedOffers = [...offers].sort((firstOffer, secondOffer) =>
    (firstOffer.cleanerName || "").localeCompare(secondOffer.cleanerName || ""),
  );
  const sortedIssues = [...issues].sort((firstIssue, secondIssue) => {
    const firstCreatedAt = firstIssue.createdAt?.toMillis?.() || 0;
    const secondCreatedAt = secondIssue.createdAt?.toMillis?.() || 0;

    return secondCreatedAt - firstCreatedAt;
  });
  const eligibleReplacementOffers = sortedOffers.filter(
    (offer) =>
      offer.status === "INTERESTED" &&
      offer.cleanerId &&
      !assignedCleanerIds.includes(offer.cleanerId),
  );

  useEffect(() => {
    let isCurrent = true;

    if (!cleanerLookupKey) {
      setResolvedCleanerNames({});
      return () => {
        isCurrent = false;
      };
    }

    async function loadCleanerNames() {
      try {
        // Keep immutable job/offer snapshots as fallbacks while showing current Cleaner names.
        const cleanerNames = await getCleanerNamesById(unresolvedCleanerIds);

        if (isCurrent) {
          setResolvedCleanerNames(cleanerNames);
        }
      } catch {
        if (isCurrent) {
          setResolvedCleanerNames({});
        }
      }
    }

    loadCleanerNames();

    return () => {
      isCurrent = false;
    };
  }, [cleanerLookupKey]);

  useEffect(() => {
    setPriceValues({
      clientPrice: hasValue(job.clientPrice) ? String(job.clientPrice) : "",
      cleanerPayout: hasValue(job.cleanerPayout) ? String(job.cleanerPayout) : "",
    });
    setIsEditingPrices(false);
    setIsSavingPrices(false);
    setPriceSaveError("");
    setHasSavedPrices(false);
  }, [job.id]);

  function startPriceEdit() {
    setPriceValues({
      clientPrice: hasValue(job.clientPrice) ? String(job.clientPrice) : "",
      cleanerPayout: hasValue(job.cleanerPayout) ? String(job.cleanerPayout) : "",
    });
    setPriceSaveError("");
    setHasSavedPrices(false);
    setIsEditingPrices(true);
  }

  async function savePrices(event) {
    event.preventDefault();
    const clientPrice = optionalJobPrice(priceValues.clientPrice);
    const cleanerPayout = optionalJobPrice(priceValues.cleanerPayout);

    if (clientPrice === null || cleanerPayout === null) {
      setPriceSaveError(translate("jobs.priceInvalid"));
      return;
    }

    setIsSavingPrices(true);
    setPriceSaveError("");
    setHasSavedPrices(false);

    try {
      await onUpdatePrices({ clientPrice, cleanerPayout });
      setIsEditingPrices(false);
      setHasSavedPrices(true);
    } catch {
      setPriceSaveError(translate("jobs.priceUpdateError"));
    } finally {
      setIsSavingPrices(false);
    }
  }

  async function assignCleaner(offer) {
    setAssigningCleanerId(offer.cleanerId);
    setAssignmentError(null);

    try {
      await onAssignCleaner(offer);
    } catch (error) {
      setAssignmentError(
        error.code === "job-already-assigned"
          ? translate("offers.alreadyAssigned")
          : translate("offers.assignmentError"),
      );
    } finally {
      setAssigningCleanerId(null);
    }
  }

  async function removeCleanerAssignment(assignmentId) {
    setRemovingAssignmentId(assignmentId);
    setAssignmentError(null);

    try {
      await onRemoveAssignment(assignmentId);
    } catch {
      setAssignmentError(translate("jobs.rosterUpdateError"));
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
    } catch {
      setAssignmentError(translate("jobs.rosterUpdateError"));
    } finally {
      setReplacingAssignmentId(null);
    }
  }

  async function createOfferLink(offer) {
    setIsCreatingPublicOfferLinkFor(offer.id);
    setPublicOfferLinkError(null);

    try {
      const link = await onCreatePublicOfferLink(offer);
      setPublicOfferLink({ offerId: offer.id, ...link });
    } catch {
      setPublicOfferLinkError(offer.id);
    } finally {
      setIsCreatingPublicOfferLinkFor(null);
    }
  }

  async function startCleaning() {
    setIsStartingCleaning(true);
    setHasStartCleaningError(false);

    try {
      await onStartCleaning();
    } catch {
      setHasStartCleaningError(true);
    } finally {
      setIsStartingCleaning(false);
    }
  }

  async function completeCleaning() {
    setIsCompletingCleaning(true);
    setHasCompleteCleaningError(false);

    try {
      await onCompleteCleaning();
    } catch {
      setHasCompleteCleaningError(true);
    } finally {
      setIsCompletingCleaning(false);
    }
  }

  async function copyMessageForCleaner(cleanerId, cleanerName) {
    setCopyMessageErrorCleanerId(null);

    try {
      await copyCleanerReminderMessage(
        buildCleanerReminderMessage({
          cleanerName,
          propertyName: job.propertyName || translate("properties.unnamed"),
          scheduledDate: job.scheduledDate,
          scheduledStart: job.scheduledStart,
          language,
          translate,
        }),
      );
      setCopiedCleanerId(cleanerId);
    } catch {
      setCopyMessageErrorCleanerId(cleanerId);
    }
  }

  function openResolutionForm(issue) {
    setResolvingIssueId(issue.id);
    setResolutionNote("");
    setResolutionError(null);
  }

  function closeResolutionForm() {
    setResolvingIssueId(null);
    setResolutionNote("");
    setResolutionError(null);
  }

  async function resolveSelectedIssue(event) {
    event.preventDefault();

    if (!resolvingIssueId) {
      return;
    }

    setIsResolvingIssue(true);
    setResolutionError(null);

    try {
      await onResolveIssue({
        issueId: resolvingIssueId,
        resolutionNote,
      });
      closeResolutionForm();
    } catch (error) {
      setResolutionError(
        error.code === "issue-not-open"
          ? translate("issues.alreadyResolved")
          : translate("issues.resolveError"),
      );
    } finally {
      setIsResolvingIssue(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="job-detail-title">
      <BackButton onClick={onBack} />

      <p className="eyebrow">{translate("jobs.details")}</p>
      <h2 id="job-detail-title" className="panel__title">
        {job.propertyName || translate("properties.unnamed")}
      </h2>
      <DataProvenanceReview record={job} onSave={onSaveDataProvenance} />
      <RecordArchiveControl record={job} canRestore={canRestore} onArchive={onArchive} onRestore={onRestore} />

      <dl className="detail-list">
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
        <DetailItem
          label={translate("jobs.clientPrice")}
          value={hasValue(job.clientPrice)
            ? formatPrice(job.clientPrice, translate, language)
            : translate("jobs.notSet")}
        />
        <DetailItem
          label={translate("jobs.cleanerPayout")}
          value={hasValue(job.cleanerPayout)
            ? formatPrice(job.cleanerPayout, translate, language)
            : translate("jobs.notSet")}
        />
        <DetailItem
          label={translate("jobs.grossMargin")}
          value={grossMargin === null
            ? translate("jobs.notSet")
            : formatPrice(grossMargin, translate, language)}
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

      <section className="job-pricing" aria-label={translate("jobs.editPrices")}>
        {!isEditingPrices && (
          <button className="button" type="button" onClick={startPriceEdit}>
            {translate("jobs.editPrices")}
          </button>
        )}
        {hasSavedPrices && !isEditingPrices && (
          <p className="form-success" role="status">{translate("jobs.pricesSaved")}</p>
        )}
        {isEditingPrices && (
          <form className="cleaning-form" noValidate onSubmit={savePrices}>
            <div className="form-row">
              <label>
                {translate("jobs.clientPrice")}
                <input
                  type="number"
                  name="clientPrice"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={priceValues.clientPrice}
                  onChange={(event) => setPriceValues((current) => ({
                    ...current,
                    clientPrice: event.target.value,
                  }))}
                />
              </label>
              <label>
                {translate("jobs.cleanerPayout")}
                <input
                  type="number"
                  name="cleanerPayout"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={priceValues.cleanerPayout}
                  onChange={(event) => setPriceValues((current) => ({
                    ...current,
                    cleanerPayout: event.target.value,
                  }))}
                />
              </label>
            </div>
            {priceSaveError && <p className="form-error" role="alert">{priceSaveError}</p>}
            <div className="button-row">
              <button
                className="button"
                type="button"
                disabled={isSavingPrices}
                onClick={() => {
                  setIsEditingPrices(false);
                  setPriceSaveError("");
                }}
              >
                {translate("common.cancel")}
              </button>
              <button className="button button--primary" type="submit" disabled={isSavingPrices}>
                {isSavingPrices ? translate("jobs.savingPrices") : translate("jobs.savePrices")}
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="job-checklist" aria-labelledby="job-checklist-title">
        <div className="issues-section__header">
          <h3 id="job-checklist-title">{translate("checklists.title")}</h3>
          {!isLoadingChecklistRun && checklistRun && (
            <button className="button button--primary" type="button" onClick={onOpenChecklistRun}>
              {translate("checklists.open")}
            </button>
          )}
          {!isLoadingChecklistRun && !checklistRun && !hasChecklistRunError && (
            <button
              className="button button--primary"
              type="button"
              disabled={isCreatingChecklistRun}
              onClick={onCreateChecklistRun}
            >
              {isCreatingChecklistRun
                ? translate("checklists.creating")
                : translate("checklists.create")}
            </button>
          )}
        </div>
        {isLoadingChecklistRun && (
          <StateCard message={translate("checklists.loading")} status="status" />
        )}
        {!isLoadingChecklistRun && hasChecklistRunError && (
          <>
            <StateCard message={translate("checklists.loadError")} status="alert" isError />
            <button className="button" type="button" onClick={onRefreshChecklistRun}>
              {translate("common.retry")}
            </button>
          </>
        )}
        {!isLoadingChecklistRun && !hasChecklistRunError && !checklistRun && (
          <p className="job-checklist__summary">{translate("checklists.noRun")}</p>
        )}
        {!isLoadingChecklistRun && !hasChecklistRunError && checklistRun && (
          <p className="job-checklist__summary">{translate("checklists.existingRun")}</p>
        )}
        {hasCreateChecklistRunError && (
          <p className="form-error" role="alert">{translate("checklists.createError")}</p>
        )}
        <ChecklistCapabilityControls
          job={job}
          checklistRun={checklistRun}
          capability={checklistCapability}
          isLoading={isLoadingChecklistCapability}
          hasError={hasChecklistCapabilityError}
          isIssuing={isIssuingChecklistCapability}
          hasIssueError={hasIssueChecklistCapabilityError}
          isRevoking={isRevokingChecklistCapability}
          hasRevokeError={hasRevokeChecklistCapabilityError}
          onRefresh={onRefreshChecklistCapability}
          onIssue={onIssueChecklistCapability}
          onRevoke={onRevokeChecklistCapability}
        />
      </section>

      {!isAssignmentAware && (job.operationalStatus === "ASSIGNED" ||
        isInProgress ||
        isCompleted) && (
        <section
          className="job-execution"
          aria-label={translate("jobs.operationalStatus")}
        >
          {isInProgress && (
            <p className="job-execution__state job-execution__state--in-progress">
              <OperationalIcon name="clock" />
              {translate("jobs.executionInProgress")}
            </p>
          )}
          {isCompleted && (
            <p className="job-execution__state job-execution__state--completed">
              <OperationalIcon name="check-circle" />
              {translate("jobs.executionCompleted")}
            </p>
          )}
          {job.operationalStatus === "ASSIGNED" && (
            <div className="button-row job-execution__actions">
              <button
                className="button button--primary"
                type="button"
                disabled={isStartingCleaning}
                onClick={startCleaning}
              >
                {isStartingCleaning
                  ? translate("jobs.startingCleaning")
                  : translate("jobs.startCleaning")}
              </button>
            </div>
          )}
          {isInProgress && (
            <div className="button-row job-execution__actions">
              <button
                className="button button--primary"
                type="button"
                disabled={isCompletingCleaning}
                onClick={completeCleaning}
              >
                {isCompletingCleaning
                  ? translate("jobs.completingCleaning")
                  : translate("jobs.completeCleaning")}
              </button>
            </div>
          )}
          {hasStartCleaningError && (
            <p className="form-error" role="alert">
              {translate("jobs.startCleaningError")}
            </p>
          )}
          {hasCompleteCleaningError && (
            <p className="form-error" role="alert">
              {translate("jobs.completeCleaningError")}
            </p>
          )}
        </section>
      )}

      {!isAssignmentAware &&
        job.operationalStatus === "ASSIGNED" &&
        (job.assignedCleanerId || job.assignedCleanerName) && (
        <section className="job-cleaner-reminder" aria-label={translate("jobs.cleanerReminder")}>
          <button
            className="button"
            type="button"
            onClick={() =>
              copyMessageForCleaner(
                job.assignedCleanerId || "legacy-assigned-cleaner",
                assignedCleanerName,
              )
            }
          >
            {copiedCleanerId === (job.assignedCleanerId || "legacy-assigned-cleaner")
              ? translate("jobs.messageCopied")
              : translate("jobs.copyMessageForCleaner", { cleaner: assignedCleanerName })}
          </button>
          {copyMessageErrorCleanerId === (job.assignedCleanerId || "legacy-assigned-cleaner") && (
            <p className="form-error" role="alert">{translate("jobs.copyMessageError")}</p>
          )}
        </section>
      )}

      {isAssignmentAware && (
        <section className="assignment-roster" aria-labelledby="assigned-cleaners-title">
          <div className="assignment-roster__header">
            <div>
              <h3 id="assigned-cleaners-title">{translate("jobs.assignedCleaners")}</h3>
              <span>
                {assignedCleanerIds.length === 1
                  ? translate("jobs.cleanerAssignedOne", { count: assignedCleanerIds.length })
                  : translate("jobs.cleanersAssignedMany", { count: assignedCleanerIds.length })}
              </span>
            </div>
          </div>

          {isLoadingAssignments && (
            <StateCard message={translate("jobs.rosterLoading")} status="status" />
          )}
          {!isLoadingAssignments && hasAssignmentsError && (
            <StateCard message={translate("jobs.rosterError")} status="alert" isError />
          )}
          {!isLoadingAssignments && !hasAssignmentsError && activeAssignments.length === 0 && (
            <StateCard message={translate("jobs.noAssignedCleaners")} />
          )}
          {!isLoadingAssignments && !hasAssignmentsError && activeAssignments.length > 0 && (
            <div className="assignment-roster__list">
              {activeAssignments.map((assignment) => {
                const assignmentCleanerName = currentCleanerName(
                  assignment.cleanerId,
                  assignment.cleanerNameSnapshot,
                  cleanerNamesById,
                  translate("common.notProvided"),
                );
                const isReplacing = replacementTargetId === assignment.id;

                return (
                  <article key={assignment.id} className="assignment-roster__item">
                    <strong>{assignmentCleanerName}</strong>
                    <span className="status-badge">
                      {formatOperationalStatus(assignment.executionStatus, translate)}
                    </span>
                    {job.operationalStatus === "ASSIGNED" && (
                      <div className="assignment-roster__message-action">
                        <button
                          className="button"
                          type="button"
                          onClick={() =>
                            copyMessageForCleaner(assignment.cleanerId, assignmentCleanerName)
                          }
                        >
                          {copiedCleanerId === assignment.cleanerId
                            ? translate("jobs.messageCopied")
                            : translate("jobs.copyMessageForCleaner", {
                              cleaner: assignmentCleanerName,
                            })}
                        </button>
                        {copyMessageErrorCleanerId === assignment.cleanerId && (
                          <p className="form-error" role="alert">{translate("jobs.copyMessageError")}</p>
                        )}
                      </div>
                    )}
                    {canEditRoster && !isReplacing && (
                      <div className="assignment-roster__actions">
                        <button
                          className="button"
                          type="button"
                          disabled={removingAssignmentId !== null || replacingAssignmentId !== null}
                          onClick={() => removeCleanerAssignment(assignment.id)}
                        >
                          {removingAssignmentId === assignment.id
                            ? translate("jobs.removingCleaner")
                            : translate("jobs.removeCleaner")}
                        </button>
                        <button
                          className="button"
                          type="button"
                          disabled={removingAssignmentId !== null || replacingAssignmentId !== null || eligibleReplacementOffers.length === 0}
                          onClick={() => setReplacementTargetId(assignment.id)}
                        >
                          {translate("jobs.replaceCleaner")}
                        </button>
                      </div>
                    )}
                    {canEditRoster && isReplacing && (
                      <div className="assignment-replacement">
                        <label>
                          {translate("jobs.replacementCleaner")}
                          <select
                            value={replacementOfferId}
                            onChange={(event) => setReplacementOfferId(event.target.value)}
                          >
                            <option value="">{translate("common.notProvided")}</option>
                            {eligibleReplacementOffers.map((offer) => (
                              <option key={offer.id} value={offer.id}>
                                {currentCleanerName(
                                  offer.cleanerId,
                                  offer.cleanerName,
                                  cleanerNamesById,
                                  translate("common.notProvided"),
                                )}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="button-row">
                          <button className="button" type="button" disabled={replacingAssignmentId !== null} onClick={() => {
                            setReplacementTargetId(null);
                            setReplacementOfferId("");
                          }}>
                            {translate("common.cancel")}
                          </button>
                          <button
                            className="button button--primary"
                            type="button"
                            disabled={!replacementOfferId || replacingAssignmentId !== null}
                            onClick={() => replaceCleanerAssignment(assignment.id)}
                          >
                            {replacingAssignmentId === assignment.id
                              ? translate("jobs.replacingCleaner")
                              : translate("jobs.confirmReplacement")}
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
          {assignmentError && <p className="form-error assignment-error" role="alert">{assignmentError}</p>}
        </section>
      )}

      {job.notes && (
        <section className="notes-section" aria-label={translate("common.notes")}>
          <h3>{translate("common.notes")}</h3>
          <p>{job.notes}</p>
        </section>
      )}

      <section className="issues-section" aria-labelledby="issues-title">
        <div className="issues-section__header">
          <h3 id="issues-title">{translate("issues.title")}</h3>
          <button
            className="button"
            type="button"
            onClick={onRefreshIssues}
            disabled={isLoadingIssues}
          >
            {translate("issues.refresh")}
          </button>
        </div>

        {isLoadingIssues && (
          <StateCard message={translate("issues.loading")} status="status" />
        )}

        {!isLoadingIssues && hasIssuesError && (
          <StateCard
            message={translate("issues.error")}
            status="alert"
            isError
          />
        )}

        {!isLoadingIssues && !hasIssuesError && sortedIssues.length === 0 && (
          <StateCard message={translate("issues.empty")} />
        )}

        {!isLoadingIssues && !hasIssuesError && sortedIssues.length > 0 && (
          <div className="issue-list">
            {sortedIssues.map((issue) => {
              const issueCreatedAt = formatCreatedAt(issue.createdAt, language);
              const resolvedAt = formatCreatedAt(issue.resolvedAt, language);
              const isOpen = issue.status === "OPEN";
              const isResolutionFormVisible = resolvingIssueId === issue.id;

              return (
                <article key={issue.id} className="issue-card">
                  <div className="issue-card__header">
                    <strong>
                      {formatIssueCategory(issue.category, translate)}
                    </strong>
                    <span className="status-badge">
                      {issue.status === "RESOLVED"
                        ? translate("status.resolved")
                        : translate("status.open")}
                    </span>
                  </div>
                  <p>{issue.description || translate("common.notProvided")}</p>
                  <span>
                    {translate("issues.reportedBy", {
                      cleaner:
                        issue.cleanerName || translate("common.notProvided"),
                    })}
                  </span>
                  {issueCreatedAt && (
                    <span>
                      {translate("issues.reported")} {issueCreatedAt}
                    </span>
                  )}
                  {resolvedAt && (
                    <span>
                      {translate("issues.resolved")} {resolvedAt}
                    </span>
                  )}
                  {issue.status === "RESOLVED" &&
                    hasValue(issue.resolutionNote) && (
                      <p className="issue-card__resolution-note">
                        {translate("issues.resolution")}: {issue.resolutionNote}
                      </p>
                    )}

                  {isOpen && !isResolutionFormVisible && (
                    <div>
                      <button
                        className="button"
                        type="button"
                        onClick={() => openResolutionForm(issue)}
                      >
                        {translate("issues.resolve")}
                      </button>
                    </div>
                  )}

                  {isOpen && isResolutionFormVisible && (
                    <form
                      className="issue-resolution-form"
                      onSubmit={resolveSelectedIssue}
                    >
                      <p className="issue-resolution-form__summary">
                        <strong>
                          {formatIssueCategory(issue.category, translate)}
                        </strong>
                        <span>
                          {issue.description || translate("common.notProvided")}
                        </span>
                      </p>
                      <label>
                        {translate("issues.resolutionNote")}
                        <textarea
                          name="resolutionNote"
                          value={resolutionNote}
                          onChange={(event) =>
                            setResolutionNote(event.target.value)
                          }
                          rows="3"
                        />
                      </label>
                      {resolutionError && (
                        <p className="form-error" role="alert">
                          {resolutionError}
                        </p>
                      )}
                      <div className="button-row">
                        <button
                          className="button"
                          type="button"
                          disabled={isResolvingIssue}
                          onClick={closeResolutionForm}
                        >
                          {translate("common.cancel")}
                        </button>
                        <button
                          className="button button--primary"
                          type="submit"
                          disabled={isResolvingIssue}
                        >
                          {isResolvingIssue
                            ? translate("issues.resolving")
                            : translate("issues.resolve")}
                        </button>
                      </div>
                    </form>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="offers-section" aria-labelledby="offers-title">
        <div className="offers-section__header">
          <h3 id="offers-title">{translate("offers.title")}</h3>
          <div className="offers-section__actions">
            {canOfferToCleaners && !isLoadingOffers && sortedOffers.length === 0 && (
              <button
                className="button button--primary"
                type="button"
                onClick={onOfferToCleaners}
              >
                {translate("offers.offerCleaningToCleaners")}
              </button>
            )}
            {canOfferToCleaners && !isLoadingOffers && sortedOffers.length > 0 && (
              <button className="button" type="button" onClick={onOfferToCleaners}>
                {translate("offers.sendToMoreCleaners")}
              </button>
            )}
            <button
              className="button"
              type="button"
              onClick={onRefreshOffers}
              disabled={isLoadingOffers}
            >
              {translate("offers.refresh")}
            </button>
          </div>
        </div>

        {isLoadingOffers && (
          <StateCard message={translate("offers.loading")} status="status" />
        )}

        {!isLoadingOffers && hasOffersError && (
          <StateCard
            message={translate("offers.error")}
            status="alert"
            isError
          />
        )}

        {!isLoadingOffers && !hasOffersError && sortedOffers.length === 0 && (
          <StateCard message={translate("offers.empty")} />
        )}

        {!isLoadingOffers && !hasOffersError && sortedOffers.length > 0 && (
          <div className="offer-status-list">
            {sortedOffers.map((offer) => {
              const respondedAt = formatCreatedAt(offer.respondedAt, language);
              const offerCleanerName = currentCleanerName(
                offer.cleanerId,
                offer.cleanerName,
                cleanerNamesById,
                translate("common.notProvided"),
              );
              const canCreatePublicLink =
                offer.status === "PENDING" &&
                (!isAssignmentAware
                  ? job.operationalStatus === "OFFERED"
                  : ["OFFERED", "ASSIGNED"].includes(job.operationalStatus));

              return (
                <article key={offer.id} className="offer-status-item">
                  <div>
                    <strong>{offerCleanerName}</strong>
                    {respondedAt && (
                      <span>
                        {translate("offers.responded")} {respondedAt}
                      </span>
                    )}
                  </div>
                  <span className="status-badge">
                    {translate(
                      {
                        PENDING: "status.pending",
                        INTERESTED: "status.interested",
                        DECLINED: "status.declined",
                      }[offer.status] || "common.notProvided",
                    )}
                  </span>
                  {canManageOffers && (
                    <div className="offer-status-actions">
                      {canCreatePublicLink && (
                        <button
                          className="button"
                          type="button"
                          disabled={isCreatingPublicOfferLinkFor !== null}
                          onClick={() => createOfferLink(offer)}
                        >
                          {isCreatingPublicOfferLinkFor === offer.id
                            ? translate("offers.creatingPublicLink")
                            : translate("offers.createPublicLink")}
                        </button>
                      )}
                      {offer.status === "INTERESTED" &&
                        (isAssignmentAware
                          ? canEditRoster && !assignedCleanerIds.includes(offer.cleanerId)
                          : !isAssigned) && (
                        <button
                          className="button button--primary"
                          type="button"
                          disabled={assigningCleanerId !== null}
                          onClick={() => assignCleaner(offer)}
                        >
                          {assigningCleanerId === offer.cleanerId
                            ? translate("offers.assigning")
                            : translate("offers.assign")}
                        </button>
                      )}
                    </div>
                  )}
                  {publicOfferLink?.offerId === offer.id && (
                    <a
                      className="public-offer-link"
                      href={publicOfferLink.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {translate("offers.openPublicLink")}
                    </a>
                  )}
                  {publicOfferLinkError === offer.id && (
                    <p className="form-error" role="alert">
                      {translate("offers.publicLinkError")}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        )}

        {!isAssignmentAware && assignmentError && (
          <p className="form-error assignment-error" role="alert">
            {assignmentError}
          </p>
        )}
      </section>

      <div className="button-row">
        {canSimulateAssignedCleaner && (
          <button
            className="button"
            type="button"
            onClick={onSimulateAssignedCleaner}
          >
            {translate("offers.simulateAssignedCleaner")}
          </button>
        )}
      </div>
      <ScrollToTopButton />
    </section>
  );
}
