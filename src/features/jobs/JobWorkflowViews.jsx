import { useId, useState } from "react";
import { pricingMessage } from "../pricing/pricingMessages.js";
import { newOfferPay, offerPayForRecipient } from "../../../functions/src/offerPay.js";
import { formatOfferCompensation } from "./offerCompensation.js";
import { BackButton, DetailItem, StateCard } from "../../components/UiPrimitives.jsx";
import {
  formatCreatedAt,
  formatDate,
  formatOperationalStatus,
  formatStatus,
} from "../../lib/presentation.js";
import { useTranslation } from "../../i18n/translations.js";
import { cleanerSelectionMessage } from "../../i18n/cleanerSelectionMessages.js";
import { createIssue } from "../issues/issueService.js";
import { createJobOffers, respondToJobOffer } from "./jobOfferService.js";
import { automaticOfferOptInLabel, canExtendAutomaticOfferJob, canOptIntoAutomaticOffers } from "./automaticOffers.js";
import { setRequiredCleanerCount } from "./assignmentService.js";
import { isAssignmentAwareJob } from "./jobCompatibility.js";
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
  const [choices, setChoices] = useState(new Map());
  const [revealedSchedule, setRevealedSchedule] = useState(null);
  const cleanerListId = useId();
  const scheduleKey = JSON.stringify([job.id, job.scheduledDate, job.scheduledStart, job.scheduleRevision]);
  const showBlocked = revealedSchedule === scheduleKey;
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
  const alreadyOfferedOrAssigned = new Set([...existingOfferCleanerIds, ...(job.assignedCleanerIds || [])]);
  const terms = newOfferPay(job, property, canChooseCleanerCount ? cleanerCount : requiredCleanerCount(job));
  const offerPrice = offerPayForRecipient(terms, job);
  const [hasSendError, setHasSendError] = useState(false);
  const context = useCleanerSelectionContext(job, !isLoading && !hasError && cleaners.length > 0);
  const checkingAvailability = Boolean(job.scheduledDate) && context.status === "loading";
  const blockedIds = new Set(cleaners.filter(cleaner => context.result.byCleanerId[cleaner.id]?.unavailability?.state === "blocked")
    .map(cleaner => cleaner.id));
  const matches = filterCleanersByName(cleaners, cleanerSearch);
  const visibleCleaners = sortCleanerOptions(showBlocked ? matches : matches.filter(cleaner => !blockedIds.has(cleaner.id)), context.result);
  // A click made before a block was known cannot authorize sending to that cleaner.
  function isSelected(id) {
    if (checkingAvailability || alreadyOfferedOrAssigned.has(id) || !choices.has(id)) return false;
    const override = choices.get(id);
    if (blockedIds.has(id)) return showBlocked && override === scheduleKey;
    return override === null || override === scheduleKey;
  }
  const selectedCleaners = cleaners.filter(cleaner => isSelected(cleaner.id));

  function toggleBlocked() {
    if (showBlocked) {
      setChoices(current => new Map([...current].filter(([id]) => !blockedIds.has(id))));
      setRevealedSchedule(null);
    } else {
      setRevealedSchedule(scheduleKey);
    }
  }

  function toggleCleaner(cleanerId) {
    const blocked = blockedIds.has(cleanerId);
    if (checkingAvailability || alreadyOfferedOrAssigned.has(cleanerId) || (blocked && !showBlocked)) return;
    if (currentDistribution === null) {
      setDistribution({ jobId: job.id, mode: canOptIn ? "automatic" : "manual" });
    }
    const checked = isSelected(cleanerId);
    setChoices(previous => {
      const next = new Map(previous);
      if (checked) next.delete(cleanerId);
      else next.set(cleanerId, blocked ? scheduleKey : null);
      return next;
    });
  }

  async function sendOffers(event) {
    event.preventDefault();
    if (!selectedCleaners.length || isSending || unavailableAutomatic) return;

    setIsSending(true);
    setHasSendError(false);

    try {
      if (canChooseCleanerCount && cleanerCount !== requiredCleanerCount(job)) {
        await setRequiredCleanerCount(job.id, cleanerCount);
      }
      const manualTerms = terms.offeredPay ? { offeredPay: terms.offeredPay } : {};
      if (terms.offeredCompensation != null) manualTerms.offeredCompensation = terms.offeredCompensation;
      if (terms.offeredFirstSlotExtraCents) manualTerms.offeredFirstSlotExtraCents = terms.offeredFirstSlotExtraCents;
      const updatedJob = await createJobOffers({
        jobId: job.id,
        cleaners: selectedCleaners,
        ...((canOptIn && automatic) || extendingAutomatic ? { automatic: true } : manualTerms),
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
          {blockedIds.size > 0 && (
            <button type="button" className="button button--text cleaner-selection-toggle" aria-expanded={showBlocked}
              aria-controls={cleanerListId} disabled={isSending} onClick={toggleBlocked}>
              {cleanerSelectionMessage(language, "cleanerSelection." + (showBlocked ? "hide" : "show")
                + (blockedIds.size === 1 ? "BlockedOne" : "BlockedMany"), { count: blockedIds.size })}
            </button>
          )}
          <div id={cleanerListId}>
            {!checkingAvailability && matches.length === 0 && <StateCard message={translate("offers.searchNoCleaners")} />}
            {!checkingAvailability && visibleCleaners.length > 0 && <div className="cleaner-list">
              {visibleCleaners.map((cleaner) => (
                <CleanerSelectionOption key={cleaner.id} className="cleaner-option"
                  cleanerId={cleaner.id} name={alreadyOfferedOrAssigned.has(cleaner.id)
                    ? `${cleaner.name || translate("common.notProvided")} · ${translate("offers.alreadyOffered")}`
                    : cleaner.name || translate("common.notProvided")}
                  context={context.result} language={language} type="checkbox"
                  checked={isSelected(cleaner.id)}
                  disabled={isSending || alreadyOfferedOrAssigned.has(cleaner.id)}
                  onChange={() => toggleCleaner(cleaner.id)} />
              ))}
            </div>}
          </div>

          <CleanerAvailabilityConfirmation selected={selectedCleaners}
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

          {offerPrice.offeredCompensation == null && !offerPrice.offeredPay ? (
            <p className="form-error" role="status" data-testid="offer-amount-missing">{translate("offers.amountMissing")}</p>
          ) : (
            <p className="form-helper" data-testid="offer-amount">
              {translate("offers.amountForCleaner", { amount: formatOfferCompensation(offerPrice, translate, language) })}
              {offerPrice.offeredPay && <><br />{pricingMessage(language, "reportHours")}</>}
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
              disabled={selectedCleaners.length === 0 || isSending || unavailableAutomatic}
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
