import { useEffect, useState } from "react";
import { BackButton, StateCard } from "../../components/UiPrimitives.jsx";
import { ScrollToTopButton } from "../../components/ScrollToTopButton.jsx";
import { useTranslation } from "../../i18n/translations.js";
import { formatDate, formatPrice } from "../../lib/presentation.js";
import { previousServiceWeek, servicePeriod, shiftServiceWeek } from "./weeklyCloseModel.js";
import { loadWeeklyClose } from "./weeklyCloseService.js";
import { periodMessage } from "./weeklyClosePeriodMessages.js";

const loadDeadlineMs = 15_000;

/** Manager-only reconciliation; no invoice, payment or record-editing controls. */
export function WeeklyClosePreview({ onBack }) {
  const { language, translate } = useTranslation();
  const [period, setPeriod] = useState(previousServiceWeek);
  const [dates, setDates] = useState(period);
  const [invalidDates, setInvalidDates] = useState(false);
  const [selectedClient, setSelectedClient] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [model, setModel] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const t = (key, replacements) => periodMessage(language, key, replacements);
  const applyPeriod = (next) => {
    setDates(next);
    setInvalidDates(false);
    if (next.start === period.start && next.end === period.end) return;
    setSelectedClient("");
    setIsLoading(true);
    setHasError(false);
    setModel(null);
    setPeriod(next);
  };

  useEffect(() => {
    let current = true;
    let pending = true;
    let timer;
    const controller = new AbortController();
    const expiresAt = Date.now() + loadDeadlineMs;
    const checkDeadline = () => {
      if (current && pending && Date.now() >= expiresAt) {
        current = false;
        controller.abort();
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
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error("weekly-close-timeout"));
      }, loadDeadlineMs);
    });
    Promise.race([loadWeeklyClose(period, { signal: controller.signal }), deadline]).then((result) => {
      if (Date.now() >= expiresAt) throw new Error("weekly-close-timeout");
      if (current) {
        setModel(result);
        setSelectedClient((key) => result.clients.some((client) => client.key === key) ? key : "");
      }
    }).catch(() => {
      if (current) setHasError(true);
    }).finally(() => {
      pending = false;
      clearTimeout(timer);
      if (current) setIsLoading(false);
    });
    return () => {
      current = false; controller.abort(); clearTimeout(timer);
      window.removeEventListener("pageshow", checkDeadline);
      window.removeEventListener("online", checkDeadline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [period, refreshKey]);

  const activeClient = model?.clients.find((client) => client.key === selectedClient);
  const visibleClients = activeClient ? [activeClient] : model?.clients;
  const totals = activeClient || model?.overall;
  const isPartial = model?.coverage?.truncated === true;
  const money = (amount) => amount === null || amount === undefined
    ? translate("weeklyClose.unknown") : formatPrice(amount, translate, language);
  const metrics = totals ? [
    ["clientCharges", totals.clientCharges, totals.knownClientCharges],
    ["cleanerPayoutTotal", totals.cleanerPayoutTotal, totals.knownCleanerPayoutTotal],
    ["cleanerPaidTotal", totals.cleanerPaidTotal, totals.knownCleanerPaidTotal],
    ["cleanerOutstandingTotal", totals.cleanerOutstandingTotal, totals.knownCleanerOutstandingTotal],
    ["grossOperationalMargin", totals.grossOperationalMargin, totals.knownGrossOperationalMargin],
  ] : [];
  const aggregateMoney = (amount) => amount === null
    ? translate("weeklyClose.incomplete") : money(amount);
  const pendingCount = (totals, key) => key === "clientCharges" ? totals.missingClientPriceCount
    : key === "cleanerPayoutTotal" ? totals.missingCleanerPayoutCount
    : key === "grossOperationalMargin" ? totals.missingGrossMarginCount : totals.unknownPayoutCount;
  const pendingCopy = (count) => translate(count === 1
    ? "weeklyClose.pendingService" : "weeklyClose.pendingServices", { count });
  const exclusionCount = model && !activeClient ? Object.values(model.excluded).reduce((total, count) => total + count, 0) : 0;
  const applyDates = (event) => {
    event.preventDefault();
    try { applyPeriod(servicePeriod(dates)); }
    catch { setInvalidDates(true); }
  };

  return (
    <section className="panel weekly-close-preview" aria-labelledby="weekly-close-title">
      <BackButton onClick={onBack} />
      <header className="weekly-close-header">
        <div>
          <p className="eyebrow">{translate("weeklyClose.preview")}</p>
          <h2 id="weekly-close-title">{translate("weeklyClose.title")}</h2>
          <p className="weekly-close-dates">{formatDate(period.start, translate, language)} – {formatDate(period.end, translate, language)}</p>
        </div>
        <button className="button button--secondary" type="button" disabled={isLoading}
          onClick={() => setRefreshKey((key) => key + 1)}>{translate("weeklyClose.refresh")}</button>
      </header>
      <p className="weekly-close-note">{t("dateRule")}</p>
      <form className="weekly-close-controls" onSubmit={applyDates} noValidate>
        <button className="button button--secondary" type="button"
          onClick={() => applyPeriod(shiftServiceWeek(period.start, -1))}>{translate("weeklyClose.previous")}</button>
        <button className="button button--secondary" type="button"
          onClick={() => applyPeriod(shiftServiceWeek(previousServiceWeek().start, 1))}>{translate("weeklyClose.thisWeek")}</button>
        <label>{t("start")}
          <input type="date" value={dates.start} aria-invalid={invalidDates} onChange={(event) => {
            const start = event.target.value;
            setDates((old) => ({ ...old, start }));
            setInvalidDates(false);
          }} />
        </label>
        <label>{t("end")}
          <input type="date" value={dates.end} aria-invalid={invalidDates} onChange={(event) => {
            const end = event.target.value;
            setDates((old) => ({ ...old, end }));
            setInvalidDates(false);
          }} />
        </label>
        <button className="button button--secondary" type="submit">{t("apply")}</button>
      </form>
      {invalidDates && <StateCard message={t("invalidPeriod")} status="alert" isError />}
      <p className="weekly-close-note">{translate("weeklyClose.externalPayments")}</p>
      {isLoading && <StateCard message={t("loading")} status="status" />}
      {hasError && <StateCard message={t("error")} status="alert" isError />}
      {model && !isLoading && !hasError && <>
        {isPartial && <p role="status" className="weekly-close-attention">{t("partial", { limit: model.coverage.limit })}</p>}
        {model.clients.length > 0 && <div className="weekly-close-controls">
          <div>
            <label htmlFor="weekly-close-client-filter">{t("client")}</label>
            <select id="weekly-close-client-filter" value={selectedClient} aria-describedby="weekly-close-client-scope"
              onChange={(event) => setSelectedClient(event.target.value)}>
              <option value="">{t("allClients")}</option>
              {model.clients.map((client) => (
                <option key={client.key} value={client.key}>{client.clientName || t("unnamedClient")}</option>
              ))}
            </select>
          </div>
          <small id="weekly-close-client-scope">{t("clientScope")}</small>
        </div>}
        <dl className="weekly-close-metrics">
          <div><dt>{isPartial ? t("loadedCount") : translate("weeklyClose.completedServiceCount")}</dt><dd>{totals.completedServiceCount}</dd></div>
          {metrics.map(([key, amount, known]) => <div key={key}>
            <dt>{translate(`weeklyClose.${key}`)}</dt><dd>{aggregateMoney(amount)}</dd>
            {amount === null && <small>{translate("weeklyClose.knownSubtotal", { amount: money(known) })}</small>}
            {amount === null && pendingCount(totals, key) > 0 && <small>{pendingCopy(pendingCount(totals, key))}</small>}
          </div>)}
        </dl>
        {(!isPartial || totals.attentionCount > 0) && <p className={totals.attentionCount > 0 ? "weekly-close-attention" : "weekly-close-note"} role="status">
          {totals.attentionCount > 0
            ? t("attention", { count: totals.attentionCount })
            : translate("weeklyClose.completeData")}
          {totals.unknownPayoutCount > 0 && ` ${translate("weeklyClose.unknownPayoutSummary", { count: totals.unknownPayoutCount })}`}
        </p>}
        <p className="weekly-close-note">{translate("weeklyClose.marginNote")}</p>
        {exclusionCount > 0 && <details className="weekly-close-exclusions">
          <summary>{translate("weeklyClose.excludedSummary", { count: exclusionCount })}</summary>
          <ul>{Object.entries(model.excluded).filter(([, count]) => count > 0).map(([reason, count]) =>
            <li key={reason}>{translate(`weeklyClose.excluded.${reason}`, { count })}</li>)}</ul>
        </details>}
        {totals.completedServiceCount === 0 && <StateCard message={t(isPartial ? "emptyPartial" : "empty")} status="status" />}
        <div className="weekly-close-clients">
          {visibleClients.map((client) => <details className="weekly-close-client" key={client.key}>
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
