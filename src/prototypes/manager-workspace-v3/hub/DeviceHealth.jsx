import { useEffect, useState } from "react";
import { useStore } from "../model/store.js";
import { Icon } from "../ui/Icon.jsx";
import { SimTag, dayWord, useT } from "../ui/kit.jsx";
import { READINESS_ICON, READINESS_TONE, deviceReadiness, evidenceLines } from "./hubModel.js";

// Current-device notification readiness, recovery and device list.
// Shared by the Cleaner Hub and the manager's Account > Notifications.
// Every action here is SIMULATED: nothing registers a device or sends a push.

const stampOf = (t, data, s) => (s ? `${dayWord(t, data, s.date)} ${t.stamp(s)}` : t("dh.never"));

export function ReadinessChip({ device, compact }) {
  const t = useT();
  const r = deviceReadiness(device);
  return (
    <span className={`dh-chip tone-${READINESS_TONE[r.state]}`}>
      <Icon name={READINESS_ICON[r.state]} size={13} className={r.state === "checking" ? "cw-spin" : ""} />
      {t(compact ? `dh.short.${r.state}` : `dh.state.${r.state}`)}
    </span>
  );
}

/** Simulated system permission prompt, styled like an OS sheet and labelled as a simulation. */
function PermissionPrompt({ platform, onAnswer }) {
  const t = useT();
  return (
    <div className="dh-prompt" role="alertdialog" aria-modal="true" aria-labelledby="dh-prompt-t">
      <div className="dh-prompt-card">
        <span className="mw-simtag mw-simtag-simulated"><Icon name="flask" size={12} />{t("dh.promptSim")}</span>
        <p id="dh-prompt-t"><strong>{t(platform === "ios" ? "dh.prompt.ios" : "dh.prompt.android")}</strong></p>
        <p className="mw-sec">{t("dh.prompt.body")}</p>
        <div className="dh-prompt-actions">
          <button type="button" onClick={() => onAnswer("denied")}>{t("dh.prompt.deny")}</button>
          <button type="button" className="is-strong" onClick={() => onAnswer("granted")} data-autofocus>{t("dh.prompt.allow")}</button>
        </div>
      </div>
    </div>
  );
}

/**
 * The readiness card for one device with ONE next action.
 * onInstall(platform) opens the install guide; onTestBanner shows the simulated push.
 */
export function DeviceReadiness({ device, onInstall, onInbox, onTestBanner, showEvidence = true, mine = true }) {
  const t = useT();
  const { data, act } = useStore();
  const [prompt, setPrompt] = useState(false);
  const [ask, setAsk] = useState(false); // "did the test notification appear?"
  const [busy, setBusy] = useState(null);
  const r = deviceReadiness(busy ? { ...device, checking: true } : device);
  const patch = p => act("HUB_DEVICE", { id: device.id, patch: p });
  const check = (after, ms = 1100) => { setBusy("checking"); setTimeout(() => { setBusy(null); after?.(); }, ms); };
  const run = action => {
    if (action === "install") return onInstall?.(device.platform);
    if (action === "allow") return setPrompt(true);
    if (action === "unblock" || action === "check") return check(() => patch(device.permission === "denied" ? { permission: "granted" } : {}));
    if (action === "reconnect") return check(() => patch({ registration: "active", lastTest: null }));
    if (action === "update") return check(() => patch({ appVersion: "current", registration: device.registration === "stale" ? "active" : device.registration }));
    if (action === "test") { onTestBanner?.(); setAsk(true); return undefined; }
    if (action === "inbox") return onInbox?.();
    return undefined;
  };
  useEffect(() => { setAsk(false); }, [device.id]);
  const lines = evidenceLines(device);
  return (
    <section className={`dh-card tone-${READINESS_TONE[r.state]}`} aria-labelledby={`dh-${device.id}`}>
      <header className="dh-card-head">
        <span className="dh-icon"><Icon name={READINESS_ICON[r.state]} size={22} className={r.state === "checking" ? "cw-spin" : ""} /></span>
        <div className="mw-grow">
          <span className="mw-micro">{t(device.labelKey)} · {t(`dh.platform.${device.platform}`)}</span>
          <h3 id={`dh-${device.id}`}>{t(`dh.state.${r.state}`)}</h3>
        </div>
        <SimTag />
      </header>
      <ul className="dh-reasons">{r.reasons.map(k => <li key={k}>{t(`dh.reason.${k}`)}</li>)}</ul>
      {mine && r.action && !ask && (
        <button type="button" className={`cfv2-button ${r.state === "ready" ? "cfv2-button-secondary" : "cfv2-button-primary"} mw-btn mw-btn-block`} onClick={() => run(r.action)} disabled={Boolean(busy)}>
          <Icon name={r.action === "install" ? "phone" : r.action === "test" ? "bell" : r.action === "allow" ? "bell" : r.action === "inbox" ? "inbox" : "refresh"} size={17} />{t(`dh.action.${r.action}`)}
        </button>
      )}
      {mine && ask && (
        <div className="dh-ask" role="group" aria-label={t("dh.ask")}>
          <p><strong>{t("dh.ask")}</strong></p>
          <p className="mw-sec">{t("dh.askHint")}</p>
          <div className="mw-chiprow">
            <button type="button" className="cfv2-button cfv2-button-primary mw-btn cfv2-button-small" onClick={() => { act("HUB_TEST", { id: device.id, result: "confirmed" }); setAsk(false); }}>{t("dh.ask.yes")}</button>
            <button type="button" className="cfv2-button cfv2-button-secondary mw-btn cfv2-button-small" onClick={() => { act("HUB_TEST", { id: device.id, result: "failed" }); setAsk(false); }}>{t("dh.ask.no")}</button>
            <button type="button" className="cfv2-button cfv2-button-tertiary mw-btn cfv2-button-small" onClick={() => { act("HUB_TEST", { id: device.id, result: "accepted" }); setAsk(false); }}>{t("dh.ask.unsure")}</button>
          </div>
        </div>
      )}
      {showEvidence && (
        <details className="dh-evidence">
          <summary>{t("dh.evidence")}</summary>
          <ul>
            {lines.map(l => (
              <li key={l.key} className={l.verified ? "is-verified" : "is-unverified"}>
                <Icon name={l.verified ? "check" : "info"} size={14} />
                <span className="mw-grow"><strong>{t(`dh.ev.${l.key}`)}</strong><span className="mw-sec">{t(`dh.val.${l.key}.${l.value}`)}</span></span>
              </li>
            ))}
            <li className="is-verified"><Icon name="clock" size={14} /><span className="mw-grow"><strong>{t("dh.ev.lastConfirmed")}</strong><span className="mw-sec">{stampOf(t, data, device.lastConfirmed)}</span></span></li>
          </ul>
          <p className="mw-hint">{t("dh.evidenceNote")}</p>
        </details>
      )}
      <p className="dh-inbox-note"><Icon name="inbox" size={14} />{t("dh.inboxNote")}</p>
      {prompt && <PermissionPrompt platform={device.platform} onAnswer={answer => {
        setPrompt(false);
        patch({ permission: answer });
        if (answer === "granted") check(() => patch({ permission: "granted", registration: "active", lastTest: null }), 1300);
      }} />}
    </section>
  );
}

