import { useEffect, useMemo, useState } from "react";
import { BackButton, StateCard } from "../../components/UiPrimitives.jsx";
import { ScrollToTopButton } from "../../components/ScrollToTopButton.jsx";
import { useTranslation } from "../../i18n/translations.js";
import { formatDate, formatPrice, formatShortWeekday } from "../../lib/presentation.js";
import { buildWhatsAppHandoffUrl } from "../jobs/whatsappHandoff.js";
import { previousServiceWeek, servicePeriod, shiftServiceWeek } from "../weekly-close/weeklyCloseModel.js";
import { agendaMessage } from "./cleanerAgendaModel.js";
import { agendaStatus, agendaText, cleanerMessageCopy, supportedAgendaLanguage } from "./cleanerAgendaMessages.js";
import { loadCleanerAgenda } from "./cleanerAgendaService.js";
import "./cleanerAgenda.css";

const loadDeadlineMs = 15_000;
const localeByLanguage = { en: "en-US", pt: "pt-BR", es: "es-US" };

const thisWeek = () => shiftServiceWeek(previousServiceWeek().start, 1);
// Kept for this page session so returning from a service keeps the same view.
const remembered = { period: null, tab: "schedule", cleanerId: "" };

function shortDate(value, language) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value
    : new Intl.DateTimeFormat(localeByLanguage[language] || "en-US", { month: "short", day: "numeric" }).format(date).replace(/\.$/, "");
}

function CleanerMessageActions({ group, period, language, t }) {
  const [copyState, setCopyState] = useState(null);
  const messageLanguage = supportedAgendaLanguage(group.preferredLanguage) || language;
  const message = agendaMessage({
    group, period, copy: cleanerMessageCopy(messageLanguage),
    formatDate: (value) => shortDate(value, messageLanguage),
    formatWeekday: (value) => formatShortWeekday(value, messageLanguage),
  });
  const whatsappUrl = buildWhatsAppHandoffUrl(group.phone, message);
  const copy = () => {
    Promise.resolve().then(() => navigator.clipboard.writeText(message))
      .then(() => setCopyState("copied"), () => setCopyState("failed"));
  };
  return (
    <div className="cleaner-agenda__actions">
      <button className="button button--secondary button--small" type="button" onClick={copy}>{t("copy")}</button>
      {whatsappUrl
        ? <a className="button button--primary button--small" href={whatsappUrl} target="_blank" rel="noreferrer">{t("whatsapp")}</a>
        : <small className="cleaner-agenda__hint">{t("noPhone")}</small>}
      {copyState === "copied" && <small role="status" className="cleaner-agenda__hint">{t("copied")}</small>}
      {copyState === "failed" && <>
        <small role="alert" className="cleaner-agenda__hint">{t("copyFailed")}</small>
        <textarea className="cleaner-agenda__message" readOnly value={message} rows={Math.min(12, message.split("\n").length)}
          aria-label={t("copy")} onFocus={(event) => event.target.select()} />
      </>}
    </div>
  );
}

function ServiceRow({ entry, language, translate, t, onOpen, children }) {
  return (
    <li className="cleaner-agenda__row">
      <span className="cleaner-agenda__when">
        <strong>{formatShortWeekday(entry.date, language)} {shortDate(entry.date, language)}</strong>
        <small>{entry.start || t("noTime")}</small>
      </span>
      <span className="cleaner-agenda__where">
        <strong>{entry.propertyName || t("unnamedProperty")}</strong>
        <small>{entry.address || t("noAddress")}</small>
      </span>
      <span className="cleaner-agenda__extra">{children}</span>
      <button className="button button--small cleaner-agenda__open" type="button"
        onClick={() => onOpen(entry.jobId)} aria-label={`${t("openService")}: ${entry.propertyName || t("unnamedProperty")}, ${formatDate(entry.date, translate, language)}`}>
        {t("openService")}
      </button>
    </li>
  );
}

const countLabel = (t, count) => (count === 1 ? t("serviceOne") : t("services", { count }));

