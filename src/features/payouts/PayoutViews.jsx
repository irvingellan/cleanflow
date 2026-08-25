import { useMemo, useState } from "react";
import { useTranslation } from "../../i18n/translations.js";

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

export function PayoutDirectory({
  payoutGroups,
  isLoading,
  hasError,
  paidSummary,
  onRefresh,
  onReview,
  formatPrice,
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
    </section>
  );
}

export function PayoutReview({ cleaner, jobs, onBack, onRecord, formatDate, formatCreatedAt, formatPrice }) {
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
      await onRecord({
        cleaner,
        jobIds: [...selectedJobIds],
        paymentMethod,
        note,
      });
    } catch (recordError) {
      setError(
        recordError.code === "job-not-payable"
          ? translate("payouts.jobNoLongerPayable")
          : translate("payouts.recordError"),
      );
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

        {error && <p className="form-error" role="alert">{error}</p>}

        <div className="button-row">
          <button className="button" type="button" disabled={isSubmitting} onClick={onBack}>
            {translate("common.cancel")}
          </button>
          <button className="button button--primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? translate("payouts.recording") : translate("payouts.markPaid")}
          </button>
        </div>
      </form>
    </section>
  );
}
