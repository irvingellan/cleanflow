import { useEffect, useState } from "react";
import { BackButton, StateCard } from "../../components/UiPrimitives.jsx";
import { ScrollToTopButton } from "../../components/ScrollToTopButton.jsx";
import { useTranslation } from "../../i18n/translations.js";
import { formatDate, formatPrice } from "../../lib/presentation.js";
import { previousServiceWeek, serviceWeekForDate, shiftServiceWeek } from "./weeklyCloseModel.js";
import { loadWeeklyClose } from "./weeklyCloseService.js";

const loadDeadlineMs = 15_000;

/** Manager-only reconciliation; no invoice, payment or record-editing controls. */
export function WeeklyClosePreview({ onBack }) {
  const { language, translate } = useTranslation();
  const [weekStart, setWeekStart] = useState(() => previousServiceWeek().start);
  const [refreshKey, setRefreshKey] = useState(0);
  const [model, setModel] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let current = true;
    let timer;
    setIsLoading(true);
    setHasError(false);
    setModel(null);
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("weekly-close-timeout")), loadDeadlineMs);
    });
    Promise.race([loadWeeklyClose(weekStart), deadline]).then((result) => {
      if (current) setModel(result);
    }).catch(() => {
      if (current) setHasError(true);
    }).finally(() => {
      clearTimeout(timer);
      if (current) setIsLoading(false);
    });
    return () => { current = false; clearTimeout(timer); };
  }, [weekStart, refreshKey]);

  const week = serviceWeekForDate(weekStart);
  const money = (amount) => amount === null || amount === undefined
    ? translate("weeklyClose.unknown") : formatPrice(amount, translate, language);
  const metrics = model ? [
    ["clientCharges", model.overall.clientCharges, model.overall.knownClientCharges],
    ["cleanerPayoutTotal", model.overall.cleanerPayoutTotal, model.overall.knownCleanerPayoutTotal],
    ["cleanerPaidTotal", model.overall.cleanerPaidTotal, model.overall.knownCleanerPaidTotal],
    ["cleanerOutstandingTotal", model.overall.cleanerOutstandingTotal, model.overall.knownCleanerOutstandingTotal],
    ["grossOperationalMargin", model.overall.grossOperationalMargin, model.overall.knownGrossOperationalMargin],
  ] : [];
  const exclusionCount = model ? Object.values(model.excluded).reduce((total, count) => total + count, 0) : 0;

  return (
    <section className="panel weekly-close-preview" aria-labelledby="weekly-close-title">
      <BackButton onClick={onBack} />
      <header className="weekly-close-header">
        <div>
          <p className="eyebrow">{translate("weeklyClose.preview")}</p>
          <h2 id="weekly-close-title">{translate("weeklyClose.title")}</h2>
          <p className="weekly-close-dates">{formatDate(week.start, translate, language)} – {formatDate(week.end, translate, language)}</p>
        </div>
        <button className="button button--secondary" type="button" disabled={isLoading}
          onClick={() => setRefreshKey((key) => key + 1)}>{translate("weeklyClose.refresh")}</button>
      </header>
      <p className="weekly-close-note">{translate("weeklyClose.rule")}</p>
      <div className="weekly-close-controls">
        <button className="button button--secondary" type="button"
          onClick={() => setWeekStart(shiftServiceWeek(weekStart, -1).start)}>{translate("weeklyClose.previous")}</button>
        <button className="button button--secondary" type="button" onClick={() => {
          setWeekStart(shiftServiceWeek(previousServiceWeek().start, 1).start);
        }}>{translate("weeklyClose.thisWeek")}</button>
        <label>{translate("weeklyClose.weekStarting")}
          <input type="date" value={weekStart} onChange={(event) => {
            if (event.target.value) setWeekStart(serviceWeekForDate(event.target.value).start);
          }} />
        </label>
      </div>
      <p className="weekly-close-note">{translate("weeklyClose.externalPayments")}</p>
      {isLoading && <StateCard message={translate("weeklyClose.loading")} status="status" />}
      {hasError && <StateCard message={translate("weeklyClose.error")} status="alert" isError />}
      {model && !isLoading && !hasError && <>
        <dl className="weekly-close-metrics">
          <div><dt>{translate("weeklyClose.completedServiceCount")}</dt><dd>{model.overall.completedServiceCount}</dd></div>
          {metrics.map(([key, amount, known]) => <div key={key}>
            <dt>{translate(`weeklyClose.${key}`)}</dt><dd>{money(amount)}</dd>
            {amount === null && <small>{translate("weeklyClose.knownSubtotal", { amount: money(known) })}</small>}
          </div>)}
        </dl>
        <p className="weekly-close-note">{translate("weeklyClose.marginNote")}</p>
        {model.overall.attentionCount > 0 && <p className="weekly-close-attention" role="status">
          {translate("weeklyClose.attentionSummary", { count: model.overall.attentionCount })}
          {model.overall.unknownPayoutCount > 0 && ` ${translate("weeklyClose.unknownPayoutSummary", { count: model.overall.unknownPayoutCount })}`}
        </p>}
        {exclusionCount > 0 && <details className="weekly-close-exclusions">
          <summary>{translate("weeklyClose.excludedSummary", { count: exclusionCount })}</summary>
          <ul>{Object.entries(model.excluded).filter(([, count]) => count > 0).map(([reason, count]) =>
            <li key={reason}>{translate(`weeklyClose.excluded.${reason}`, { count })}</li>)}</ul>
        </details>}
        {model.overall.completedServiceCount === 0 && <StateCard message={translate("weeklyClose.empty")} status="status" />}
        <div className="weekly-close-clients">
          {model.clients.map((client) => <details className="weekly-close-client" key={client.key}>
            <summary>
              <span><strong>{client.clientName || translate("weeklyClose.unnamedClient")}</strong>
                <small>{translate("weeklyClose.services", { count: client.serviceCount })}
                  {client.attentionCount > 0 && ` · ${translate("weeklyClose.needsAttention", { count: client.attentionCount })}`}</small>
              </span>
              <span><small>{translate("weeklyClose.clientCharges")}</small><strong>{money(client.clientCharges)}</strong></span>
              <span><small>{translate("weeklyClose.cleanerPayoutTotal")}</small><strong>{money(client.cleanerPayoutTotal)}</strong></span>
              <span><small>{translate("weeklyClose.grossOperationalMargin")}</small><strong>{money(client.grossOperationalMargin)}</strong></span>
            </summary>
            <ul className="weekly-close-services">
              {client.jobs.map((job) => <li className="weekly-close-job" key={job.id}>
                <dl>
                  <div><dt>{translate("common.property")}</dt><dd><strong>{job.propertyName || translate("weeklyClose.unnamedProperty")}</strong>
                    <small>{job.cleanerNames?.length ? job.cleanerNames.join(" · ") : translate("weeklyClose.cleanerNotResolved")}</small></dd></div>
                  <div><dt>{translate("weeklyClose.serviceDate")}</dt><dd>{formatDate(job.serviceDate, translate, language)}</dd></div>
                  <div><dt>{translate("weeklyClose.clientCharge")}</dt><dd>{money(job.clientCharge)}</dd></div>
                  <div><dt>{translate("weeklyClose.cleanerPayout")}</dt><dd>{money(job.cleanerPayout)}</dd></div>
                  <div><dt>{translate("weeklyClose.payoutStatus")}</dt><dd><span className={`weekly-close-status weekly-close-status--${job.payoutStatus.toLowerCase()}`}>
                    {translate(`weeklyClose.status.${job.payoutStatus}`)}</span></dd></div>
                </dl>
                {job.attentionReasons.length > 0 && <ul className="weekly-close-reasons">
                  {job.attentionReasons.map((reason) => <li key={reason}>{translate(`weeklyClose.reason.${reason}`)}</li>)}
                </ul>}
              </li>)}
            </ul>
          </details>)}
        </div>
      </>}
      <ScrollToTopButton />
    </section>
  );
}
