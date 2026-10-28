import { useEffect, useRef, useState } from "react";
import { EnvironmentIndicator } from "../../../components/v2/primitives.jsx";
import { LANGS } from "../model/messages.js";
import { CATEGORIES } from "../model/notificationModel.js";
import { useStore } from "../model/store.js";
import { useStudio } from "../studio/Studio.jsx";
import { Icon } from "../ui/Icon.jsx";
import { Overlay, SimTag, dayWord, useT, useViewport } from "../ui/kit.jsx";
import { CategoryBadge } from "./Inbox.jsx";

// Account & Settings (prototype). Replaces the "⋯" menu. Sign-out, profile,
// feedback and support are simulated; nothing leaves the browser.

export const SECTIONS = [
  { id: "account", icon: "user" },
  { id: "preferences", icon: "globe" },
  { id: "notifications", icon: "bell" },
  { id: "help", icon: "info" },
  { id: "advanced", icon: "gear" },
];
const LANG_NAME = { pt: "Português", en: "English", es: "Español" };

function Toggle({ checked, onChange, label, children }) {
  return (
    <label className="mw-switchrow">
      <span className="mw-grow">{children}</span>
      <input type="checkbox" role="switch" className="mw-switch" checked={checked} aria-label={label} onChange={e => onChange(e.target.checked)} />
    </label>
  );
}

function Segmented({ label, value, options, onChange }) {
  return (
    <div className="cfv2-segmented mw-seg-control" role="group" aria-label={label}>
      {options.map(([v, text]) => <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>{text}</button>)}
    </div>
  );
}

function AccountSection() {
  const t = useT();
  const { setUi } = useStore();
  const [confirm, setConfirm] = useState(false);
  const toast = text => setUi({ toast: { id: Date.now(), text, icon: "info" } });
  return (
    <>
      <div className="mw-profile">
        <span className="mw-avatar is-large" aria-hidden="true">{t("acc.initials")}</span>
        <div className="mw-grow">
          <strong>{t("acc.name")}</strong>
          <span className="mw-sec">{t("acc.email")}</span>
          <span className="mw-sec">{t("acc.role")}</span>
        </div>
      </div>
      <div className="mw-setlist">
        <button type="button" className="mw-setrow" onClick={() => toast(t("acc.profileSim"))}><Icon name="edit" size={17} /><span className="mw-grow">{t("acc.editProfile")}</span><SimTag /></button>
      </div>
      {!confirm
        ? <button type="button" className="cfv2-button cfv2-button-danger mw-btn" onClick={() => setConfirm(true)}>{t("acc.signOut")}</button>
        : (
          <div className="mw-confirm" role="alert">
            <p>{t("acc.signOutConfirm")}</p>
            <div className="mw-chiprow">
              <button type="button" className="cfv2-button cfv2-button-danger-solid mw-btn cfv2-button-small" onClick={() => { setConfirm(false); toast(t("acc.signedOutSim")); }}>{t("acc.signOut")}</button>
              <button type="button" className="cfv2-button cfv2-button-secondary mw-btn cfv2-button-small" onClick={() => setConfirm(false)}>{t("c.cancel")}</button>
            </div>
          </div>
        )}
    </>
  );
}

function PreferencesSection() {
  const t = useT();
  const { ui, setUi } = useStore();
  return (
    <>
      <div className="mw-setgroup">
        <h4>{t("app.language")}</h4>
        <Segmented label={t("app.language")} value={ui.lang} options={LANGS.map(l => [l, LANG_NAME[l]])} onChange={lang => setUi({ lang })} />
        <p className="mw-hint">{t("pref.langNote")}</p>
      </div>
      <div className="mw-setgroup">
        <h4>{t("pref.theme")}</h4>
        <Segmented label={t("pref.theme")} value={ui.theme || "system"} options={[["light", t("pref.light")], ["dark", t("pref.dark")], ["system", t("pref.system")]]}
          onChange={v => setUi({ theme: v === "system" ? null : v })} />
      </div>
    </>
  );
}

