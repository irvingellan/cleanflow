import { useState } from "react";
import { BackButton, DetailItem, StateCard } from "../../components/UiPrimitives.jsx";
import {
  formatCreatedAt,
  formatDate,
  formatOperationalStatus,
  formatStatus,
} from "../../lib/presentation.js";
import { useTranslation } from "../../i18n/translations.js";
import { createIssue } from "../issues/issueService.js";
import { createJobOffers, respondToJobOffer } from "./jobOfferService.js";

export function OfferCleaners({
  job,
  cleaners,
  isLoading,
  hasError,
  onBack,
  onSent,
}) {
  const { translate } = useTranslation();
  const [selectedCleanerIds, setSelectedCleanerIds] = useState([]);
  const [isSending, setIsSending] = useState(false);
  const [hasSendError, setHasSendError] = useState(false);

  function toggleCleaner(cleanerId) {
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

    if (selectedCleaners.length === 0) {
      return;
    }

    setIsSending(true);
    setHasSendError(false);

    try {
      const updatedJob = await createJobOffers({
        jobId: job.id,
        cleaners: selectedCleaners,
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
          <div className="cleaner-list">
            {cleaners.map((cleaner) => (
              <label key={cleaner.id} className="cleaner-option">
                <input
                  type="checkbox"
                  checked={selectedCleanerIds.includes(cleaner.id)}
                  onChange={() => toggleCleaner(cleaner.id)}
                />
                <span>
                  {cleaner.name || translate("common.notProvided")}
                </span>
              </label>
            ))}
          </div>

          {hasSendError && (
            <p className="form-error" role="alert">
              {translate("offers.sendError")}
            </p>
          )}

          <div className="button-row">
            <button
              className="button button--primary"
              type="submit"
              disabled={selectedCleanerIds.length === 0 || isSending}
            >
              {isSending ? translate("offers.sending") : translate("offers.send")}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

export function OffersSuccess({ count, onBackToJob, onBackToJobs }) {
  const { translate } = useTranslation();

  return (
    <section
      className="panel success-panel"
      aria-labelledby="offers-success-title"
    >
      <span className="success-mark" aria-hidden="true">
        ✓
      </span>
      <p className="eyebrow">{translate("offers.title")}</p>
      <h2 id="offers-success-title" className="panel__title">
        {translate("offers.sent")}
      </h2>
      <p className="success-panel__detail">
        {translate(count === 1 ? "offers.receivedOne" : "offers.receivedMany", {
          count,
        })}
      </p>

      <div className="button-row">
        <button
          className="button button--primary"
          type="button"
          onClick={onBackToJob}
        >
          {translate("jobs.backToJob")}
        </button>
        <button className="button" type="button" onClick={onBackToJobs}>
          {translate("jobs.backToJobs")}
        </button>
      </div>
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
