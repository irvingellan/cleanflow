import { useEffect, useId, useState } from "react";
import { formatDate } from "../../lib/presentation.js";
import { cleanerSelectionMessage } from "../../i18n/cleanerSelectionMessages.js";
import { getCleanerSelectionContext } from "./jobService.js";
import "./CleanerSelectionContext.css";

const emptyResult = { byCleanerId: {} };
const contextTimeoutMs = 10_000;

export function useCleanerSelectionContext(job, enabled) {
  const { id: jobId, propertyId, scheduledDate } = job;
  const key = enabled && jobId && (propertyId || scheduledDate) ? JSON.stringify([jobId, propertyId, scheduledDate]) : null;
  const [state, setState] = useState(null);

  useEffect(() => {
    if (!key) { setState(null); return; }
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
      setState({ key, status: "unavailable" });
    }, contextTimeoutMs);
    getCleanerSelectionContext({ jobId, propertyId, scheduledDate }, { signal: controller.signal }).then(
      (result) => {
        if (!controller.signal.aborted) setState({ key, status: "loaded", result });
      },
      () => {
        if (!controller.signal.aborted) setState({ key, status: "unavailable" });
      },
    ).finally(() => clearTimeout(timeout));
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [key, jobId, propertyId, scheduledDate]);

  if (!key) return { status: "idle", result: emptyResult };
  if (state?.key !== key) return { status: "loading", result: emptyResult };
  return { status: state.status, result: state.result ?? emptyResult };
}

export function sortByCleanerExperience(items, context, cleanerId = (item) => item.id) {
  const count = (item) => context.byCleanerId[cleanerId(item)]?.completedHereCount ?? 0;
  return [...items].sort((left, right) => count(right) - count(left));
}

function cleanerContextLabels(cleanerId, context, language) {
  if (!Object.hasOwn(context.byCleanerId, cleanerId)) return [];
  const entry = context.byCleanerId[cleanerId];
  const t = (key, values) => cleanerSelectionMessage(language, `cleanerSelection.${key}`, values);
  const labels = [];
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
  return [name, ...cleanerContextLabels(cleanerId, context, language).map(({ text }) => text)].join(" · ");
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
            {labels.map(({ type, text }) => (
              <span className={`cleaner-selection-option__${type}`} key={type}>{text}</span>
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
  return key ? (
    <p className="form-hint cleaner-selection-status" role="status">
      {cleanerSelectionMessage(language, `cleanerSelection.${key}`)}
    </p>
  ) : null;
}
