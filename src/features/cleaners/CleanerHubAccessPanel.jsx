import { useCallback, useEffect, useState } from "react";
import { translateInLanguage, useTranslation } from "../../i18n/translations.js";
import * as defaultService from "./cleanerHubAccessService.js";

function formatWhen(iso, language) {
  if (!iso) return "";
  return new Intl.DateTimeFormat(language === "pt" ? "pt-BR" : language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

/**
 * Explicit manager action that lets one existing Cleaner open her own agenda.
 * Assignments themselves need no extra step: they appear in the Hub on their own.
 */
export function CleanerHubAccessPanel({ cleaner, service = defaultService }) {
  const { language, translate } = useTranslation();
  const [access, setAccess] = useState(null);
  const [issued, setIssued] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [alerts, setAlerts] = useState(cleaner.pushAlertsEnabled === true);
  const [alertsError, setAlertsError] = useState(false);
  const eligible = cleaner.active !== false && !cleaner.archivedAt;
  const url = service.cleanerHubUrl();

  const load = useCallback(async () => {
    try {
      setAccess(await service.getCleanerHubAccess(cleaner.id));
    } catch {
      setError(true);
    }
  }, [cleaner.id, service]);

  useEffect(() => { setIssued(null); setAccess(null); load(); }, [load]);
  useEffect(() => { setAlerts(cleaner.pushAlertsEnabled === true); }, [cleaner.id, cleaner.pushAlertsEnabled]);

  async function toggleAlerts() {
    const next = !alerts;
    setBusy("alerts");
    setAlertsError(false);
    try {
      await service.setCleanerPushAlerts(cleaner.id, next);
      setAlerts(next);
    } catch {
      setAlertsError(true);
    } finally {
      setBusy(null);
    }
  }

  async function issue(additionalDevice = false) {
    setBusy(additionalDevice ? "additional" : "issue");
    setError(false);
    setCopied(false);
    try {
      setIssued(additionalDevice
        ? await service.issueCleanerAccessCode(cleaner.id, { additionalDevice: true })
        : await service.issueCleanerAccessCode(cleaner.id));
      await load();
    } catch {
      setError(true);
    } finally {
      setBusy(null);
    }
  }

  async function revoke() {
    if (!window.confirm(translate("cleanerHub.revokeConfirm"))) return;
    setBusy("revoke");
    setError(false);
    try {
      await service.revokeCleanerHubAccess(cleaner.id);
      setIssued(null);
      await load();
    } catch {
      setError(true);
    } finally {
      setBusy(null);
    }
  }

  const message = issued
    ? translateInLanguage(cleaner.preferredLanguage || language, "cleanerHub.message", { url, code: issued.code })
    : "";

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="cleaner-profile-section" aria-labelledby="cleaner-hub-access-title">
      <h3 id="cleaner-hub-access-title">{translate("cleanerHub.title")}</h3>
      <p>{translate("cleanerHub.intro", { url })}</p>
      {!access && !error && <p className="property-history-state">{translate("cleanerHub.loading")}</p>}
      {access && (
        <p className="property-history-state" data-testid="cleaner-hub-status">
          {access.active
            ? translate("cleanerHub.statusLinked", { date: formatWhen(access.linkedAt, language) })
            : access.revokedAt
              ? translate("cleanerHub.statusRevoked", { date: formatWhen(access.revokedAt, language) })
              : translate("cleanerHub.statusNone")}
          {access.pendingCodeExpiresAt && !issued && <> {translate("cleanerHub.pendingCode", { date: formatWhen(access.pendingCodeExpiresAt, language) })}</>}
        </p>
      )}
      {issued && (
        <div className="cleaner-hub-code" role="status">
          <p><strong className="cleaner-hub-code__value">{issued.code}</strong></p>
          <p>{translate("cleanerHub.codeShown", { date: formatWhen(issued.expiresAt, language) })}</p>
          <p className="cleaner-hub-code__message">{message}</p>
          <button className="button" type="button" onClick={copy}>{translate(copied ? "cleanerHub.copied" : "cleanerHub.copy")}</button>
        </div>
      )}
      {!eligible && <p className="property-history-state">{translate("cleanerHub.inactive")}</p>}
      {error && <p className="property-history-state property-history-state--error" role="alert">{translate("cleanerHub.error")}</p>}
      <div className="button-row">
        <button className="button button--primary" type="button" onClick={() => issue()} disabled={!eligible || Boolean(busy)}>
          {translate(busy === "issue" ? "cleanerHub.issuing" : access?.active || access?.pendingCodeExpiresAt ? "cleanerHub.issueAgain" : "cleanerHub.issue")}
        </button>
        {access?.active && (
          <button className="button" type="button" onClick={() => issue(true)} disabled={!eligible || Boolean(busy)}>
            {translate(busy === "additional" ? "cleanerHub.issuing" : "cleanerHub.additionalDevice")}
          </button>
        )}
        {(access?.active || access?.pendingCodeExpiresAt) && (
          <button className="button" type="button" onClick={revoke} disabled={Boolean(busy)}>
            {translate(busy === "revoke" ? "cleanerHub.revoking" : "cleanerHub.revoke")}
          </button>
        )}
      </div>
      {service.setCleanerPushAlerts && eligible && (
        <div className="cleaner-push-alerts">
          <label className="cleaner-push-alerts__row">
            <input type="checkbox" role="switch" checked={alerts} disabled={Boolean(busy)} onChange={toggleAlerts} />
            <span>
              <strong>{translate("cleanerHub.alertsTitle")}</strong>
              <span>{translate(alerts ? "cleanerHub.alertsOn" : "cleanerHub.alertsOff")}</span>
            </span>
          </label>
          {alertsError && <p className="property-history-state property-history-state--error" role="alert">{translate("cleanerHub.alertsError")}</p>}
        </div>
      )}
    </section>
  );
}
