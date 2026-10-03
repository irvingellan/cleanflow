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
    let pending = true;
    let timer;
    const expiresAt = Date.now() + loadDeadlineMs;
    const checkDeadline = () => {
      if (current && pending && Date.now() >= expiresAt) {
        current = false;
        clearTimeout(timer);
        setModel(null);
        setHasError(true);
        setIsLoading(false);
      }
    };
    const onVisible = () => { if (document.visibilityState === "visible") checkDeadline(); };
    window.addEventListener("pageshow", checkDeadline);
    window.addEventListener("online", checkDeadline);
    document.addEventListener("visibilitychange", onVisible);
    setIsLoading(true);
    setHasError(false);
    setModel(null);
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("weekly-close-timeout")), loadDeadlineMs);
    });
    Promise.race([loadWeeklyClose(weekStart), deadline]).then((result) => {
      if (Date.now() >= expiresAt) throw new Error("weekly-close-timeout");
      if (current) setModel(result);
    }).catch(() => {
      if (current) setHasError(true);
    }).finally(() => {
      pending = false;
      clearTimeout(timer);
      if (current) setIsLoading(false);
    });
    return () => {
      current = false; clearTimeout(timer);
      window.removeEventListener("pageshow", checkDeadline);
      window.removeEventListener("online", checkDeadline);
      document.removeEventListener("visibilitychange", onVisible);
    };
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
  const aggregateMoney = (amount) => amount === null
    ? translate("weeklyClose.incomplete") : money(amount);
  const pendingCount = (totals, key) => key === "clientCharges" ? totals.missingClientPriceCount
    : key === "cleanerPayoutTotal" ? totals.missingCleanerPayoutCount
    : key === "grossOperationalMargin" ? totals.missingGrossMarginCount : totals.unknownPayoutCount;
  const pendingCopy = (count) => translate(count === 1
    ? "weeklyClose.pendingService" : "weeklyClose.pendingServices", { count });
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
            <dt>{translate(`weeklyClose.${key}`)}</dt><dd>{aggregateMoney(amount)}</dd>
            {amount === null && <small>{translate("weeklyClose.knownSubtotal", { amount: money(known) })}</small>}
            {amount === null && pendingCount(model.overall, key) > 0 && <small>{pendingCopy(pendingCount(model.overall, key))}</small>}
          </div>)}
        </dl>
        <p className={model.overall.attentionCount > 0 ? "weekly-close-attention" : "weekly-close-note"} role="status">
          {model.overall.attentionCount > 0
            ? translate("weeklyClose.attentionSummary", { count: model.overall.attentionCount })
            : translate("weeklyClose.completeData")}
          {model.overall.unknownPayoutCount > 0 && ` ${translate("weeklyClose.unknownPayoutSummary", { count: model.overall.unknownPayoutCount })}`}
        </p>
        <p className="weekly-close-note">{translate("weeklyClose.marginNote")}</p>
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
              {[["clientCharges", "knownClientCharges"], ["cleanerPayoutTotal", "knownCleanerPayoutTotal"],
                ["grossOperationalMargin", "knownGrossOperationalMargin"]].map(([key, knownKey]) => <span key={key}>
                <small>{translate(`weeklyClose.${key}`)}</small><strong>{aggregateMoney(client[key])}</strong>
                {client[key] === null && <small>{translate("weeklyClose.knownSubtotal", { amount: money(client[knownKey]) })}</small>}
                {client[key] === null && pendingCount(client, key) > 0 && <small>{pendingCopy(pendingCount(client, key))}</small>}
              </span>)}
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
