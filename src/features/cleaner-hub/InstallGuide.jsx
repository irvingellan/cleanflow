import { useState } from "react";
import { HubIcon } from "./HubIcon.jsx";

// Add-to-Home-Screen guidance from the approved Cleaner Hub V1 visual. The page
// can tell whether THIS window was opened from the Home Screen (display-mode
// standalone); it cannot tell whether the app was added at some other time.

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

function StepArt({ kind }) {
  return (
    <div className={`ig-art ig-art-${kind}`} aria-hidden="true">
      <div className="ig-art-screen">
        {kind === "ios-share" && <div className="ig-art-bar"><span /><span /><span className="is-hot"><ShareGlyph /></span><span /><span /></div>}
        {kind === "ios-add" && <div className="ig-art-sheet"><span>…</span><span className="is-hot"><HubIcon name="plus" size={12} />Add to Home Screen</span><span>…</span></div>}
        {kind === "ios-confirm" && <div className="ig-art-sheet"><span className="ig-art-icon">CF</span><span className="is-hot">Add</span></div>}
        {kind === "home" && <div className="ig-art-home">{["", "", "CF", "", "", ""].map((label, index) => <span key={index} className={label ? "is-hot" : ""}>{label}</span>)}</div>}
        {kind === "and-menu" && <div className="ig-art-top"><span className="is-hot"><DotsGlyph /></span></div>}
        {kind === "and-install" && <div className="ig-art-sheet"><span>…</span><span className="is-hot"><HubIcon name="phone" size={12} />Install app</span><span>…</span></div>}
      </div>
    </div>
  );
}

/**
 * @param {{ t: Function, platform: "ios"|"android"|"other", displayMode: "browser"|"standalone"|"unknown",
 *   installPrompt?: { prompt: Function } | null, onInstalled?: Function, onSkip?: Function }} props
 */
export function InstallGuide({ t, platform: initial, displayMode, installPrompt = null, onInstalled, onSkip }) {
  const [platform, setPlatform] = useState(initial === "android" ? "android" : "ios");
  const steps = platform === "ios"
    ? [["ios-share", "ig.ios.1"], ["ios-add", "ig.ios.2"], ["ios-confirm", "ig.ios.3"], ["home", "ig.ios.4"]]
    : [["and-menu", "ig.and.1"], ["and-install", "ig.and.2"], ["home", "ig.and.3"]];

  async function promptInstall() {
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice?.outcome === "accepted") onInstalled?.();
    } catch {
      // The browser refused; the manual steps below remain.
    }
  }

  return (
    <section className="ig" aria-labelledby="ig-title">
      <h3 id="ig-title">{t("ig.title")}</h3>
      <div className="cfv2-segmented mw-seg-control" role="group" aria-label={t("ig.platform")}>
        {["ios", "android"].map((id) => <button key={id} type="button" aria-pressed={platform === id} onClick={() => setPlatform(id)}>{t(`ig.p.${id}`)}</button>)}
      </div>
      <p className={`ig-context tone-${displayMode === "standalone" ? "success" : "info"}`}>
        <HubIcon name={displayMode === "standalone" ? "checkCircle" : "info"} size={15} />{t(`ig.ctx.${displayMode}`)}
      </p>
      {platform === "android" && installPrompt && (
        <div className="ig-prompt">
          <p>{t("ig.and.promptAvailable")}</p>
          <button type="button" className="cfv2-button cfv2-button-primary mw-btn mw-btn-block" onClick={promptInstall}><HubIcon name="phone" size={17} />{t("ig.and.installBtn")}</button>
          <p className="mw-hint">{t("ig.and.orManual")}</p>
        </div>
      )}
      <ol className="ig-steps">
        {steps.map(([art, key], position) => (
          <li key={key}>
            <StepArt kind={art} />
            <div><span className="ig-n">{position + 1}</span><p>{t(key)}</p>{key === "ig.ios.2" && <p className="mw-hint">{t("ig.ios.2b")}</p>}{key === "ig.and.2" && <p className="mw-hint">{t("ig.and.2b")}</p>}</div>
          </li>
        ))}
      </ol>
      <p className="mw-hint ig-why"><HubIcon name="phone" size={14} />{t(platform === "ios" ? "ig.ios.why" : "ig.and.why")}</p>
      <div className="ig-actions">
        {onInstalled && <button type="button" className="cfv2-button cfv2-button-primary mw-btn mw-btn-block" onClick={onInstalled}>{t("ig.done")}</button>}
        {onSkip && <button type="button" className="cfv2-button cfv2-button-tertiary mw-btn mw-btn-block" onClick={onSkip}>{t("ig.later")}</button>}
      </div>
    </section>
  );
}
