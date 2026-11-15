import { useCallback, useEffect, useState } from "react";
import { BackButton, StateCard } from "../../components/UiPrimitives.jsx";
import { useTranslation } from "../../i18n/translations.js";
import { buildWhatsAppHandoffUrl } from "../jobs/whatsappHandoff.js";
import { cleanerHubUrl } from "../cleaners/cleanerHubAccessService.js";
import { alertSummary } from "./cleanerAlertsModel.js";
import { activationSteps, alertsText } from "./cleanerAlertsMessages.js";
import * as defaultService from "./cleanerAlertsService.js";
import "./cleanerAlerts.css";

const supported = ["pt", "en", "es"];

/** One row per active cleaner: can her phone get alerts, and what is the next step. */
export function CleanerAlertsView({ onBack, onOpenCleaner, service = defaultService }) {
  const { language } = useTranslation();
  const t = (key, values) => alertsText(language, key, values);
  const [rows, setRows] = useState(null);
  const [hasError, setHasError] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [failedId, setFailedId] = useState(null);

  const load = useCallback(async () => {
    setHasError(false);
    setRows(null);
    try {
      setRows(await service.loadCleanerAlerts());
    } catch {
      setHasError(true);
    }
  }, [service]);

  useEffect(() => { load(); }, [load]);

  async function turnOn(cleaner) {
    setBusyId(cleaner.id);
    setFailedId(null);
    try {
      await service.setCleanerPushAlerts(cleaner.id, true);
      await load();
    } catch {
      setFailedId(cleaner.id);
    } finally {
      setBusyId(null);
    }
  }

  const summary = rows ? alertSummary(rows) : null;

  return (
    <section className="cleaner-alerts" aria-labelledby="cleaner-alerts-title">
      <BackButton onClick={onBack} />
      <header className="cf-page-header">
        <div className="cf-page-header__text">
          <h2 id="cleaner-alerts-title" className="list-title">{t("title")}</h2>
          <p className="cf-page-context">{t("intro")}</p>
        </div>
        <div className="cf-page-header__actions">
          <button className="button button--small" type="button" onClick={load} disabled={!rows && !hasError}>{t("refresh")}</button>
        </div>
      </header>

      {!rows && !hasError && <StateCard message={t("loading")} status="status" />}
      {hasError && <StateCard message={t("error")} status="alert" isError />}
      {rows && rows.length === 0 && <StateCard message={t("empty")} status="status" />}

      {rows && rows.length > 0 && (
        <>
          <p className={`cleaner-alerts__summary${summary.ready === summary.total ? " cleaner-alerts__summary--done" : ""}`} role="status">
            {t("summary", summary)}
          </p>
          <ul className="cleaner-alerts__list">
            {rows.map(({ cleaner, state, devices }) => {
              const cleanerLanguage = supported.includes(cleaner.preferredLanguage) ? cleaner.preferredLanguage : language;
              const whatsapp = state === "no-device"
                ? buildWhatsAppHandoffUrl(cleaner.phone, activationSteps(cleanerLanguage, cleaner.name, cleanerHubUrl()))
                : null;
              return (
                <li key={cleaner.id} className={`cleaner-alerts__row cleaner-alerts__row--${state}`}>
                  <div className="cleaner-alerts__who">
                    <strong>{cleaner.name}</strong>
                    <span className={`cleaner-alerts__state cleaner-alerts__state--${state}`}>{t(`state.${state}`)}</span>
                  </div>
                  <p className="cleaner-alerts__next">{t(`next.${state}`, { devices })}</p>
                  <div className="cleaner-alerts__actions">
                    {state === "alerts-off" && (
                      <button className="button button--small button--primary" type="button" disabled={busyId === cleaner.id} onClick={() => turnOn(cleaner)}>
                        {busyId === cleaner.id ? t("turningOn") : t("turnOn")}
                      </button>
                    )}
                    {state === "no-device" && (whatsapp
                      ? <a className="button button--small button--primary" href={whatsapp} target="_blank" rel="noreferrer">{t("sendSteps")}</a>
                      : <small className="cleaner-alerts__hint">{t("noPhone")}</small>)}
                    {onOpenCleaner && <button className="button button--small" type="button" onClick={() => onOpenCleaner(cleaner)}>{t("openProfile")}</button>}
                  </div>
                  {failedId === cleaner.id && <p className="cleaner-alerts__error" role="alert">{t("turnOnFailed")}</p>}
                </li>
              );
            })}
          </ul>
          <p className="cleaner-alerts__privacy">{t("privacy")}</p>
        </>
      )}
    </section>
  );
}