function NotificationsSection() {
  const t = useT();
  const { data, setUi, act } = useStore();
  const { permission, prefs } = data.notificationSettings;
  const stamp = s => `${dayWord(t, data, s.date)} ${t.stamp(s)}`;
  const toast = text => setUi({ toast: { id: Date.now(), text, icon: "bell" } });
  return (
    <>
      <div className={`mw-permcard is-${permission}`}>
        <Icon name={permission === "granted" ? "checkCircle" : "alertCircle"} size={20} />
        <div className="mw-grow">
          <strong>{t(`perm.${permission}.title`)}</strong>
          <p className="mw-sec">{t(`perm.${permission}.body`)}</p>
          {permission === "default" && <button type="button" className="cfv2-button cfv2-button-primary mw-btn cfv2-button-small" onClick={() => act("NOTIF_PERMISSION", { permission: "granted" })}>{t("perm.allow")}</button>}
        </div>
      </div>
      <div className="mw-setgroup">
        <h4>{t("dev.title")}</h4>
        <ul className="mw-devlist">
          {data.devices.map(d => (
            <li key={d.id} className={d.status === "ok" ? "" : "is-warn"}>
              <Icon name="phone" size={18} />
              <div className="mw-grow">
                <strong>{t(d.labelKey)}{d.current && <span className="mw-pill">{t("dev.current")}</span>}</strong>
                <span className="mw-sec">{t(d.kindKey)} · {t("dev.enabled", { time: stamp(d.enabledAt) })}</span>
                <span className={`mw-flag tone-${d.status === "ok" ? "success" : "warning"}`}>{d.status === "ok" ? t("dev.ok", { time: stamp(d.lastTest) }) : t("dev.silent", { time: stamp(d.lastTest) })}</span>
              </div>
              <button type="button" className="cfv2-button cfv2-button-tertiary mw-btn cfv2-button-small" onClick={() => toast(t("dev.testSent"))}>{t("dev.sendTest")}</button>
            </li>
          ))}
        </ul>
        <p className="mw-hint">{t("inbox.diagNote")}</p>
      </div>
      <div className="mw-setgroup">
        <h4>{t("pref.which")}</h4>
        <p className="mw-hint">{t("pref.whichNote")}</p>
        <div className="mw-setlist">
          {CATEGORIES.map(c => (
            <Toggle key={c.id} checked={prefs[c.id] !== false} label={t(`ncat.${c.id}`)} onChange={value => act("NOTIF_PREF", { category: c.id, value })}>
              <span className="mw-switchlabel"><Icon name={c.icon} size={16} />{t(`ncat.${c.id}`)}<CategoryBadge category={c} /></span>
            </Toggle>
          ))}
        </div>
      </div>
      <button type="button" className="mw-linkbtn" onClick={() => setUi({ overlay: { type: "inbox" } })}><Icon name="bell" size={15} />{t("pref.openInbox")}<Icon name="arrowR" size={14} /></button>
      <details className="mw-demo-states">
        <summary>{t("inbox.demoStates")}</summary>
        <div className="mw-chiprow">{["granted", "default", "denied"].map(p => <button key={p} type="button" className="mw-chip" aria-pressed={permission === p} onClick={() => act("NOTIF_PERMISSION", { permission: p })}>{t(`perm.${p}.short`)}</button>)}</div>
      </details>
    </>
  );
}

function HelpSection() {
  const t = useT();
  const { setUi } = useStore();
  const [text, setText] = useState("");
  const toast = msg => setUi({ toast: { id: Date.now(), text: msg, icon: "info" } });
  return (
    <>
      <div className="mw-setgroup">
        <h4>{t("help.feedback")}</h4>
        <label className="mw-field"><span>{t("help.feedbackLabel")}</span>
          <textarea rows={3} value={text} onChange={e => setText(e.target.value)} placeholder={t("help.feedbackPh")} />
        </label>
        <button type="button" className="cfv2-button cfv2-button-secondary mw-btn cfv2-button-small" disabled={!text.trim()} onClick={() => { setText(""); toast(t("help.feedbackSim")); }}>{t("help.send")}</button>
      </div>
      <div className="mw-setgroup">
        <h4>{t("help.whatsNew")}</h4>
        <ul className="mw-news">
          {["n1", "n2", "n3"].map(k => <li key={k}><strong>{t(`help.news.${k}.title`)}</strong><span className="mw-sec">{t(`help.news.${k}.body`)}</span></li>)}
        </ul>
      </div>
      <div className="mw-setgroup">
        <h4>{t("help.support")}</h4>
        <p className="mw-sec">{t("help.supportBody")}</p>
        <button type="button" className="mw-setrow" onClick={() => toast(t("help.supportSim"))}><Icon name="msg" size={17} /><span className="mw-grow">{t("help.contact")}</span><SimTag /></button>
      </div>
    </>
  );
}

