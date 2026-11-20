import { useEffect, useId, useState } from "react";
import { formatDate, formatServiceTime } from "../../lib/presentation.js";
import { cleanerSelectionMessage } from "../../i18n/cleanerSelectionMessages.js";
import { getCleanerSelectionContext } from "./jobService.js";
import "./CleanerSelectionContext.css";

const emptyResult = { byCleanerId: {} };
const contextTimeoutMs = 10_000;

export function useCleanerSelectionContext(job, enabled) {
  const { id: jobId, propertyId, scheduledDate, scheduledStart } = job;
  const key = enabled && jobId && (propertyId || scheduledDate) ? JSON.stringify([jobId, propertyId, scheduledDate, scheduledStart]) : null;
  const [state, setState] = useState(null);

  useEffect(() => {
    if (!key) { setState(null); return; }
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
      setState({ key, status: "unavailable" });
    }, contextTimeoutMs);
    getCleanerSelectionContext({ jobId, propertyId, scheduledDate, scheduledStart }, { signal: controller.signal }).then(
      (result) => {
        if (!controller.signal.aborted) setState({ key, status: "loaded", result });
      },
      () => {
        if (!controller.signal.aborted) setState({ key, status: "unavailable" });
      },
    ).finally(() => clearTimeout(timeout));
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [key, jobId, propertyId, scheduledDate, scheduledStart]);

  if (!key) return { status: "idle", result: emptyResult };
  if (state?.key !== key) return { status: "loading", result: emptyResult };
  return { status: state.status, result: state.result ?? emptyResult };
}

export function sortCleanerOptions(items, context, cleanerId = item => item.id) {
  const facts = item => context.byCleanerId[cleanerId(item)];
  return [...items].sort((left, right) => {
    const a = facts(left);
    const b = facts(right);
    return Number(Boolean(a?.unavailability)) - Number(Boolean(b?.unavailability))
      || (b?.completedHereCount || 0) - (a?.completedHereCount || 0);
  });
}

export function CleanerAvailabilityConfirmation({ selected, context, language }) {
  const names = { blocked: [], unknown: [] };
  for (const { id, name } of selected) {
    const state = context.byCleanerId[id]?.unavailability?.state;
    if (state === "blocked" || state === "unknown") names[state].push(name || cleanerSelectionMessage(language, "cleanerSelection.unnamed"));
  }
  if (!names.blocked.length && !names.unknown.length) return null;
  const list = new Intl.ListFormat(language, { type: "conjunction" });
  return <div className="cleaner-selection-confirmation" role="status">
    {Object.entries(names).map(([state, people]) => people.length > 0 && <p key={state}>
      {cleanerSelectionMessage(language, "cleanerSelection." + (state === "blocked" ? "selectedBlocked" : "selectedPossible"), { names: list.format(people) })}
    </p>)}
  </div>;
}

function cleanerContextLabels(cleanerId, context, language) {
  if (!Object.hasOwn(context.byCleanerId, cleanerId)) return [];
  const entry = context.byCleanerId[cleanerId];
  const t = (key, values) => cleanerSelectionMessage(language, `cleanerSelection.${key}`, values);
  const labels = [];
  if (entry.unavailability) {
    const { state, periods } = entry.unavailability;
    const hours = periods.map(({ startTime, endTime }) =>
      [formatServiceTime(startTime, language), formatServiceTime(endTime, language)].join("–"));
    labels.push({ type: "unavailability", text: t(state === "blocked" ? "blocked" : "possible"), hours });
  }
  if (entry.sameDayStarts.length) {
    const times = entry.sameDayStarts.map((start) => start ?? t("timeNotSet"));
    labels.push({ type: "schedule", text: `${t("scheduled")} · ${times.join(", ")}` });
  }
  const count = entry.completedHereCount;
  if (count && entry.lastCompletedHereDate) {
    const date = formatDate(entry.lastCompletedHereDate, null, language);
    const key = context.historyPartial ? "historyLowerBound" : count === 1 ? "historyOne" : "historyMany";
    labels.push({ type: "history", text: t(key, { count, date }) });
  }
  return labels;
}

export function cleanerReplacementOption(name, cleanerId, context, language) {
  return [name, ...cleanerContextLabels(cleanerId, context, language).flatMap(({ text, hours = [] }) => [text, ...hours])].join(" · ");
}

export function CleanerSelectionOption({ name, inputName, cleanerId, context, language, className, ...input }) {
  const descriptionId = useId();
  const labels = cleanerContextLabels(cleanerId, context, language);
  return (
    <label className={className}>
      <input {...input} name={inputName} aria-label={name} aria-describedby={labels.length ? descriptionId : undefined} />
      <span className="cleaner-selection-option__text">
        <span>{name}</span>
        {labels.length > 0 && (
          <span className="cleaner-selection-option__context" id={descriptionId}>
            {labels.map(({ type, text, hours }) => (
              <span className={`cleaner-selection-option__${type}`} key={type}>{text}
                {hours?.map(range => <span key={range} className="cleaner-selection-time"> · {range}</span>)}
              </span>
            ))}
          </span>
        )}
      </span>
    </label>
  );
}

export function CleanerSelectionStatus({ status, result, language }) {
  const key = status === "loading" || status === "unavailable" ? status
    : result.historyPartial || result.schedulePartial ? "partial" : null;
  const availabilityMissing = status === "unavailable" || result.availabilityUnavailable;
  if (!key && !availabilityMissing && !result.jobContextUnavailable) return null;
  return <div className="form-hint cleaner-selection-status" role="status">
    {key && <p>{cleanerSelectionMessage(language, "cleanerSelection." + key)}</p>}
    {result.jobContextUnavailable && <p>{cleanerSelectionMessage(language, "cleanerSelection.jobContextUnavailable")}</p>}
    {availabilityMissing && <p>{cleanerSelectionMessage(language, "cleanerSelection.availabilityUnavailable")}</p>}
  </div>;
}