/** Manager-only, read-only views of one service period. */
export function CleanerAgendaView({ onBack, onOpenJob }) {
  const { language, translate } = useTranslation();
  const t = (key, replacements) => agendaText(language, key, replacements);
  const [period, setPeriod] = useState(() => remembered.period || thisWeek());
  const [dates, setDates] = useState(period);
  const [invalidDates, setInvalidDates] = useState(false);
  const [tab, setTab] = useState(remembered.tab);
  const [cleanerId, setCleanerId] = useState(remembered.cleanerId);
  const [refreshKey, setRefreshKey] = useState(0);
  const [model, setModel] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const applyPeriod = (next) => {
    setDates(next);
    setInvalidDates(false);
    if (next.start !== period.start || next.end !== period.end) setPeriod(next);
  };

  useEffect(() => {
    Object.assign(remembered, { period, tab, cleanerId });
  }, [period, tab, cleanerId]);

  useEffect(() => {
    let current = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), loadDeadlineMs);
    setIsLoading(true);
    setHasError(false);
    setModel(null);
    loadCleanerAgenda(period, { signal: controller.signal }).then((result) => {
      if (current) setModel(result);
    }).catch(() => {
      if (current) setHasError(true);
    }).finally(() => {
      clearTimeout(timer);
      if (current) setIsLoading(false);
    });
    return () => { current = false; controller.abort(); clearTimeout(timer); };
  }, [period, refreshKey]);

  const groups = tab === "completed" ? model?.completed : model?.schedule;
  const cleanerOptions = useMemo(() => {
    const seen = new Map();
    for (const group of [...(model?.schedule || []), ...(model?.completed || [])]) {
      if (!seen.has(group.cleanerId)) seen.set(group.cleanerId, group.name);
    }
    return [...seen.entries()];
  }, [model]);
  const visibleGroups = (groups || []).filter((group) => !cleanerId || group.cleanerId === cleanerId);
  const money = (amount) => formatPrice(amount, translate, language);
  const openService = (jobId) => {
    const job = model?.jobsById?.get(jobId);
    if (job) onOpenJob(job);
  };
  const submitDates = (event) => {
    event.preventDefault();
    try { applyPeriod(servicePeriod(dates)); } catch { setInvalidDates(true); }
  };
  const tabs = [["schedule", t("tabSchedule")], ["unassigned", t("tabUnassigned")], ["completed", t("tabCompleted")]];

  return (
    <section className="panel cleaner-agenda" aria-labelledby="cleaner-agenda-title">
      <BackButton onClick={onBack} />
      <header className="weekly-close-header">
        <div>
          <p className="eyebrow">{t("eyebrow")}</p>
          <h2 id="cleaner-agenda-title">{t("title")}</h2>
          <p className="weekly-close-dates">{formatDate(period.start, translate, language)} – {formatDate(period.end, translate, language)}</p>
        </div>
        <button className="button button--secondary" type="button" disabled={isLoading}
          onClick={() => setRefreshKey((key) => key + 1)}>{t("refresh")}</button>
      </header>
      <p className="weekly-close-note">{t("intro")}</p>

      <form className="weekly-close-controls" onSubmit={submitDates} noValidate>
        <button className="button button--secondary" type="button" onClick={() => applyPeriod(previousServiceWeek())}>{t("lastWeek")}</button>
        <button className="button button--secondary" type="button" onClick={() => applyPeriod(thisWeek())}>{t("thisWeek")}</button>
        <button className="button button--secondary" type="button" onClick={() => applyPeriod(shiftServiceWeek(thisWeek().start, 1))}>{t("nextWeek")}</button>
        <label>{t("start")}
          <input id="cleaner-agenda-start" type="date" value={dates.start} aria-invalid={invalidDates}
            onChange={(event) => { const start = event.target.value; setDates((old) => ({ ...old, start })); setInvalidDates(false); }} />
        </label>
        <label>{t("end")}
          <input id="cleaner-agenda-end" type="date" value={dates.end} aria-invalid={invalidDates}
            onChange={(event) => { const end = event.target.value; setDates((old) => ({ ...old, end })); setInvalidDates(false); }} />
        </label>
        <button className="button button--secondary" type="submit">{t("apply")}</button>
      </form>
      {invalidDates && <StateCard message={t("invalidPeriod")} status="alert" isError />}

      <div className="cleaner-agenda__tabs" role="group" aria-label={t("title")}>
        {tabs.map(([value, label]) => (
          <button key={value} type="button" aria-pressed={tab === value}
            className={`job-filter-chip${tab === value ? " job-filter-chip--active" : ""}`}
            onClick={() => setTab(value)}>
            {label}
            {model && <span className="cleaner-agenda__count">
              {value === "unassigned" ? model.unassigned.length
                : (value === "completed" ? model.completed : model.schedule).reduce((sum, group) => sum + group.rows.length, 0)}
            </span>}
          </button>
        ))}
      </div>

      {isLoading && <StateCard message={t("loading")} status="status" />}
      {hasError && <StateCard message={t("error")} status="alert" isError />}
      {model && !isLoading && !hasError && <>
        {model.coverage?.truncated && <p role="status" className="weekly-close-attention">{t("partial", { limit: model.coverage.limit })}</p>}

        {tab !== "unassigned" && cleanerOptions.length > 1 && (
          <div className="weekly-close-controls">
            <label>{t("cleaner")}
              <select id="cleaner-agenda-cleaner" value={cleanerId} onChange={(event) => setCleanerId(event.target.value)}>
                <option value="">{t("allCleaners")}</option>
                {cleanerOptions.map(([id, name]) => <option key={id} value={id}>{name || t("unnamedCleaner")}</option>)}
              </select>
            </label>
          </div>
        )}

        {tab === "schedule" && <p className="weekly-close-note">{t("privacy")}</p>}

        {tab === "unassigned" && (model.unassigned.length === 0
          ? <StateCard message={t("emptyUnassigned")} status="status" />
          : <ul className="cleaner-agenda__rows">
            {model.unassigned.map((entry) => (
              <ServiceRow key={entry.jobId} entry={entry} language={language} translate={translate} t={t} onOpen={openService}>
                <span className="cleaner-agenda__badge">{agendaStatus(language, entry.status)}</span>
                {entry.required > 1 && <small>{t("spots", { filled: entry.filled, required: entry.required })}
                  {entry.cleanerNames.length > 0 && ` · ${entry.cleanerNames.join(", ")}`}</small>}
              </ServiceRow>
            ))}
          </ul>)}

        {tab !== "unassigned" && (visibleGroups.length === 0
          ? <StateCard message={t(tab === "completed" ? "emptyCompleted" : "emptySchedule")} status="status" />
          : <div className="cleaner-agenda__groups">
            {visibleGroups.map((group) => (
              <article className="cleaner-agenda__group" key={group.cleanerId} aria-labelledby={`cleaner-agenda-${tab}-${group.cleanerId}`}>
                <header className="cleaner-agenda__group-header">
                  <div>
                    <h3 id={`cleaner-agenda-${tab}-${group.cleanerId}`}>{group.name || t("unnamedCleaner")}</h3>
                    <small>{countLabel(t, group.rows.length)}</small>
                  </div>
                  {tab === "schedule" && <CleanerMessageActions group={group} period={period} language={language} t={t} />}
                  {tab === "completed" && <div className="cleaner-agenda__total">
                    <small>{t(group.total === null ? "knownTotal" : "total")}</small>
                    <strong>{money(group.total === null ? group.knownTotal : group.total)}</strong>
                    {group.total === null && <small className="cleaner-agenda__warning">{t("totalIncomplete", { count: group.unknownCount })}</small>}
                  </div>}
                </header>
                <ul className="cleaner-agenda__rows">
                  {group.rows.map((entry) => (
                    <ServiceRow key={entry.jobId} entry={entry} language={language} translate={translate} t={t} onOpen={openService}>
                      {tab === "schedule" && <span className="cleaner-agenda__badge">{agendaStatus(language, entry.status)}</span>}
                      {tab === "completed" && (entry.payout === null
                        ? <small>{entry.shared ? t("shared") : t("payoutUnknown")}</small>
                        : <strong className="cleaner-agenda__payout">{money(entry.payout)}</strong>)}
                    </ServiceRow>
                  ))}
                </ul>
              </article>
            ))}
          </div>)}
      </>}
      <ScrollToTopButton />
    </section>
  );
}
