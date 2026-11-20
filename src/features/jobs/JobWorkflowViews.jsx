import { useState } from "react";
import { BackButton, DetailItem, StateCard } from "../../components/UiPrimitives.jsx";
import {
  formatCreatedAt,
  formatDate,
  formatOperationalStatus,
  formatPrice,
  formatStatus,
} from "../../lib/presentation.js";
import { useTranslation } from "../../i18n/translations.js";
import { createIssue } from "../issues/issueService.js";
import { createJobOffers, respondToJobOffer } from "./jobOfferService.js";
import { automaticOfferOptInLabel, canExtendAutomaticOfferJob, canOptIntoAutomaticOffers } from "./automaticOffers.js";
import { setRequiredCleanerCount } from "./assignmentService.js";
import { isAssignmentAwareJob, optionalJobPrice } from "./jobCompatibility.js";
import { maxCleanersPerJob, requiredCleanerCount } from "./offerSlots.js";
import { filterCleanersByName } from "../cleaners/cleanerSearch.js";
import { CleanerAvailabilityConfirmation, CleanerSelectionOption, CleanerSelectionStatus, sortCleanerOptions, useCleanerSelectionContext } from "./CleanerSelectionContext.jsx";

export function OfferCleaners({
  job,
  cleaners,
  isLoading,
  hasError,
  canOfferAutomatically = true,
  existingOfferCleanerIds = [],
  property = null,
  onBack,
  onSent,
}) {
  const { language, translate } = useTranslation();
  const [selectedCleanerIds, setSelectedCleanerIds] = useState([]);
  const [cleanerSearch, setCleanerSearch] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [distribution, setDistribution] = useState(null);
  const canOptIn = import.meta.env.VITE_AUTOMATIC_OFFERS_MODE === "enabled"
    && canOfferAutomatically && canOptIntoAutomaticOffers(job);
  const currentDistribution = distribution?.jobId === job.id ? distribution.mode : null;
  const automatic = currentDistribution !== "manual" && canOptIn;
  const unavailableAutomatic = currentDistribution === "automatic" && !canOptIn;
  // "Send to more cleaners" on an open automatic batch keeps it automatic.
  const extendingAutomatic = canExtendAutomaticOfferJob(job);
  const isFirstSend = existingOfferCleanerIds.length === 0 && !extendingAutomatic;
  const canChooseCleanerCount = isFirstSend && isAssignmentAwareJob(job)
    && ["UNASSIGNED", "OFFERED"].includes(job.operationalStatus) && !(job.assignedCleanerIds?.length);
  const [cleanerCount, setCleanerCount] = useState(requiredCleanerCount(job));
  const unavailableCleanerIds = new Set([...existingOfferCleanerIds, ...(job.assignedCleanerIds || [])]);
  // The amount every new Offer carries: the Job pay, else the Property default.
  const offerAmount = optionalJobPrice(job.cleanerPayout) ?? optionalJobPrice(property?.defaultCleanerPrice) ?? null;
  const [hasSendError, setHasSendError] = useState(false);
  const context = useCleanerSelectionContext(job, !isLoading && !hasError && cleaners.length > 0);
  const visibleCleaners = sortCleanerOptions(filterCleanersByName(cleaners, cleanerSearch), context.result);

  function toggleCleaner(cleanerId) {
    if (unavailableCleanerIds.has(cleanerId)) return;
    if (currentDistribution === null) {
      setDistribution({ jobId: job.id, mode: canOptIn ? "automatic" : "manual" });
    }
    setSelectedCleanerIds((currentIds) =>
      currentIds.includes(cleanerId)
        ? currentIds.filter((id) => id !== cleanerId)
        : [...currentIds, cleanerId],
    );
  }

  async function sendOffers(event) {
    event.preventDefault();
    const selectedCleaners = cleaners.filter((cleaner) =>
      selectedCleanerIds.includes(cleaner.id),
    );

    if (selectedCleaners.length === 0 || unavailableAutomatic) {
      return;
    }

    setIsSending(true);
    setHasSendError(false);

    try {
      if (canChooseCleanerCount && cleanerCount !== requiredCleanerCount(job)) {
        await setRequiredCleanerCount(job.id, cleanerCount);
      }
      const updatedJob = await createJobOffers({
        jobId: job.id,
        cleaners: selectedCleaners,
        ...((canOptIn && automatic) || extendingAutomatic ? { automatic: true } : offerAmount === null ? {} : { offeredCompensation: offerAmount }),
      });
      onSent(selectedCleaners.length, updatedJob);
    } catch {
      setHasSendError(true);
      setIsSending(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="offer-cleaners-title">
      <BackButton onClick={onBack} />

      <p className="eyebrow">{translate("offers.title")}</p>
      <h2 id="offer-cleaners-title" className="panel__title">
        {translate("offers.offerToCleaners")}
      </h2>
      <p className="offer-job-name">
        {job.propertyName || translate("properties.unnamed")}
      </p>

      {isLoading && (
        <StateCard
          message={translate("offers.loadingCleaners")}
          status="status"
        />
      )}

      {!isLoading && hasError && (
        <StateCard
          message={translate("offers.cleanerError")}
          status="alert"
          isError
        />
      )}

      {!isLoading && !hasError && cleaners.length === 0 && (
        <StateCard message={translate("offers.emptyCleaners")} />
      )}

      {!isLoading && !hasError && cleaners.length > 0 && (
        <form className="offer-form" onSubmit={sendOffers}>
          <div className="cleaner-name-search">
            <label htmlFor="offer-cleaners-search">{translate("offers.searchCleaners")}</label>
            <input
              id="offer-cleaners-search"
              type="search"
              value={cleanerSearch}
              onChange={(event) => setCleanerSearch(event.target.value)}
            />
          </div>

          <CleanerSelectionStatus {...context} language={language} />
          {visibleCleaners.length === 0 ? (
            <StateCard message={translate("offers.searchNoCleaners")} />
          ) : (
            <div className="cleaner-list">
              {visibleCleaners.map((cleaner) => (
                <CleanerSelectionOption key={cleaner.id} className="cleaner-option"
                  cleanerId={cleaner.id} name={unavailableCleanerIds.has(cleaner.id)
                    ? `${cleaner.name || translate("common.notProvided")} · ${translate("offers.alreadyOffered")}`
                    : cleaner.name || translate("common.notProvided")}
                  context={context.result} language={language} type="checkbox"
                  checked={selectedCleanerIds.includes(cleaner.id)}
                  disabled={unavailableCleanerIds.has(cleaner.id)}
                  onChange={() => toggleCleaner(cleaner.id)} />
              ))}
            </div>
          )}

          <CleanerAvailabilityConfirmation selected={cleaners.filter(cleaner => selectedCleanerIds.includes(cleaner.id))}
            context={context.result} language={language} />
          {canChooseCleanerCount && (
            <div className="offer-spots" data-testid="offer-cleaner-count">
              <span>{translate("offers.cleanersNeeded")}</span>
              <span className="offer-spots__stepper" role="group" aria-label={translate("offers.spotsLabel")}>
                <button className="button" type="button" aria-label={translate("offers.spotsLess")}
                  disabled={isSending || cleanerCount <= 1}
                  onClick={() => setCleanerCount((count) => Math.max(1, count - 1))}>−</button>
                <span className="offer-spots__count" aria-live="polite">{cleanerCount}</span>
                <button className="button" type="button" aria-label={translate("offers.spotsMore")}
                  disabled={isSending || cleanerCount >= maxCleanersPerJob}
                  onClick={() => setCleanerCount((count) => Math.min(maxCleanersPerJob, count + 1))}>+</button>
              </span>
            </div>
          )}

          {offerAmount === null ? (
            <p className="form-error" role="status" data-testid="offer-amount-missing">{translate("offers.amountMissing")}</p>
          ) : (
            <p className="form-helper" data-testid="offer-amount">
              {translate("offers.amountForCleaner", { amount: formatPrice(offerAmount, translate, language) })}
            </p>
          )}

          {(canOptIn || unavailableAutomatic) && !extendingAutomatic && (
            <label className="cleaner-option">
              <input
                type="checkbox"
                checked={automatic || unavailableAutomatic}
                disabled={isSending}
                onChange={(event) => setDistribution({ jobId: job.id, mode: event.target.checked ? "automatic" : "manual" })}
              />
              <span>{automaticOfferOptInLabel({ ...job, requiredCleanerCount: cleanerCount }, language, translate)}</span>
            </label>
          )}

          {(hasSendError || unavailableAutomatic) && (
            <p className="form-error" role="alert">
              {translate("offers.sendError")}
            </p>
          )}

          <div className="button-row">
            <button
              className="button button--primary"
              type="submit"
              disabled={selectedCleanerIds.length === 0 || isSending || unavailableAutomatic}
            >
              {isSending ? translate("offers.sending") : translate("offers.send")}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

export function CleanerOfferSimulation({ job, offer, onBackToJob }) {
  const { language, translate } = useTranslation();
  const [offerStatus, setOfferStatus] = useState(offer.status || "PENDING");
  const [isResponding, setIsResponding] = useState(false);
  const [hasResponseError, setHasResponseError] = useState(false);

  async function submitResponse(status) {
    setIsResponding(true);
    setHasResponseError(false);

    try {
      await respondToJobOffer({
        jobId: job.id,
        cleanerId: offer.cleanerId,
        status,
      });
      setOfferStatus(status);
    } catch {
      setHasResponseError(true);
    } finally {
      setIsResponding(false);
    }
  }

  return (
    <section
      className="panel cleaner-offer-panel"
      aria-labelledby="cleaner-offer-title"
    >
      <BackButton onClick={onBackToJob} />

      <p className="eyebrow">{translate("cleaner.developmentSimulation")}</p>
      <h2 id="cleaner-offer-title" className="panel__title">
        {translate("cleaner.offerTitle")}
      </h2>

      <dl className="detail-list">
        <DetailItem
          label={translate("common.property")}
          value={job.propertyName || translate("properties.unnamed")}
        />
        <DetailItem
          label={translate("jobs.scheduledDate")}
          value={formatDate(job.scheduledDate, translate, language)}
        />
        <DetailItem
          label={translate("cleaner.offerStatus")}
          value={formatStatus(offerStatus, translate)}
        />
      </dl>

      {hasResponseError && (
        <p className="form-error" role="alert">
          {translate("cleaner.responseError")}
        </p>
      )}

      {offerStatus === "PENDING" && (
        <div className="button-row" aria-label={translate("cleaner.offerStatus")}>
          <button
            className="button button--primary"
            type="button"
            disabled={isResponding}
            onClick={() => submitResponse("INTERESTED")}
          >
            {translate("cleaner.interested")}
          </button>
          <button
            className="button"
            type="button"
            disabled={isResponding}
            onClick={() => submitResponse("DECLINED")}
          >
            {translate("cleaner.notAvailable")}
          </button>
        </div>
      )}
    </section>
  );
}

export function AssignedCleanerJob({
  job,
  onBackToJob,
  onStartCleaning,
  onCompleteCleaning,
  onReportIssue,
}) {
  const { language, translate } = useTranslation();
  const [isStarting, setIsStarting] = useState(false);
  const [hasStartError, setHasStartError] = useState(false);
  const [isCompletionConfirmationVisible, setIsCompletionConfirmationVisible] =
    useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [hasCompletionError, setHasCompletionError] = useState(false);
  const startedAt = formatCreatedAt(job.startedAt, language);
  const completedAt = formatCreatedAt(job.completedAt, language);
  const isInProgress = job.operationalStatus === "IN_PROGRESS";
  const isCompleted = job.operationalStatus === "COMPLETED";

  async function startCleaning() {
    setIsStarting(true);
    setHasStartError(false);

    try {
      await onStartCleaning();
    } catch {
      setHasStartError(true);
    } finally {
      setIsStarting(false);
    }
  }

  async function completeCleaning() {
    setIsCompleting(true);
    setHasCompletionError(false);

    try {
      await onCompleteCleaning();
    } catch {
      setHasCompletionError(true);
    } finally {
      setIsCompleting(false);
    }
  }

  return (
    <section
      className="panel cleaner-job-panel"
      aria-labelledby="cleaner-job-title"
    >
      <BackButton onClick={onBackToJob} />

      <p className="eyebrow">{translate("cleaner.developmentSimulation")}</p>
      <h2 id="cleaner-job-title" className="panel__title">
        {isCompleted
          ? translate("cleaner.completedTitle")
          : isInProgress
            ? translate("cleaner.inProgressTitle")
            : translate("cleaner.assignedTitle")}
      </h2>

      <dl className="detail-list">
        <DetailItem
          label={translate("common.property")}
          value={job.propertyName || translate("properties.unnamed")}
        />
        <DetailItem
          label={translate("jobs.scheduledDate")}
          value={formatDate(job.scheduledDate, translate, language)}
        />
        <DetailItem
          label={translate("jobs.assignedCleaner")}
          value={job.assignedCleanerName || translate("common.notProvided")}
        />
        <DetailItem
          label={translate("jobs.operationalStatus")}
          value={formatOperationalStatus(job.operationalStatus, translate)}
        />
        {(isInProgress || isCompleted) && (
          <DetailItem
            label={translate("jobs.startedTime")}
            value={startedAt || translate("common.notProvided")}
          />
        )}
        {isCompleted && (
          <DetailItem
            label={translate("jobs.completedTime")}
            value={completedAt || translate("common.notProvided")}
          />
        )}
      </dl>

      {job.notes && (
        <section className="notes-section" aria-label={translate("common.notes")}>
          <h3>{translate("common.notes")}</h3>
          <p>{job.notes}</p>
        </section>
      )}

      {hasStartError && (
        <p className="form-error" role="alert">
          {translate("cleaner.startError")}
        </p>
      )}

      {hasCompletionError && (
        <p className="form-error" role="alert">
          {translate("cleaner.completeError")}
        </p>
      )}

      {job.operationalStatus === "ASSIGNED" && (
        <div className="button-row">
          <button
            className="button button--primary"
            type="button"
            disabled={isStarting}
            onClick={startCleaning}
          >
            {isStarting
              ? translate("cleaner.starting")
              : translate("cleaner.start")}
          </button>
        </div>
      )}

      {isInProgress && (
        <div className="button-row">
          <button className="button" type="button" onClick={onReportIssue}>
            {translate("cleaner.reportIssue")}
          </button>
          {!isCompletionConfirmationVisible && (
            <button
              className="button button--primary"
              type="button"
              onClick={() => setIsCompletionConfirmationVisible(true)}
            >
              {translate("cleaner.complete")}
            </button>
          )}
        </div>
      )}

      {isInProgress && isCompletionConfirmationVisible && (
        <section
          className="completion-confirmation"
          aria-label={translate("cleaner.completeConfirmation")}
        >
          <p>{translate("cleaner.completeConfirmation")}</p>
          <div className="button-row">
            <button
              className="button"
              type="button"
              disabled={isCompleting}
              onClick={() => setIsCompletionConfirmationVisible(false)}
            >
              {translate("common.cancel")}
            </button>
            <button
              className="button button--primary"
              type="button"
              disabled={isCompleting}
              onClick={completeCleaning}
            >
              {isCompleting
                ? translate("cleaner.completing")
                : translate("cleaner.complete")}
            </button>
          </div>
        </section>
      )}
    </section>
  );
}

export function IssueForm({ job, onBack, onSubmitted }) {
  const { translate } = useTranslation();
  const [category, setCategory] = useState("ACCESS");
  const [description, setDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [hasSaveError, setHasSaveError] = useState(false);

  async function submitIssue(event) {
    event.preventDefault();
    setIsSaving(true);
    setHasSaveError(false);

    try {
      await createIssue({
        jobId: job.id,
        propertyId: job.propertyId,
        cleanerId: job.assignedCleanerId,
        cleanerName: job.assignedCleanerName,
        category,
        description,
      });
      onSubmitted();
    } catch {
      setHasSaveError(true);
      setIsSaving(false);
    }
  }

  return (
    <section
      className="panel cleaner-job-panel"
      aria-labelledby="issue-form-title"
    >
      <BackButton onClick={onBack} />

      <p className="eyebrow">{translate("cleaner.issueTitle")}</p>
      <h2 id="issue-form-title" className="panel__title">
        {translate("cleaner.reportIssue")}
      </h2>

      <form className="cleaning-form" onSubmit={submitIssue}>
        <label>
          {translate("cleaner.issueCategory")}
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="ACCESS">{translate("issueCategory.access")}</option>
            <option value="SUPPLIES">
              {translate("issueCategory.supplies")}
            </option>
            <option value="BROKEN_ITEM">
              {translate("issueCategory.brokenItem")}
            </option>
            <option value="HEAVY_CLEANING">
              {translate("issueCategory.heavyCleaning")}
            </option>
            <option value="OTHER">{translate("issueCategory.other")}</option>
          </select>
        </label>

        <label>
          {translate("cleaner.issueDescription")}
          <textarea
            rows="4"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            required
          />
        </label>

        <label>
          {translate("cleaner.reportedBy")}
          <input
            type="text"
            value={job.assignedCleanerName || translate("common.notProvided")}
            readOnly
          />
        </label>

        {hasSaveError && (
          <p className="form-error" role="alert">
            {translate("cleaner.issueError")}
          </p>
        )}

        <div className="button-row">
          <button
            className="button button--primary"
            type="submit"
            disabled={isSaving}
          >
            {isSaving
              ? translate("cleaner.reporting")
              : translate("cleaner.submitIssue")}
          </button>
        </div>
      </form>
    </section>
  );
}

export function IssueSuccess({ onBackToCleaning }) {
  const { translate } = useTranslation();

  return (
    <section
      className="panel success-panel"
      aria-labelledby="issue-success-title"
    >
      <span className="success-mark" aria-hidden="true">
        ✓
      </span>
      <p className="eyebrow">{translate("cleaner.issueTitle")}</p>
      <h2 id="issue-success-title" className="panel__title">
        {translate("cleaner.issueReported")}
      </h2>

      <div className="button-row">
        <button
          className="button button--primary"
          type="button"
          onClick={onBackToCleaning}
        >
          {translate("cleaner.backToCleaning")}
        </button>
      </div>
    </section>
  );
}