function AdvancedSection() {
  const t = useT();
  const { data, ui, setUi, reset } = useStore();
  const { dispatch } = useStudio();
  const me = data.devices.find(d => d.current);
  const diag = {
    app: "manager-workspace-v3 prototype", lang: ui.lang, theme: ui.theme || "system",
    permission: data.notificationSettings.permission, devices: data.devices.map(d => ({ label: d.id, status: d.status })),
    currentDevice: me?.id, token: "never shown", serviceWorker: "not checked in prototype",
  };
  const copy = () => { try { navigator.clipboard?.writeText(JSON.stringify(diag, null, 2)).catch(() => {}); } catch { /* optional */ } setUi({ toast: { id: Date.now(), text: t("adv.copied"), icon: "clipboard" } }); };
  return (
    <details className="mw-advanced">
      <summary>{t("adv.show")}</summary>
      <div className="mw-setgroup">
        <h4>{t("adv.version")}</h4>
        <p className="mw-sec tnum">{t("adv.versionValue")}</p>
        <EnvironmentIndicator>{t("adv.sandbox")}</EnvironmentIndicator>
      </div>
      <div className="mw-setgroup">
        <h4>{t("adv.diag")}</h4>
        <dl className="mw-diaglist">
          <dt>{t("adv.d.permission")}</dt><dd>{t(`perm.${data.notificationSettings.permission}.short`)}</dd>
          <dt>{t("adv.d.device")}</dt><dd>{t("adv.d.deviceValue")}</dd>
          <dt>{t("adv.d.token")}</dt><dd>{t("adv.d.tokenValue")}</dd>
          <dt>{t("adv.d.sw")}</dt><dd>{t("adv.d.swValue")}</dd>
        </dl>
        <button type="button" className="cfv2-button cfv2-button-secondary mw-btn cfv2-button-small" onClick={copy}><Icon name="clipboard" size={15} />{t("adv.copy")}</button>
      </div>
      <div className="mw-setgroup">
        <h4>{t("adv.dev")}</h4>
        <div className="mw-chiprow">
          <button type="button" className="cfv2-button cfv2-button-tertiary mw-btn cfv2-button-small" onClick={reset}><Icon name="refresh" size={15} />{t("app.reset")}</button>
          <button type="button" className="cfv2-button cfv2-button-tertiary mw-btn cfv2-button-small" onClick={() => dispatch({ type: "RESET_ALL" })}><Icon name="sliders" size={15} />{t("adv.resetStudio")}</button>
        </div>
      </div>
    </details>
  );
}

const CONTENT = { account: AccountSection, preferences: PreferencesSection, notifications: NotificationsSection, help: HelpSection, advanced: AdvancedSection };

export function AccountSheet({ onClose, section: initial }) {
  const t = useT();
  const vp = useViewport();
  const [section, setSection] = useState(initial || (vp.compact ? null : "account"));
  const Body = section && CONTENT[section];
  const root = useRef(null);
  const last = useRef(section);
  // On phones the list and the page replace each other: move focus so it is never lost.
  useEffect(() => {
    if (!vp.compact || last.current === section) return;
    const target = section ? root.current?.querySelector(".mw-setpage .mw-linkbtn") : root.current?.querySelector(`[data-section="${last.current}"]`);
    target?.focus();
    last.current = section;
  }, [section, vp.compact]);
  const nav = (
    <nav className="mw-setnav" aria-label={t("acc.title")}>
      {SECTIONS.map(s => (
        <button key={s.id} type="button" data-section={s.id} className="mw-setnav-item" aria-current={section === s.id ? "page" : undefined} onClick={() => setSection(s.id)}>
          <Icon name={s.icon} size={18} /><span className="mw-grow"><strong>{t(`acc.s.${s.id}`)}</strong>{vp.compact && <span className="mw-sec">{t(`acc.s.${s.id}.hint`)}</span>}</span>
          {vp.compact && <Icon name="arrowR" size={16} />}
        </button>
      ))}
    </nav>
  );
  return (
    <Overlay title={t("acc.title")} onClose={onClose} wide={!vp.compact}>
      <div ref={root} className={`mw-settings${vp.compact ? " is-compact" : ""}`}>
        {(!vp.compact || !section) && nav}
        {Body && (
          <section className="mw-setpage" aria-labelledby="mw-setpage-title">
            {vp.compact && <button type="button" className="mw-linkbtn" onClick={() => setSection(null)} data-autofocus><Icon name="arrowL" size={16} />{t("acc.title")}</button>}
            <h3 id="mw-setpage-title">{t(`acc.s.${section}`)}</h3>
            <Body />
          </section>
        )}
      </div>
    </Overlay>
  );
}
