import { useState } from "react";
import { BackButton, StateCard } from "../../components/UiPrimitives.jsx";
import { useTranslation } from "../../i18n/translations.js";
import {
  durationSeverity,
  managerOperationPage,
  managerPageLoadPages,
} from "./managerPageLoadDiagnosticsService.js";
import { useManagerPageLoadDiagnostics } from "./useManagerPageLoadDiagnostics.js";

function durationLabel(value, translate) {
  if (!Number.isFinite(value)) return translate("loadDiagnostics.noValue");
  return value < 1000 ? `${value} ms` : `${(value / 1000).toFixed(2)} s`;
}

function eventTime(value, language) {
  const date = value?.toDate ? value.toDate() : new Date(value || "");
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(
    { en: "en-US", pt: "pt-BR", es: "es-ES" }[language] || "en-US",
    { dateStyle: "short", timeStyle: "short" },
  ).format(date);
}

function shortIdentifier(value) {
  return typeof value === "string" ? value.slice(0, 8) : "—";
}

function Duration({ value, translate }) {
  if (!Number.isFinite(value)) return <span>{translate("loadDiagnostics.noValue")}</span>;
  const severity = durationSeverity(value);
  return <span className={`load-diagnostics__duration load-diagnostics__duration--${severity}`}>
    {durationLabel(value, translate)}
    <small>{translate(`loadDiagnostics.severity.${severity}`)}</small>
  </span>;
}

function OperationWaterfall({ visit, translate }) {
  return (
    <div className="load-diagnostics__waterfall" role="list" aria-label={translate("loadDiagnostics.operationWaterfall")}>
      {visit.events.map((event) => {
        const left = ((event.startedAtMs - visit.startedAtMs) / visit.spanMs) * 100;
        const width = Math.min(100 - left, Math.max(1.5, (event.durationMs / visit.spanMs) * 100));
        const offset = event.startedAtMs - visit.startedAtMs;
        return (
          <div className="load-diagnostics__waterfall-row" role="listitem" key={event.id}>
            <div className="load-diagnostics__waterfall-label">
              <strong>{translate(`loadDiagnostics.operations.${event.operation}`)}</strong>
              <small>{translate(`loadDiagnostics.phases.${event.phase}`)}</small>
            </div>
            <div className="load-diagnostics__waterfall-track" aria-hidden="true">
              <span
                className={`load-diagnostics__waterfall-bar load-diagnostics__waterfall-bar--${event.result === "error" ? "error" : "success"}`}
                style={{ left: `${left}%`, width: `${width}%` }}
              />
            </div>
            <span className={`load-diagnostics__waterfall-value load-diagnostics__result--${event.result === "error" ? "error" : "success"}`}>
              {translate("loadDiagnostics.operationTiming", {
                offset: durationLabel(offset, translate),
                duration: durationLabel(event.durationMs, translate),
                result: translate(`loadDiagnostics.results.${event.result}`),
              })}
            </span>
          </div>
        );
      })}
      <p className="load-diagnostics__waterfall-note">{translate("loadDiagnostics.waterfallExplanation")}</p>
    </div>
  );
}