/** "Notifications stopped?" — check what can be verified, then one safe action. */
export function RecoveryFlow({ device, onInstall, onInbox, onTestBanner, onSupport }) {
  const t = useT();
  const [phase, setPhase] = useState("intro");
  const r = deviceReadiness(device);
  useEffect(() => { if (phase === "checking") { const id = setTimeout(() => setPhase("result"), 1400); return () => clearTimeout(id); } return undefined; }, [phase]);
  if (phase === "intro") {
    return (
      <section className="dh-recover">
        <h3>{t("dh.rec.title")}</h3>
        <p className="mw-sec">{t("dh.rec.intro")}</p>
        <button type="button" className="cfv2-button cfv2-button-primary mw-btn mw-btn-block" onClick={() => setPhase("checking")}><Icon name="search" size={17} />{t("dh.rec.start")}</button>
      </section>
    );
  }
  if (phase === "checking") {
    return (
      <section className="dh-recover" role="status" aria-live="polite">
        <h3><Icon name="refresh" size={18} className="cw-spin" /> {t("dh.rec.checking")}</h3>
        <div className="mw-shimmer dh-shimmer" /><div className="mw-shimmer dh-shimmer" /><div className="mw-shimmer dh-shimmer is-short" />
      </section>
    );
  }
  const certain = !["unknown"].includes(r.state);
  return (
    <section className="dh-recover">
      <h3>{t(certain ? "dh.rec.found" : "dh.rec.notSure")}</h3>
      <p className="mw-sec">{t(`dh.rec.explain.${r.reasons[0] || "noEvidence"}`)}</p>
      <DeviceReadiness device={device} onInstall={onInstall} onInbox={onInbox} onTestBanner={onTestBanner} />
      {!certain && <button type="button" className="mw-linkbtn" onClick={onSupport}><Icon name="msg" size={15} />{t("dh.rec.support")}</button>}
      <p className="mw-hint">{t("dh.rec.honest")}</p>
    </section>
  );
}

/** Device list. Managers see their own devices and, without details, other managers'; cleaners see only their own. */
export function DeviceList({ devices, currentId, onPick, role = "manager" }) {
  const t = useT();
  const { data } = useStore();
  return (
    <ul className="dh-list" aria-label={t("dh.listTitle")}>
      {devices.map(d => {
        const r = deviceReadiness(d);
        return (
          <li key={d.id}>
            <button type="button" className={`dh-row${d.id === currentId ? " is-current" : ""}`} aria-pressed={d.id === currentId} onClick={() => onPick?.(d.id)}>
              <Icon name={d.platform === "mac" ? "layout" : "phone"} size={20} />
              <span className="mw-grow">
                <strong>{t(d.labelKey)}{d.id === currentId && <span className="mw-pill">{t("dev.current")}</span>}</strong>
                <span className="mw-sec">{t(`dh.platform.${d.platform}`)} · {t(`dh.val.displayMode.${d.displayMode}`)}</span>
                {!d.other && <span className="mw-sec">{t("dh.lastActive", { time: stampOf(t, data, d.lastActive) })} · {t("dh.lastConfirmedShort", { time: stampOf(t, data, d.lastConfirmed) })}</span>}
                {r.reasons[0] && r.state !== "ready" && <span className="mw-sec dh-why">{t(`dh.reason.${r.reasons[0]}`)}</span>}
              </span>
              <ReadinessChip device={d} compact />
            </button>
          </li>
        );
      })}
      {role === "cleaner" && <li className="mw-hint">{t("dh.cleanerOnlyOwn")}</li>}
    </ul>
  );
}
