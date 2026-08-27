import { useMemo, useState } from "react";
import { useTranslation } from "../../i18n/translations.js";
import { validatePayoutProofFile } from "./payoutProofService.js";

const paymentMethods = ["ZELLE", "VENMO", "CASH", "CHECK", "OTHER"];

function paymentMethodLabel(paymentMethod, translate) {
  return {
    ZELLE: "Zelle",
    VENMO: "Venmo",
    CASH: translate("cleaners.paymentMethodCash"),
    CHECK: translate("cleaners.paymentMethodCheck"),
    OTHER: translate("cleaners.paymentMethodOther"),
  }[paymentMethod] || translate("common.notProvided");
}

function PayoutProofSourcePicker({ disabled, onSelect }) {
  const { translate } = useTranslation();

  function handleSelection(event) {
    onSelect(event);
    // Allow choosing the same image again after a validation or upload retry.
    event.target.value = "";
  }

  return (
    <div className="proof-source-picker">
      <label className="button proof-source-picker__camera">
        <input
          className="visually-hidden"
          type="file"
          accept="image/*"
          capture="environment"
          disabled={disabled}
          onChange={handleSelection}
        />
        📷 {translate("payouts.takePhoto")}
      </label>
      <label className="button">
        <input
          className="visually-hidden"
          type="file"
          accept="image/*"
          disabled={disabled}
          onChange={handleSelection}
        />
        🖼️ {translate("payouts.chooseImage")}
      </label>
    </div>
  );
}

export function PayoutDirectory({
  payoutGroups,
  recentPayouts,
  isLoading,
  hasError,
  paidSummary,
  onRefresh,
  onReview,
  onUploadProof,
  onOpenProof,
  formatPrice,
  formatCreatedAt,
}) {
  const { translate } = useTranslation();

  return (
    <section aria-labelledby="payouts-title">
      <div className="directory-heading">
        <div>
          <p className="eyebrow">{translate("navigation.payouts")}</p>
          <h2 id="payouts-title" className="list-title">
            {translate("payouts.title")}
          </h2>
        </div>
        <button className="button" type="button" disabled={isLoading} onClick={onRefresh}>
          {translate("payouts.refresh")}
        </button>
      </div>

      {paidSummary && (
        <p className="payout-success" role="status">
          {translate("payouts.recorded", {
            amount: formatPrice(paidSummary.amount),
            count: paidSummary.jobCount,
          })}
        </p>
      )}

      {isLoading && <p className="property-history-state">{translate("payouts.loading")}</p>}

      {!isLoading && hasError && (
        <p className="property-history-state property-history-state--error" role="alert">
          {translate("payouts.error")}
        </p>
      )}

      {!isLoading && !hasError && payoutGroups.length === 0 && (
        <p className="property-history-state">{translate("payouts.empty")}</p>
      )}

      {!isLoading && !hasError && payoutGroups.length > 0 && (
        <div className="payout-directory">
          {payoutGroups.map((group) => (
            <article key={group.cleaner.id} className="payout-directory-card">
              <div>
                <strong>{group.cleaner.name || translate("common.notProvided")}</strong>
                <span>
                  {translate("payouts.unpaidJobs", { count: group.jobs.length })}
                </span>
              </div>
              <strong className="payout-directory-card__amount">
                {formatPrice(group.total)}
              </strong>
              <button className="button" type="button" onClick={() => onReview(group)}>
                {translate("payouts.review")}
              </button>
            </article>
          ))}
        </div>
      )}

      {!isLoading && !hasError && recentPayouts.length > 0 && (
        <section className="payout-history" aria-labelledby="payout-history-title">
          <h3 id="payout-history-title">{translate("payouts.recentHistory")}</h3>
          <div className="payout-history__list">
            {recentPayouts.map((payout) => (
              <PayoutHistoryItem
                key={payout.id}
                payout={payout}
                onUploadProof={onUploadProof}
                onOpenProof={onOpenProof}
                onRefresh={onRefresh}
                formatPrice={formatPrice}
                formatCreatedAt={formatCreatedAt}
              />
            ))}
          </div>
        </section>
      )}
    </section>
  );
}

