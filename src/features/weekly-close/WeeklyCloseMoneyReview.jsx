import { useEffect, useRef, useState } from "react";
import { hoursReviewLabel } from "../pricing/pricingMessages.js";
import { formatDate, formatPrice } from "../../lib/presentation.js";
import { loadWeeklyCloseJob } from "./weeklyCloseService.js";
import "./weeklyCloseMoneyReview.css";

export function WeeklyCloseMoneyReview({ jobs, t, translate, language, onOpenJob }) {
  const [opening, setOpening] = useState("");
  const [failed, setFailed] = useState("");
  const request = useRef(null);
  useEffect(() => () => request.current?.abort(), []);
  const incomplete = jobs.filter((job) => job.clientCharge === null || job.cleanerPayout === null);
  if (!incomplete.length) return null;

  async function openService(id) {
    request.current?.abort();
    const current = new AbortController();
    request.current = current;
    setOpening(id);
    setFailed("");
    try {
      const job = await loadWeeklyCloseJob(id);
      if (!current.signal.aborted) onOpenJob(job);
    } catch {
      if (!current.signal.aborted) setFailed(id);
    } finally {
      if (!current.signal.aborted) setOpening("");
    }
  }

  return <section className="weekly-money-review" aria-labelledby="weekly-money-heading">
    <h3 id="weekly-money-heading">{t(incomplete.length === 1 ? "moneyIssue" : "moneyIssues", { count: incomplete.length })}</h3>
    <p>{t("marginPending")}</p>
    <ul>{incomplete.map((job) => {
      const property = job.propertyName || translate("weeklyClose.unnamedProperty");
      const date = formatDate(job.serviceDate, translate, language);
      return <li key={job.id}>
        <div>
          <strong>{property}</strong>
          <small>{[date, job.clientName].filter(Boolean).join(" · ")}</small>
          {job.attentionReasons.filter((reason) => reason === "hours_review" || /^(missing|invalid)_(client_price|cleaner_payout)$/.test(reason))
            .map((reason) => <p key={reason} className="weekly-money-missing">{reason === "hours_review" ? hoursReviewLabel(language) : translate(`weeklyClose.reason.${reason}`)}</p>)}
          {job.clientCharge !== null && <small>{translate("weeklyClose.clientCharge")} · {formatPrice(job.clientCharge, translate, language)}</small>}
          {job.cleanerPayout !== null && <small>{translate("weeklyClose.cleanerPayout")} · {formatPrice(job.cleanerPayout, translate, language)}</small>}
        </div>
        <button type="button" className="button button--secondary" disabled={opening === job.id}
          aria-label={`${t("openService")} · ${property} · ${date}`} onClick={() => openService(job.id)}>
          {t(opening === job.id ? "openingService" : "openService")}
        </button>
        {failed === job.id && <p role="alert">{t("openServiceError")}</p>}
      </li>;
    })}</ul>
  </section>;
}
