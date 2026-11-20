import { useId, useLayoutEffect, useRef, useState } from "react";
import { formatDate, formatServiceTime } from "../../lib/presentation.js";
import { inboxMessage } from "../notifications/notificationInboxMessages.js";

function scheduleLabel(date, time, language) {
  return [date && formatDate(date, null, language), formatServiceTime(time, language)].filter(Boolean).join(" · ");
}

/** Shared by the cleaner's private inbox, agenda and Job detail. */
export function RescheduleResponse({ language, reschedule, propertyName, onAnswer, disabled = false }) {
  const t = key => inboxMessage(language, key);
  const id = useId();
  const [asking, setAsking] = useState(false);
  const cancelRef = useRef(null);
  const declineRef = useRef(null);
  const returnFocus = useRef(false);
  const submitted = useRef(false);
  const resultRef = useRef(null);
  function answer(decision) {
    submitted.current = true;
    onAnswer(decision);
  }
  useLayoutEffect(() => {
    if (submitted.current && resultRef.current && document.activeElement === document.body) {
      resultRef.current.focus({ preventScroll: true });
      submitted.current = false;
    }
  }, [reschedule?.state]);
  useLayoutEffect(() => {
    if (asking) cancelRef.current?.focus();
    else if (returnFocus.current) {
      declineRef.current?.focus();
      returnFocus.current = false;
    }
  }, [asking]);
  if (reschedule?.state === "CONFIRMED" || reschedule?.state === "DECLINED") {
    return <p className="hb-reschedule-result" role="status" tabIndex={-1} ref={resultRef}>{t(reschedule.state === "CONFIRMED" ? "inbox.reschedule.confirmed" : "inbox.reschedule.declined")}</p>;
  }
  if (reschedule?.state !== "PENDING") return null;
  const before = scheduleLabel(reschedule.previousScheduledDate, reschedule.previousScheduledStart, language);
  const now = scheduleLabel(reschedule.scheduledDate, reschedule.scheduledStart, language);
  return (
    <div className="hb-reschedule" role="group" aria-labelledby={id}>
      <strong className="hb-reschedule-heading" id={id}>{t("inbox.reschedule.title")}{propertyName && <span> · {propertyName}</span>}</strong>
      <dl className="hb-reschedule-times">
        {before && <div><dt>{t("inbox.reschedule.before")}</dt><dd>{before}</dd></div>}
        {now && <div><dt>{t("inbox.reschedule.now")}</dt><dd>{now}</dd></div>}
      </dl>
      {onAnswer && (asking ? (
        <>
          <p id={id + "-warning"} role="status">{t("inbox.reschedule.warning")}</p>
          <div className="hb-reschedule-actions">
            <button type="button" className="button" ref={cancelRef} disabled={disabled} onClick={() => { returnFocus.current = true; setAsking(false); }}>{t("inbox.reschedule.cancel")}</button>
            <button type="button" className="button hb-decline" aria-describedby={id + "-warning"} disabled={disabled} onClick={() => answer("DECLINED")}>{t("inbox.reschedule.leave")}</button>
          </div>
        </>
      ) : (
        <div className="hb-reschedule-actions">
          <button type="button" className="button button--primary" disabled={disabled} onClick={() => answer("CONFIRMED")}>{t("inbox.reschedule.confirm")}</button>
          <button type="button" className="button" ref={declineRef} disabled={disabled} onClick={() => setAsking(true)}>{t("inbox.reschedule.decline")}</button>
        </div>
      ))}
    </div>
  );
}