function PayoutHistoryItem({ payout, onUploadProof, onOpenProof, onRefresh, formatPrice, formatCreatedAt }) {
  const { translate } = useTranslation();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState("");
  const [selectedFileName, setSelectedFileName] = useState("");
  const hasProof = Boolean(payout.proofStoragePath);

  function fileErrorMessage(errorCode) {
    if (errorCode === "invalid-proof-type") return translate("payouts.proofInvalidType");
    if (errorCode === "proof-too-large") return translate("payouts.proofTooLarge");
    return translate("payouts.proofUploadError");
  }

  async function selectProof(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    const validationError = validatePayoutProofFile(file);

    if (validationError) {
      setSelectedFileName("");
      setError(fileErrorMessage(validationError.code));
      return;
    }

    setSelectedFileName(file.name || "");
    setIsUploading(true);
    setUploadProgress(0);
    setError("");

    try {
      await onUploadProof(payout.id, file, setUploadProgress);
      await onRefresh();
    } catch (uploadError) {
      setError(fileErrorMessage(uploadError.code));
    } finally {
      setIsUploading(false);
    }
  }

  async function viewProof() {
    setError("");

    try {
      const proofUrl = await onOpenProof(payout.proofStoragePath);
      window.open(proofUrl, "_blank", "noopener,noreferrer");
    } catch {
      setError(translate("payouts.proofViewError"));
    }
  }

  return (
    <article className="payout-history-item">
      <div>
        <strong>{payout.cleanerNameSnapshot || translate("common.notProvided")}</strong>
        <span>
          {formatCreatedAt(payout.paidAt)} · {translate("payouts.historyJobs", { count: payout.jobIds?.length || 0 })}
        </span>
        <span>{paymentMethodLabel(payout.paymentMethod, translate)}</span>
      </div>
      <strong className="payout-history-item__amount">{formatPrice(payout.amount)}</strong>
      <div className="payout-history-item__proof">
        {hasProof ? (
          <>
            <span className="status-badge">{translate("payouts.proofAttached")}</span>
            <button className="button" type="button" onClick={viewProof}>
              {translate("payouts.viewProof")}
            </button>
          </>
        ) : (
          <PayoutProofSourcePicker disabled={isUploading} onSelect={selectProof} />
        )}
        {isUploading && <span>{translate("payouts.uploadingProof", { percent: uploadProgress })}</span>}
        {!hasProof && selectedFileName && (
          <span>{translate("payouts.proofSelected", { fileName: selectedFileName })}</span>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
    </article>
  );
}

export function PayoutReview({
  cleaner,
  jobs,
  onBack,
  onRecord,
  onUploadProof,
  onRecorded,
  formatDate,
  formatCreatedAt,
  formatPrice,
}) {
  const { translate } = useTranslation();
  const [selectedJobIds, setSelectedJobIds] = useState(() => new Set());
  const [paymentMethod, setPaymentMethod] = useState(
    paymentMethods.includes(cleaner.preferredPaymentMethod)
      ? cleaner.preferredPaymentMethod
      : "",
  );
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [proofFile, setProofFile] = useState(null);
  const [proofError, setProofError] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploadingProof, setIsUploadingProof] = useState(false);
  const [recordedPayout, setRecordedPayout] = useState(null);

  const selectedJobs = useMemo(
    () => jobs.filter((job) => selectedJobIds.has(job.id)),
    [jobs, selectedJobIds],
  );
  const total = selectedJobs.reduce((sum, job) => sum + job.cleanerPayout, 0);

  function toggleJob(jobId) {
    setSelectedJobIds((currentJobIds) => {
      const nextJobIds = new Set(currentJobIds);

      if (nextJobIds.has(jobId)) {
        nextJobIds.delete(jobId);
      } else {
        nextJobIds.add(jobId);
      }

      return nextJobIds;
    });
  }

  function proofErrorMessage(errorCode) {
    if (errorCode === "invalid-proof-type") return translate("payouts.proofInvalidType");
    if (errorCode === "proof-too-large") return translate("payouts.proofTooLarge");
    return translate("payouts.proofUploadError");
  }

  function selectProof(event) {
    const file = event.target.files?.[0] || null;
    const validationError = file ? validatePayoutProofFile(file) : null;

    setProofFile(validationError ? null : file);
    setProofError(validationError ? proofErrorMessage(validationError.code) : "");
  }

  async function submit(event) {
    event.preventDefault();

    if (selectedJobIds.size === 0) {
      setError(translate("payouts.jobsRequired"));
      return;
    }

    if (!paymentMethod) {
      setError(translate("payouts.paymentMethodRequired"));
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const payout = await onRecord({
        cleaner,
        jobIds: [...selectedJobIds],
        paymentMethod,
        note,
      });

      if (proofFile) {
        try {
          setUploadProgress(0);
          setIsUploadingProof(true);
          await onUploadProof(payout.id, proofFile, setUploadProgress);
        } catch (uploadError) {
          setRecordedPayout(payout);
          setProofError(proofErrorMessage(uploadError.code));
          setIsUploadingProof(false);
          setIsSubmitting(false);
          return;
        }
        setIsUploadingProof(false);
      }

      onRecorded(payout);
    } catch (recordError) {
      setError(
        recordError.code === "job-not-payable"
          ? translate("payouts.jobNoLongerPayable")
          : translate("payouts.recordError"),
      );
      setIsSubmitting(false);
    }
  }

  async function retryProof() {
    if (!proofFile || !recordedPayout) {
      setProofError(translate("payouts.proofRequired"));
      return;
    }

    setIsSubmitting(true);
    setProofError("");
    setUploadProgress(0);
    setIsUploadingProof(true);

    try {
      await onUploadProof(recordedPayout.id, proofFile, setUploadProgress);
      onRecorded(recordedPayout);
    } catch (uploadError) {
      setProofError(proofErrorMessage(uploadError.code));
    } finally {
      setIsUploadingProof(false);
      setIsSubmitting(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="payout-review-title">
      <button className="back-button" type="button" onClick={onBack}>
        ← {translate("payouts.backToPayouts")}
      </button>

      <p className="eyebrow">{translate("payouts.title")}</p>
      <h2 id="payout-review-title" className="panel__title">
        {cleaner.name || translate("common.notProvided")}
      </h2>

      <form className="cleaning-form" noValidate onSubmit={submit}>
        <div className="payout-job-list" aria-label={translate("payouts.title")}>
          {jobs.map((job) => {
            const isSelected = selectedJobIds.has(job.id);
            const completedAt = formatCreatedAt(job.completedAt);

            return (
              <label key={job.id} className="payout-job">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleJob(job.id)}
                />
                <span className="payout-job__summary">
                  <strong>{job.propertyName || translate("properties.unnamed")}</strong>
                  <span>
                    {completedAt || formatDate(job.scheduledDate)}
                  </span>
                </span>
                <strong>{formatPrice(job.cleanerPayout)}</strong>
              </label>
            );
          })}
        </div>

        <div className="payout-total">
          <span>{translate("payouts.total")}</span>
          <strong>{formatPrice(total)}</strong>
        </div>

        <label>
          {translate("payouts.paymentMethod")}
          <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
            <option value="">{translate("payouts.selectPaymentMethod")}</option>
            {paymentMethods.map((method) => (
              <option key={method} value={method}>
                {paymentMethodLabel(method, translate)}
              </option>
            ))}
          </select>
        </label>

        <label>
          {translate("payouts.note")}
          <textarea
            value={note}
            maxLength={500}
            rows="3"
            onChange={(event) => setNote(event.target.value)}
          />
        </label>

        <div className="proof-field">
          <span className="proof-field__label">{translate("payouts.proof")}</span>
          <PayoutProofSourcePicker
            disabled={isSubmitting || Boolean(recordedPayout)}
            onSelect={selectProof}
          />
          <span className="form-helper">{translate("payouts.proofHelper")}</span>
          {proofFile && <span className="form-helper">{translate("payouts.proofSelected", { fileName: proofFile.name })}</span>}
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}
        {proofError && <p className="form-error" role="alert">{proofError}</p>}

        {recordedPayout && (
          <p className="payout-proof-recovery" role="status">
            {translate("payouts.proofRetryMessage")}
          </p>
        )}

        <div className="button-row">
          <button className="button" type="button" disabled={isSubmitting} onClick={onBack}>
            {translate("common.cancel")}
          </button>
          <button
            className="button button--primary"
            type={recordedPayout ? "button" : "submit"}
            disabled={isSubmitting}
            onClick={recordedPayout ? retryProof : undefined}
          >
            {isSubmitting
              ? isUploadingProof
                ? translate("payouts.uploadingProof", { percent: uploadProgress })
                : translate("payouts.recording")
              : recordedPayout
                ? translate("payouts.retryProof")
                : translate("payouts.markPaid")}
          </button>
        </div>
      </form>
    </section>
  );
}
