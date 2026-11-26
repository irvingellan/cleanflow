import { useEffect, useState } from "react";
import { formatCreatedAt } from "../../lib/presentation.js";
import { formatPricingRate } from "../pricing/pricingMessages.js";
import { resolveJobPricing } from "../pricing/pricingModel.js";
import { JobDetailSection } from "./JobDetailSection.jsx";
import { JobPriceFields } from "./JobPriceFields.jsx";
import { jobPriceFormValues, readClientPriceCorrection } from "./jobPricingForm.js";
import { subscribeToJobPriceCorrections } from "./jobPriceCorrectionService.js";

export function JobPriceCorrectionForm({ job, translate, onCorrectPrice }) {
  const [values, setValues] = useState(null);
  const [reason, setReason] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [saving, setSaving] = useState(false);

  function start() {
    setValues(jobPriceFormValues(resolveJobPricing(job), job));
    setReason("");
    setFeedback(null);
  }

  async function save(event) {
    event.preventDefault();
    const clientPricing = readClientPriceCorrection(values);
    const note = reason.trim();
    if (!clientPricing || note.length < 3 || note.length > 200 || /[\p{Cc}\p{Cs}]/u.test(note)) {
      setFeedback({ error: clientPricing ? "jobs.correctionReasonInvalid" : "jobs.priceInvalid" });
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      const result = await onCorrectPrice({ clientPricing, reason: note });
      setValues(null);
      setFeedback({ status: result?.unchanged ? "jobs.correctionUnchanged" : "jobs.pricesSaved" });
    } catch {
      setFeedback({ error: "jobs.priceUpdateError" });
    } finally {
      setSaving(false);
    }
  }

  if (!values) {
    return <>
      <button className="button" type="button" onClick={start}>{translate("jobs.correctPrice")}</button>
      {feedback?.status && <p className="form-success" role="status">{translate(feedback.status)}</p>}
    </>;
  }
  return (
    <form className="cleaning-form" noValidate onSubmit={save}>
      <JobPriceFields clientOnly values={values} disabled={saving}
        onChange={({ target: { name, value } }) => setValues((current) => ({ ...current, [name]: value }))} />
      <label>
        {translate("jobs.correctionReason")}
        <input name="reason" value={reason} required minLength={3} maxLength={200} disabled={saving}
          onChange={(event) => setReason(event.target.value)} />
      </label>
      {feedback?.error && <p className="form-error" role="alert">{translate(feedback.error)}</p>}
      <div className="button-row">
        <button className="button" type="button" disabled={saving} onClick={() => setValues(null)}>
          {translate("common.cancel")}
        </button>
        <button className="button button--primary" type="submit" disabled={saving}>
          {translate(saving ? "jobs.savingPrices" : "jobs.savePrices")}
        </button>
      </div>
    </form>
  );
}

function formatCorrectionPrice(pricing, language, translate) {
  const amount = pricing.hourlyRateCents ?? pricing.amountCents;
  return formatPricingRate({
    ...pricing,
    rateCents: pricing.hourlyRateCents,
    state: amount == null ? "needs_review" : "ready",
  }, language, translate);
}

export function JobPriceCorrections({ jobId, translate, language }) {
  const [corrections, setCorrections] = useState([]);
  useEffect(() => subscribeToJobPriceCorrections(jobId, setCorrections, () => setCorrections([])), [jobId]);
  const prices = corrections.filter((correction) => correction.kind === "CLIENT_PRICE");
  if (!prices.length) return null;
  return (
    <JobDetailSection jobId={jobId} title={translate("jobs.corrections")}>
      <ul>
        {prices.map(({ id, at, before, after, reason }) => (
          <li key={id}>
            <p>{formatCreatedAt(at, language)}</p>
            <p>{formatCorrectionPrice(before, language, translate)} → {formatCorrectionPrice(after, language, translate)}</p>
            <p>{reason}</p>
          </li>
        ))}
      </ul>
    </JobDetailSection>
  );
}
