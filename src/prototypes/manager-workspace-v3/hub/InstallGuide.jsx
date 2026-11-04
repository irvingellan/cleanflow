import { useState } from "react";
import { Icon } from "../ui/Icon.jsx";
import { SimTag, useT } from "../ui/kit.jsx";

// Add-to-Home-Screen guidance. The page can tell whether THIS window was opened
// from the Home Screen (display-mode standalone); it cannot tell whether the app
// was added at some other time. The copy never claims more than that.

function ShareGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12M8 7l4-4 4 4" /><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </svg>
  );
}
function DotsGlyph() {
  return <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor"><circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" /></svg>;
}

/** A tiny drawing of the phone screen for each step (decorative). */
function StepArt({ kind }) {
  return (
    <div className={`ig-art ig-art-${kind}`} aria-hidden="true">
      <div className="ig-art-screen">
        {kind === "ios-share" && <div className="ig-art-bar"><span /><span /><span className="is-hot"><ShareGlyph /></span><span /><span /></div>}
        {kind === "ios-add" && <div className="ig-art-sheet"><span>…</span><span className="is-hot"><Icon name="plus" size={12} />Add to Home Screen</span><span>…</span></div>}
        {kind === "ios-confirm" && <div className="ig-art-sheet"><span className="ig-art-icon">CF</span><span className="is-hot">Add</span></div>}
        {kind === "home" && <div className="ig-art-home">{["", "", "CF", "", "", ""].map((x, i) => <span key={i} className={x ? "is-hot" : ""}>{x}</span>)}</div>}
        {kind === "and-menu" && <div className="ig-art-top"><span className="is-hot"><DotsGlyph /></span></div>}
        {kind === "and-install" && <div className="ig-art-sheet"><span>…</span><span className="is-hot"><Icon name="phone" size={12} />Install app</span><span>…</span></div>}
      </div>
    </div>
  );
}

export function InstallGuide({ platform: initial = "ios", context = "browser", installPrompt = false, onInstalled, onSkip }) {
  const t = useT();
  const [platform, setPlatform] = useState(initial === "mac" ? "ios" : initial);
  const [nativeDialog, setNativeDialog] = useState(false);
  const steps = platform === "ios"
    ? [["ios-share", "ig.ios.1"], ["ios-add", "ig.ios.2"], ["ios-confirm", "ig.ios.3"], ["home", "ig.ios.4"]]
    : [["and-menu", "ig.and.1"], ["and-install", "ig.and.2"], ["home", "ig.and.3"]];
  return (
    <section className="ig" aria-labelledby="ig-title">
      <h3 id="ig-title">{t("ig.title")}</h3>
      <div className="cfv2-segmented mw-seg-control" role="group" aria-label={t("ig.platform")}>
        {["ios", "android"].map(p => <button key={p} type="button" aria-pressed={platform === p} onClick={() => setPlatform(p)}>{t(`ig.p.${p}`)}</button>)}
      </div>
      <p className={`ig-context tone-${context === "standalone" ? "success" : "info"}`}><Icon name={context === "standalone" ? "checkCircle" : "info"} size={15} />{t(`ig.ctx.${context}`)}</p>
      {platform === "android" && installPrompt && (
        <div className="ig-prompt">
          <p>{t("ig.and.promptAvailable")}</p>
          <button type="button" className="cfv2-button cfv2-button-primary mw-btn mw-btn-block" onClick={() => setNativeDialog(true)}><Icon name="phone" size={17} />{t("ig.and.installBtn")}</button>
          <p className="mw-hint">{t("ig.and.orManual")}</p>
        </div>
      )}
      <ol className="ig-steps">
        {steps.map(([art, key], i) => (
          <li key={key}>
            <StepArt kind={art} />
            <div><span className="ig-n">{i + 1}</span><p>{t(key)}</p>{key === "ig.ios.2" && <p className="mw-hint">{t("ig.ios.2b")}</p>}{key === "ig.and.2" && <p className="mw-hint">{t("ig.and.2b")}</p>}</div>
          </li>
        ))}
      </ol>
      <p className="mw-hint ig-why"><Icon name="bell" size={14} />{t(platform === "ios" ? "ig.ios.why" : "ig.and.why")}</p>
      <div className="ig-actions">
        {onInstalled && <button type="button" className="cfv2-button cfv2-button-primary mw-btn mw-btn-block" onClick={onInstalled}>{t("ig.done")}</button>}
        {onSkip && <button type="button" className="cfv2-button cfv2-button-tertiary mw-btn mw-btn-block" onClick={onSkip}>{t("ig.later")}</button>}
      </div>
      {nativeDialog && (
        <div className="dh-prompt" role="alertdialog" aria-modal="true" aria-label={t("ig.and.dialogTitle")}>
          <div className="dh-prompt-card">
            <SimTag />
            <p><strong>{t("ig.and.dialogTitle")}</strong></p>
            <p className="mw-sec">cleanflow.app</p>
            <div className="dh-prompt-actions">
              <button type="button" onClick={() => setNativeDialog(false)}>{t("c.cancel")}</button>
              <button type="button" className="is-strong" onClick={() => { setNativeDialog(false); onInstalled?.(); }}>{t("ig.and.dialogInstall")}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
