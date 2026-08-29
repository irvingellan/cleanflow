import { useEffect, useState } from "react";
import { OperationalIcon } from "../../components/OperationalIcon.jsx";
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

export function JobDetail({
  job,
  knownCleaners,
  offers,
  isLoadingOffers,
  hasOffersError,
  issues,
  isLoadingIssues,
  hasIssuesError,
  onBack,
  onOfferToCleaners,
  onRefreshOffers,
  onRefreshIssues,
  onSimulateOffer,
  onCreatePublicOfferLink,
  onAssignCleaner,
  onStartCleaning,
  onCompleteCleaning,
  onSimulateAssignedCleaner,
  onResolveIssue,
}) {
  const { language, translate } = useTranslation();
  const [resolvedCleanerNames, setResolvedCleanerNames] = useState({});
  const [assigningCleanerId, setAssigningCleanerId] = useState(null);
  const [assignmentError, setAssignmentError] = useState(null);
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
  const createdAt = formatCreatedAt(job.createdAt, language);
  const assignedAt = formatCreatedAt(job.assignedAt, language);
  const startedAt = formatCreatedAt(job.startedAt, language);
  const completedAt = formatCreatedAt(job.completedAt, language);
  const isAssigned = Boolean(
    job.assignedCleanerId ||
      ["ASSIGNED", "IN_PROGRESS", "COMPLETED"].includes(
        job.operationalStatus,
      ),
  );
  const canSimulateAssignedCleaner = [
    "ASSIGNED",
    "IN_PROGRESS",
    "COMPLETED",
  ].includes(job.operationalStatus);
  const isInProgress = job.operationalStatus === "IN_PROGRESS";
  const isCompleted = job.operationalStatus === "COMPLETED";
  const canManageOffers = !isCompleted;
  const knownCleanerNames = Object.fromEntries(
    knownCleaners.map((cleaner) => [cleaner.id, cleaner.name]),
  );
  const cleanerNamesById = { ...resolvedCleanerNames, ...knownCleanerNames };
  const unresolvedCleanerIds = [
    job.assignedCleanerId,
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
        <DetailItem
          label={translate("jobs.operationalStatus")}
          value={formatOperationalStatus(job.operationalStatus, translate)}
        />
        <DetailItem
          label={translate("jobs.clientPrice")}
          value={formatPrice(job.clientPrice, translate, language)}
        />
        <DetailItem
          label={translate("jobs.cleanerPayout")}
          value={formatPrice(job.cleanerPayout, translate, language)}
        />
        {isAssigned && (
          <DetailItem
            label={translate("jobs.assignedCleaner")}
            value={assignedCleanerName}
          />
        )}
        {isAssigned && (
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

      {(job.operationalStatus === "ASSIGNED" ||
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
          <button
            className="button"
            type="button"
            onClick={onRefreshOffers}
            disabled={isLoadingOffers}
          >
            {translate("offers.refresh")}
          </button>
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
                      <button
                        className="button"
                        type="button"
                        onClick={() => onSimulateOffer(offer)}
                      >
                        {translate("offers.simulateOffer")}
                      </button>
                      {offer.status === "PENDING" && (
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
                      {offer.status === "INTERESTED" && !isAssigned && (
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

        {assignmentError && (
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
        {canManageOffers && (
          <button
            className="button button--primary"
            type="button"
            onClick={onOfferToCleaners}
          >
            {translate("offers.offerToCleaners")}
          </button>
        )}
      </div>
    </section>
  );
}
