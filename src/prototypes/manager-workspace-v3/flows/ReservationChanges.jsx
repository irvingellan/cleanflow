import { useState } from "react";
import { Icon } from "../ui/Icon.jsx";
import { Overlay, SimTag, useT } from "../ui/kit.jsx";

// Future concept: Reservation Changes Inbox. Nothing syncs; nothing changes a
// service automatically. A disappeared calendar event is NOT proof of cancellation.

const CHANGES = [
  { id: "rc1", kind: "new", property: "Linden Terrace", before: null, after: "rx.d.nov8_11", source: "iCal" },
  { id: "rc2", kind: "moved", property: "Harbor House", before: "rx.d.nov4", after: "rx.d.nov5", source: "Guesty" },
  { id: "rc3", kind: "disappeared", property: "Lighthouse Suite", before: "rx.d.nov5_9", after: null, source: "iCal" },
];
const icon = { new: "plus", moved: "calendar", disappeared: "alertCircle" };
const tone = { new: "info", moved: "attention", disappeared: "warning" };

export function ReservationChangesSheet({ onClose }) {
  const t = useT();
  const [done, setDone] = useState({});
  return (
    <Overlay title={t("rx.title")} onClose={onClose}>
      <div className="mw-rx">
        <p className="mw-sec">{t("rx.intro")} <SimTag kind="future" /></p>
        <ul className="mw-rx-list">
          {CHANGES.map(c => (
            <li key={c.id} className={`mw-rx-item tone-${tone[c.kind]}${done[c.id] ? " is-done" : ""}`}>
              <span className="mw-notif-icon"><Icon name={icon[c.kind]} size={17} /></span>
              <div className="mw-grow">
                <span className="mw-micro">{t(`rx.kind.${c.kind}`)} · {t("rx.source", { source: c.source })}</span>
                <strong>{c.property}</strong>
                <div className="mw-rx-diff">
                  <span><span className="mw-sec">{t("rx.before")}</span>{c.before ? t(c.before) : "—"}</span>
                  <Icon name="arrowR" size={14} />
                  <span><span className="mw-sec">{t("rx.after")}</span>{c.after ? t(c.after) : t("rx.notInFeed")}</span>
                </div>
                <p className="mw-sec">{t(`rx.help.${c.kind}`)}</p>
                {done[c.id]
                  ? <p className="mw-flag tone-success"><Icon name="check" size={14} />{t("rx.reviewed")}</p>
                  : <button type="button" className="cfv2-button cfv2-button-secondary mw-btn cfv2-button-small" onClick={() => setDone({ ...done, [c.id]: true })}>{t("rx.markReviewed")}</button>}
              </div>
            </li>
          ))}
        </ul>
        <p className="mw-hint">{t("rx.never")}</p>
      </div>
    </Overlay>
  );
}
