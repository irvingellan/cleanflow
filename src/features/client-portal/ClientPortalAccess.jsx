import { useEffect, useState } from "react";
import { useTranslation } from "../../i18n/translations.js";
import { formatDate } from "../../lib/presentation.js";
import { getClientPortalAccess, issueClientPortalAccess, revokeClientPortalAccess } from "./clientPortalService.js";
import "./clientPortal.css";

/**
 * The manager creates, copies and turns off one client's private portal link.
 * The link is shown only right after it is created; creating a new one turns
 * the earlier link off.
 */
export function ClientPortalAccess({ clientId, load = getClientPortalAccess, issue = issueClientPortalAccess, revoke = revokeClientPortalAccess }) {
  const { language, translate } = useTranslation();
  const [access, setAccess] = useState(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let current = true;
    setAccess(null); setUrl(""); setError(false); setCopied(false);
    load(clientId).then((result) => { if (current) setAccess(result); })
      .catch(() => { if (current) { setAccess({ state: "NONE" }); setError(true); } });
    return () => { current = false; };
  }, [clientId, load]);

  const run = async (action) => {
    setBusy(true); setError(false); setCopied(false);
    try { await action(); } catch { setError(true); } finally { setBusy(false); }
  };
  const create = () => run(async () => {
    const { url: created, ...state } = await issue(clientId);
    setAccess(state); setUrl(created);
  });
  const turnOff = () => run(async () => { setAccess(await revoke(clientId)); setUrl(""); });
  const copy = () => run(async () => { await navigator.clipboard.writeText(url); setCopied(true); });
  const active = access?.state === "ACTIVE";
  const expires = active && access.expiresAt ? formatDate(access.expiresAt.slice(0, 10), translate, language) : null;

  return (
    <section className="client-properties client-portal-access" aria-labelledby="client-portal-access-title">
      <h3 id="client-portal-access-title">{translate("clientPortal.accessTitle")}</h3>
      <p>{translate("clientPortal.accessHelp")}</p>
      {access === null ? <p role="status">{translate("clientPortal.accessLoading")}</p> : (
        <>
          <p role="status">{translate(active ? "clientPortal.accessActive" : access.state === "EXPIRED" ? "clientPortal.accessExpired" : "clientPortal.accessOff",
            { date: expires || "" })}</p>
          {url && (
            <div className="client-portal-access__link">
              <input type="text" readOnly value={url} aria-label={translate("clientPortal.accessLinkLabel")} onFocus={(event) => event.target.select()} />
              <button className="button button--primary" type="button" disabled={busy} onClick={copy}>
                {translate(copied ? "clientPortal.accessCopied" : "clientPortal.accessCopy")}
              </button>
            </div>
          )}
          {url && <p>{translate("clientPortal.accessShownOnce")}</p>}
          <div className="client-portal-access__actions">
            <button className={url ? "button" : "button button--primary"} type="button" disabled={busy} onClick={create}>
              {translate(active ? "clientPortal.accessReplace" : "clientPortal.accessCreate")}
            </button>
            {active && <button className="button" type="button" disabled={busy} onClick={turnOff}>{translate("clientPortal.accessTurnOff")}</button>}
          </div>
          {active && !url && <p>{translate("clientPortal.accessReplaceHelp")}</p>}
        </>
      )}
      {error && <p role="alert">{translate("clientPortal.accessError")}</p>}
    </section>
  );
}
