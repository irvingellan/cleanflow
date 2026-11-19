import { useEffect, useState } from "react";
import { useTranslation } from "../../i18n/translations.js";
import { ownerText } from "./platformOwnerMessages.js";
import { downloadOverview } from "./platformExport.js";
import { readPlatformReleases } from "./platformReleases.js";
import { repositoryUrl } from "./systemStatus.js";
import "./platformOwner.css";

export function SnapshotBar({ updatedAt, refreshing, refreshFailed, onRefresh, organizations }) {
  const { language, translate } = useTranslation();
  const t = key => ownerText(language, key);
  const stamp = updatedAt && new Date(updatedAt);
  return <div className="platform-actions">
    {stamp && Number.isFinite(stamp.getTime()) && <time dateTime={updatedAt} aria-live="polite">
      {t("updated").replace("{time}", new Intl.DateTimeFormat(language, { hour: "2-digit", minute: "2-digit" }).format(stamp))}
    </time>}
    <button type="button" className="button button--small" aria-disabled={refreshing || undefined} onClick={() => { if (!refreshing) onRefresh(); }}>
      {t(refreshing ? "refreshing" : "refresh")}
    </button>
    {organizations?.length > 0 && <button type="button" className="button button--small"
      onClick={() => downloadOverview(organizations, translate)}>{t("export")}</button>}
    {refreshFailed && <p role="status">{t("refreshFailed")}</p>}
  </div>;
}

export function RecentFailures({ rows = [] }) {
  const { language, translate } = useTranslation();
  const format = new Intl.DateTimeFormat(language, { dateStyle: "short", timeStyle: "short" });
  return <section className="cf-block platform-owner" aria-labelledby="platform-recent-errors">
    <h3 id="platform-recent-errors">{ownerText(language, "failures")}</h3>
    {rows.length === 0 ? <p>{ownerText(language, "noFailures")}</p> : <ul className="platform-event-list">
      {rows.map((row, index) => <li key={index}>
        <div><strong>{ownerText(language, row.kind)}</strong>
          {row.operation && <> · {translate("loadDiagnostics.operations." + row.operation)}</>}
          {!row.operation && row.page && <> · {translate(row.page === "job-detail" ? "loadDiagnostics.pages.job-detail" : "navigation." + row.page)}</>}
        </div>
        <time dateTime={row.at}>{format.format(new Date(row.at))}</time>
        {(row.deviceClass || row.appVersion) && <small>{[row.deviceClass && ownerText(language, row.deviceClass), row.appVersion].filter(Boolean).join(" · ")}</small>}
      </li>)}
    </ul>}
  </section>;
}

export function PlatformReleases({ load = readPlatformReleases }) {
  const { language } = useTranslation();
  const t = key => ownerText(language, key);
  const [expanded, setExpanded] = useState(false);
  const [result, setResult] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!expanded || result) return;
    const controller = new AbortController();
    const deadline = setTimeout(() => { controller.abort(); setFailed(true); }, 12000);
    setFailed(false);
    load(controller.signal).then(value => { if (!controller.signal.aborted) setResult(value); })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); })
      .finally(() => clearTimeout(deadline));
    return () => { clearTimeout(deadline); controller.abort(); };
  }, [expanded, result, load]);
  return <details className="cf-block platform-owner platform-releases" onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary>{t("releases")}</summary>
    {expanded && (failed ? <p>{t("unavailable")}</p> : !result ? <p role="status">{t("loadingReleases")}</p> :
      <div className="platform-release-lists">{["open", "merged"].map(group => <section key={group}>
        <h4>{t(group)}</h4>
        {result[group].length === 0 ? <p>{t("none")}</p> :
          <ul>{result[group].map(pr => <li key={pr.number}><a href={repositoryUrl + "/pull/" + pr.number} target="_blank" rel="noreferrer">
            #{pr.number} · {pr.title}</a></li>)}</ul>}
      </section>)}</div>)}
  </details>;
}