/** Read-only view over bounded manager timing events; it does not fetch operational records. */
export function ManagerPageLoadDiagnostics({ onBack }) {
  const { language, translate } = useTranslation();
  const diagnostics = useManagerPageLoadDiagnostics();
  const { summary } = diagnostics;
  const [selectedVisitId, setSelectedVisitId] = useState("");
  const selectedVisit = diagnostics.jobDetailVisits.find((visit) => visit.id === selectedVisitId)
    || diagnostics.jobDetailVisits[0];

  return (
    <section className="panel manager-load-diagnostics" aria-labelledby="load-diagnostics-title">
      <BackButton onClick={onBack} />
      <div className="manager-load-diagnostics__heading">
        <div>
          <p className="eyebrow">{translate("loadDiagnostics.eyebrow")}</p>
          <h2 id="load-diagnostics-title" className="panel__title">{translate("loadDiagnostics.title")}</h2>
          <p>{translate("loadDiagnostics.description")}</p>
        </div>
        <button className="button" type="button" disabled={diagnostics.isLoading || diagnostics.operationIsLoading} onClick={diagnostics.refresh}>
          {diagnostics.isLoading || diagnostics.operationIsLoading ? translate("loadDiagnostics.loading") : translate("loadDiagnostics.refresh")}
        </button>
      </div>

      <div className="load-diagnostics__filters">
        <label>
          {translate("loadDiagnostics.window")}
          <select value={diagnostics.windowDays} onChange={(event) => diagnostics.setWindowDays(Number(event.target.value))}>
            <option value={1}>{translate("loadDiagnostics.last24Hours")}</option>
            <option value={7}>{translate("loadDiagnostics.last7Days")}</option>
            <option value={30}>{translate("loadDiagnostics.last30Days")}</option>
          </select>
        </label>
        <label>
          {translate("loadDiagnostics.page")}
          <select value={diagnostics.pageFilter} onChange={(event) => diagnostics.setPageFilter(event.target.value)}>
            <option value="all">{translate("loadDiagnostics.allPages")}</option>
            {managerPageLoadPages.map((page) => <option key={page} value={page}>{translate(`loadDiagnostics.pages.${page}`)}</option>)}
            <option value={managerOperationPage}>{translate("loadDiagnostics.pages.job-detail")}</option>
          </select>
        </label>
        <label>
          {translate("loadDiagnostics.user")}
          <select value={diagnostics.userFilter} onChange={(event) => diagnostics.setUserFilter(event.target.value)}>
            <option value="all">{translate("loadDiagnostics.allUsers")}</option>
            {diagnostics.users.map((uid) => <option key={uid} value={uid}>{uid}</option>)}
          </select>
        </label>
        <label>
          {translate("loadDiagnostics.deviceBrowser")}
          <select value={diagnostics.deviceFilter} onChange={(event) => diagnostics.setDeviceFilter(event.target.value)}>
            <option value="all">{translate("loadDiagnostics.allDevices")}</option>
            {diagnostics.devices.map((device) => <option key={device} value={device}>{device}</option>)}
          </select>
        </label>
      </div>

      {diagnostics.isLoading && <StateCard message={translate("loadDiagnostics.loadingEvents")} status="status" />}
      {diagnostics.hasError && (
        <div role="alert">
          <StateCard message={translate("loadDiagnostics.error")} status="alert" isError />
          <button className="button" type="button" onClick={diagnostics.refresh}>{translate("common.retry")}</button>
        </div>
      )}

      {!diagnostics.isLoading && !diagnostics.hasError && (
        <>
          <p className="load-diagnostics__sample-note">{translate("loadDiagnostics.sampleLimit")}</p>
          <div className="load-diagnostics__summary" aria-label={translate("loadDiagnostics.summary")}>
            {[
              ["events", summary.eventCount],
              ["average", durationLabel(summary.averageMs, translate)],
              ["median", durationLabel(summary.medianMs, translate)],
              ["p95", durationLabel(summary.p95Ms, translate)],
              ["slowest", summary.slowest
                ? `${durationLabel(summary.slowest.durationMs, translate)} · ${translate(`loadDiagnostics.pages.${summary.slowest.page}`)}`
                : translate("loadDiagnostics.noValue")],
            ].map(([metric, value]) => (
              <article className="load-diagnostics__metric" key={metric}>
                <span>{translate(`loadDiagnostics.metrics.${metric}`)}</span>
                <strong>{value}</strong>
              </article>
            ))}
          </div>

          <section className="load-diagnostics__section" aria-labelledby="load-diagnostics-by-page">
            <h3 id="load-diagnostics-by-page">{translate("loadDiagnostics.byPage")}</h3>
            <div className="load-diagnostics__table-wrap">
              <table className="load-diagnostics__table">
                <thead><tr>
                  <th>{translate("loadDiagnostics.page")}</th>
                  <th>{translate("loadDiagnostics.metrics.events")}</th>
                  <th>{translate("loadDiagnostics.metrics.average")}</th>
                  <th>{translate("loadDiagnostics.metrics.p95")}</th>
                  <th>{translate("loadDiagnostics.metrics.slowest")}</th>
                </tr></thead>
                <tbody>{summary.byPage.map((row) => (
                  <tr key={row.page}>
                    <th scope="row">{translate(`loadDiagnostics.pages.${row.page}`)}</th>
                    <td>{row.eventCount}</td>
                    <td><Duration value={row.averageMs} translate={translate} /></td>
                    <td><Duration value={row.p95Ms} translate={translate} /></td>
                    <td><Duration value={row.slowest?.durationMs} translate={translate} /></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </section>

          <section className="load-diagnostics__section" aria-labelledby="load-diagnostics-events">
            <h3 id="load-diagnostics-events">{translate("loadDiagnostics.events")}</h3>
            {diagnostics.events.length === 0 ? (
              <StateCard message={translate("loadDiagnostics.empty")} />
            ) : (
              <div className="load-diagnostics__table-wrap">
                <table className="load-diagnostics__table load-diagnostics__events-table">
                  <thead><tr>
                    <th>{translate("loadDiagnostics.time")}</th>
                    <th>{translate("loadDiagnostics.user")}</th>
                    <th>{translate("loadDiagnostics.page")}</th>
                    <th>{translate("loadDiagnostics.loadDuration")}</th>
                    <th>{translate("loadDiagnostics.result")}</th>
                    <th>{translate("loadDiagnostics.deviceBrowser")}</th>
                    <th>{translate("loadDiagnostics.network")}</th>
                    <th>{translate("loadDiagnostics.sessionDevice")}</th>
                  </tr></thead>
                  <tbody>{diagnostics.events.map((event) => (
                    <tr key={event.id}>
                      <td>{eventTime(event.createdAt, language)}</td>
                      <td className="load-diagnostics__uid">{event.uid}</td>
                      <td>{translate(`loadDiagnostics.pages.${event.page}`)}</td>
                      <td>
                        <Duration value={event.durationMs} translate={translate} />
                        <small>{translate("loadDiagnostics.dataLoad")}: {durationLabel(event.dataDurationMs, translate)}</small>
                      </td>
                      <td><span className={`load-diagnostics__result load-diagnostics__result--${event.result}`}>
                        {translate(`loadDiagnostics.results.${event.result}`)}
                      </span></td>
                      <td>{event.browser}/{event.platform} · {translate(`loadDiagnostics.deviceClasses.${event.deviceClass}`)}</td>
                      <td>{event.connection?.effectiveType || translate("loadDiagnostics.noValue")}</td>
                      <td>{translate("loadDiagnostics.ids", {
                        session: shortIdentifier(event.sessionId),
                        device: shortIdentifier(event.deviceId),
                      })}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      <section className="load-diagnostics__section" aria-labelledby="load-diagnostics-operations">
        <h3 id="load-diagnostics-operations">{translate("loadDiagnostics.operationsTitle")}</h3>
        <p className="load-diagnostics__sample-note">{translate("loadDiagnostics.operationSampleLimit")}</p>
        {diagnostics.operationIsLoading && <StateCard message={translate("loadDiagnostics.loadingOperations")} status="status" />}
        {diagnostics.operationHasError && (
          <div role="alert">
            <StateCard message={translate("loadDiagnostics.operationsError")} status="alert" isError />
            <button className="button" type="button" onClick={diagnostics.refresh}>{translate("common.retry")}</button>
          </div>
        )}
        {!diagnostics.operationIsLoading && !diagnostics.operationHasError && (
          diagnostics.operationEvents.length === 0
            ? <StateCard message={translate("loadDiagnostics.operationsEmpty")} />
            : <>
              <div className="load-diagnostics__table-wrap">
                <table className="load-diagnostics__table">
                  <thead><tr>
                    <th>{translate("loadDiagnostics.operation")}</th>
                    <th>{translate("loadDiagnostics.metrics.events")}</th>
                    <th>{translate("loadDiagnostics.metrics.average")}</th>
                    <th>{translate("loadDiagnostics.metrics.p95")}</th>
                    <th>{translate("loadDiagnostics.metrics.slowest")}</th>
                    <th>{translate("loadDiagnostics.operationErrors")}</th>
                  </tr></thead>
                  <tbody>{diagnostics.operationSummary.map((row) => (
                    <tr key={row.operation}>
                      <th scope="row">{translate(`loadDiagnostics.operations.${row.operation}`)}</th>
                      <td>{row.eventCount}</td>
                      <td><Duration value={row.averageMs} translate={translate} /></td>
                      <td><Duration value={row.p95Ms} translate={translate} /></td>
                      <td><Duration value={row.slowest?.durationMs} translate={translate} /></td>
                      <td>{row.errorCount}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <div className="load-diagnostics__visits">
                <h4>{translate("loadDiagnostics.recentJobDetailVisits")}</h4>
                {diagnostics.jobDetailVisits.length === 0 ? (
                  <StateCard message={translate("loadDiagnostics.noJobDetailVisits")} />
                ) : (
                  <>
                    <label className="load-diagnostics__visit-picker">
                      {translate("loadDiagnostics.selectVisit")}
                      <select value={selectedVisit?.id || ""} onChange={(event) => setSelectedVisitId(event.target.value)}>
                        {diagnostics.jobDetailVisits.map((visit) => (
                          <option key={visit.id} value={visit.id}>
                            {eventTime(visit.latestAtMs, language)} · {shortIdentifier(visit.id)}
                          </option>
                        ))}
                      </select>
                    </label>
                    {selectedVisit && (
                      <>
                        <p className="load-diagnostics__visit-details">
                          {translate("loadDiagnostics.visitDetails", {
                            time: eventTime(selectedVisit.latestAtMs, language),
                            user: shortIdentifier(selectedVisit.events[0]?.uid),
                            device: `${selectedVisit.events[0]?.browser || translate("loadDiagnostics.noValue")}/${selectedVisit.events[0]?.platform || translate("loadDiagnostics.noValue")} · ${translate(`loadDiagnostics.deviceClasses.${selectedVisit.events[0]?.deviceClass}`)}`,
                            span: durationLabel(selectedVisit.spanMs, translate),
                          })}
                        </p>
                        <OperationWaterfall visit={selectedVisit} translate={translate} />
                      </>
                    )}
                  </>
                )}
              </div>
            </>
        )}
      </section>
    </section>
  );
}
