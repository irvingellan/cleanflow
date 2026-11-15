import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../services/firebase/client.js";
import { useTranslation } from "../../i18n/translations.js";
import { classifyLatency, consoleLinks, describeBuild, measuredFunctions } from "./systemStatus.js";
import { statusText } from "./systemStatusMessages.js";

const versionReadDeadlineMs = 15_000;

async function readVersion(signal) {
  const response = await fetch("/version.json", { cache: "no-store", signal });
  if (!response.ok) throw new Error(`version.json ${response.status}`);
  return response.json();
}

async function timeWarmup(name) {
  const startedAt = performance.now();
  try {
    await httpsCallable(functions, name, { timeout: 30_000 })({ warmup: true });
    return { name, ms: Math.round(performance.now() - startedAt) };
  } catch {
    return { name, ms: Number.NaN };
  }
}

/** Read-only: version.json, warm-up calls and links. Never touches operational data. */
export function SystemStatusPanel({ loadVersion = readVersion, measure = timeWarmup }) {
  const { language } = useTranslation();
  const t = (key) => statusText(language, key);
  const [version, setVersion] = useState(null);
  const [versionError, setVersionError] = useState(false);
  const [timings, setTimings] = useState(null);
  const [isMeasuring, setIsMeasuring] = useState(false);

  useEffect(() => {
    let current = true;
    const controller = new AbortController();
    const deadline = setTimeout(() => {
      current = false;
      controller.abort();
      setVersionError(true);
    }, versionReadDeadlineMs);
    loadVersion(controller.signal)
      .then((value) => { if (current) setVersion(value); })
      .catch(() => { if (current) setVersionError(true); })
      .finally(() => clearTimeout(deadline));
    return () => {
      current = false;
      clearTimeout(deadline);
      controller.abort();
    };
  }, [loadVersion]);

  async function runMeasurement() {
    setIsMeasuring(true);
    try {
      setTimings(await Promise.all(measuredFunctions.map((name) => measure(name))));
    } finally {
      setIsMeasuring(false);
    }
  }

  const build = version ? describeBuild(version) : null;
  const links = consoleLinks(version?.projectId);

  return (
    <section className="cf-block dev-center__block system-status" aria-labelledby="system-status-title">
      <div className="cf-block__header">
        <div>
          <h3 id="system-status-title">{t("title")}</h3>
          <p className="cf-block__subtitle">{t("subtitle")}</p>
        </div>
      </div>
      {!build && !versionError && <p className="system-status__muted" role="status">{t("loading")}</p>}
      {versionError && <p className="system-status__error" role="alert">{t("versionError")}</p>}
      {build && (
        <dl className="system-status__facts">
          <div>
            <dt>{t("version")}</dt>
            <dd>
              <code>{build.shortId}</code> <span className="system-status__muted">{build.version}</span>
              {build.commitUrl && <> · <a href={build.commitUrl} target="_blank" rel="noreferrer">{t("openCommit")}</a></>}
            </dd>
          </div>
          <div>
            <dt>{t("environment")}</dt>
            <dd>{build.environment}</dd>
          </div>
          <div>
            <dt>{t("flags")}</dt>
            <dd className="system-status__flags">
              {["automaticOffers", "cleanerPush", "inbox"].map((flag) => (
                <span key={flag} className={`system-status__flag${build.flags[flag] ? " system-status__flag--on" : ""}`}>
                  {t(flag)}: {t(build.flags[flag] ? "on" : "off")}
                </span>
              ))}
            </dd>
          </div>
        </dl>
      )}
      <div className="system-status__measure">
        <button className="button button--small" type="button" disabled={isMeasuring} onClick={runMeasurement}>
          {isMeasuring ? t("measuring") : t("measure")}
        </button>
        <p className="system-status__muted">{t("measureHint")}</p>
      </div>
      {timings && (
        <ul className="system-status__timings">
          {timings.map(({ name, ms }) => {
            const state = classifyLatency(ms);
            return (
              <li key={name}>
                <code>{name}</code>
                <span className={`system-status__latency system-status__latency--${state}`}>
                  {Number.isFinite(ms) ? `${ms} ms` : "—"} · {t(state)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <div className="system-status__links" aria-label={t("links")}>
        <a href={links.functions} target="_blank" rel="noreferrer">{t("functionsConsole")}</a>
        <a href={links.firestore} target="_blank" rel="noreferrer">{t("firestoreConsole")}</a>
        <a href={links.hosting} target="_blank" rel="noreferrer">{t("hostingConsole")}</a>
        <a href={links.pulls} target="_blank" rel="noreferrer">{t("pulls")}</a>
        <a href={links.actions} target="_blank" rel="noreferrer">{t("actions")}</a>
      </div>
    </section>
  );
}
