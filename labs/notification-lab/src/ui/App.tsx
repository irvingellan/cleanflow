import { useEffect, useMemo, useState } from "react";
import { buildReport, reportMarkdown } from "../engine/evidence.ts";
import { createSession } from "../engine/session.ts";
import type { Locale } from "../engine/types.ts";
import { notificationCopy, ui } from "../i18n/messages.ts";
import { GABI_SCENARIOS, scenarioById } from "../scenarios/registry.ts";
import { downloadFile, EvidencePanel, evidenceFileName, type Output } from "./Evidence.tsx";
import { Icon } from "./icons.tsx";
import { Catalog, ControlBar, ScenarioHeader, StatePanel, StatusChips, Trail, useT } from "./Panels.tsx";
import { Phone } from "./Phone.tsx";
import { loadPrefs, savePrefs } from "./storage.ts";
import { decodeLink, sessionFromLink, useLab, type Lab } from "./useLab.ts";

const BASE_PHONES = ["gabi-iphone", "ana-iphone", "bia-android"];
const EXTRA_PHONES = ["carla-iphone", "gabi-ipad", "dora-android"];

function initialSession() {
  const link = typeof window !== "undefined" ? decodeLink(window.location.hash) : null;
  if (link) return sessionFromLink(link);
  return createSession(scenarioById("M01"));
}

function Stage({ lab, locale, simple, onExpand }: { lab: Lab; locale: Locale; simple?: boolean; onExpand: (id: string) => void }) {
  const t = useT(locale);
  const w = lab.session.world;
  const [extra, setExtra] = useState<string>(lab.session.scenario.extraDevice ?? "none");
  useEffect(() => setExtra(lab.session.scenario.extraDevice ?? "none"), [lab.session.scenario.id, lab.session.scenario.extraDevice]);
  const options = EXTRA_PHONES.filter((id) => w.devices[id]?.visible);
  const phones = [...BASE_PHONES, ...(extra !== "none" && w.devices[extra]?.visible ? [extra] : [])];
  return (
    <section className="section" aria-label={t("phones")}>
      <div className="stage-head">
        <h2 className="panel-title">{t("phones")}</h2>
        <span className="sim-badge">{t("simulated")}</span>
        {!simple && (
          <label className="field" style={{ marginLeft: "auto", gridAutoFlow: "column", alignItems: "center" }}>
            <span>{t("extraPhone")}</span>
            <select value={extra} onChange={(e) => setExtra(e.target.value)} data-testid="extra-phone">
              <option value="none">{t("none")}</option>
              {options.map((id) => <option key={id} value={id}>{w.devices[id]!.label}</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="stage">
        {phones.map((id) => (
          <Phone key={id} world={w} deviceId={id} locale={locale} apply={lab.apply} simple={simple} onExpand={() => onExpand(id)} />
        ))}
      </div>
    </section>
  );
}

function GabiView({ lab, locale, onExpand }: { lab: Lab; locale: Locale; onExpand: (id: string) => void }) {
  const t = useT(locale);
  const sc = lab.session.scenario;
  const w = lab.session.world;
  const [tab, setTab] = useState<"list" | "phones">("phones");
  const watch = () => {
    lab.reset();
    window.setTimeout(() => lab.run(), 50);
  };
  return (
    <div className="gabi">
      <div className="mtabs is-gabi" role="tablist">
        <button role="tab" aria-selected={tab === "list"} onClick={() => setTab("list")}>{t("tabScenarios")}</button>
        <button role="tab" aria-selected={tab === "phones"} onClick={() => setTab("phones")}>{t("tabPhones")}</button>
      </div>
      <nav className="gabi-list" data-mtab="list" data-active={tab === "list"} aria-label={t("tabScenarios")}>
        <p className="sec">{t("gabiIntro")}</p>
        {GABI_SCENARIOS.map((id) => {
          const s = scenarioById(id);
          return (
            <button key={id} className="gabi-card" aria-current={sc.id === id} onClick={() => { lab.selectScenario(id); setTab("phones"); }} data-scenario={id}>
              <strong>{s.name[locale]}</strong>
              <span className="sec">{(s.gabiView ?? s.expectedResult)[locale]}</span>
              <span className="cat-chips">
                <span className={`chip ${s.proposal ? "tone-attn" : "tone-ok"}`}>{s.proposal ? t("stPENDING") : t("stPUBLISHED")}</span>
              </span>
            </button>
          );
        })}
      </nav>
      <main className="gabi-main" data-mtab="phones" data-active={tab === "phones"}>
        <section className="card gabi-explain">
          <span className="micro">{sc.id}</span>
          <h2>{sc.name[locale]}</h2>
          <p>{(sc.gabiView ?? sc.expectedResult)[locale]}</p>
          <div className={`banner ${sc.proposal ? "tone-attn" : "tone-info"}`}>
            <Icon name={sc.proposal ? "alert" : "check"} /> {t("gabiStatus")} {sc.proposal ? t("gabiNo") : t("gabiYes")}
          </div>
          <div className="job-card-actions">
            <button className="btn btn-primary btn-large" onClick={watch} data-control="gabi-play"><Icon name="play" /> {t("gabiPlay")}</button>
            <button className="btn btn-large" onClick={lab.replay} disabled={!lab.session.ops.length}><Icon name="replay" /> {t("replay")}</button>
          </div>
          {w.events.length > 0 && (
            <ul className="gabi-feed" data-testid="gabi-feed">
              {w.events.map((e) => {
                const copy = notificationCopy(locale, e);
                return (
                  <li key={e.eventId}>
                    <Icon name="bell" />
                    <span><b>{e.recipients.map((r) => w.users[r]?.displayName).join(", ")}</b>: “{copy.title}” — {copy.body}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <Stage lab={lab} locale={locale} simple onExpand={onExpand} />
      </main>
    </div>
  );
}

export function App() {
  const prefs = useMemo(() => loadPrefs(), []);
  const [locale, setLocale] = useState<Locale>(prefs?.locale ?? "pt");
  const [mode, setMode] = useState<"gabi" | "lab">(prefs?.mode ?? "lab");
  const lab = useLab(useMemo(initialSession, []));
  const t = useT(locale);
  const [mtab, setMtab] = useState<"scenarios" | "phones" | "trail" | "evidence">("phones");
  const [rtab, setRtab] = useState<"trail" | "state" | "evidence">("trail");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [output, setOutput] = useState<Output>(null);

  useEffect(() => {
    savePrefs({ locale, mode });
    document.documentElement.lang = locale === "pt" ? "pt-BR" : locale;
  }, [locale, mode]);

  useEffect(() => {
    if (lab.lastReplay) lab.flash(lab.lastReplay.match ? ui(locale, "replayIdentical", { print: lab.lastReplay.print }) : ui(locale, "replayDiffers"));
  }, [lab.lastReplay]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (mode === "gabi" && !GABI_SCENARIOS.includes(lab.session.scenario.id)) lab.selectScenario(GABI_SCENARIOS[0]!);
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setExpanded(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const exportEvidence = () => {
    downloadFile(evidenceFileName(lab), JSON.stringify(buildReport(lab.session, locale), null, 2), "application/json");
    lab.flash(t("downloaded"));
  };
  const generateEvidence = () => {
    setOutput({ title: t("generateEvidence"), text: reportMarkdown(buildReport(lab.session, locale), locale) });
    setRtab("evidence");
    setMtab("evidence");
  };

  const right = (
    <div className="rpanel">
      <div className="rtabs" role="tablist" aria-label={t("tabTrail")}>
        <button role="tab" aria-selected={rtab === "trail"} onClick={() => setRtab("trail")} data-rtab="trail">{t("tabTrail")}</button>
        <button role="tab" aria-selected={rtab === "state"} onClick={() => setRtab("state")} data-rtab="state">{t("stateEditor")}</button>
        <button role="tab" aria-selected={rtab === "evidence"} onClick={() => setRtab("evidence")} data-rtab="evidence">{t("tabEvidence")}</button>
      </div>
      {rtab === "trail" && <Trail lab={lab} locale={locale} />}
      {rtab === "state" && <StatePanel lab={lab} locale={locale} />}
      {rtab === "evidence" && <EvidencePanel lab={lab} locale={locale} output={output} setOutput={setOutput} />}
    </div>
  );

  return (
    <div className="lab" data-mode={mode}>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true"><Icon name="bell" /></span>
          <div>
            <h1>{t("appTitle")} <span className="sim-badge" data-testid="sim-badge">{t("simulated")}</span></h1>
            <p>{t("subtitle")} · {t("version")} · {lab.session.scenario.id}</p>
          </div>
        </div>
        <span className="topbar-spacer" />
        <div className="seg" role="group" aria-label="Modo">
          <button aria-pressed={mode === "gabi"} onClick={() => setMode("gabi")} data-mode-btn="gabi">{t("modeGabi")}</button>
          <button aria-pressed={mode === "lab"} onClick={() => setMode("lab")} data-mode-btn="lab">{t("modeLab")}</button>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-small" onClick={() => lab.reset()} data-top="restart"><Icon name="reset" size={16} /> <span className="label">{t("restart")}</span></button>
          <button className="btn btn-small" onClick={exportEvidence} data-top="export"><Icon name="download" size={16} /> <span className="label">{t("exportEvidence")}</span></button>
        </div>
      </header>
      <p className="sr-only" role="status" aria-live="polite">{t("subtitle")}</p>

      {mode === "gabi" ? (
        <GabiView lab={lab} locale={locale} onExpand={setExpanded} />
      ) : (
        <div className="workspace">
          <div className="mtabs" role="tablist" aria-label="Seções">
            {(["scenarios", "phones", "trail", "evidence"] as const).map((k) => (
              <button key={k} role="tab" aria-selected={mtab === k} onClick={() => { setMtab(k); if (k === "evidence") setRtab("evidence"); if (k === "trail" && rtab === "evidence") setRtab("trail"); }} data-mtab-btn={k}>
                {t(k === "scenarios" ? "tabScenarios" : k === "phones" ? "tabPhones" : k === "trail" ? "tabTrail" : "tabEvidence")}
              </button>
            ))}
          </div>
          <aside className="col col-left" data-mtab="scenarios" data-active={mtab === "scenarios"}>
            <Catalog lab={lab} locale={locale} />
          </aside>
          <main className="col col-center" data-mtab="phones" data-active={mtab === "phones"}>
            <ScenarioHeader lab={lab} locale={locale} />
            <Stage lab={lab} locale={locale} onExpand={setExpanded} />
          </main>
          <aside className="col col-right" data-mtab="trail" data-active={mtab === "trail" || mtab === "evidence"}>
            {right}
          </aside>
        </div>
      )}

      <ControlBar lab={lab} locale={locale} setLocale={setLocale} channel={mode === "lab"} onEvidence={mode === "lab" ? generateEvidence : undefined} />
      {expanded && (
        <div className="scrim" onClick={() => setExpanded(null)}>
          <div className="modal modal-phone" role="dialog" aria-modal="true" aria-label={lab.session.world.devices[expanded]?.label} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head" style={{ width: "100%" }}>
              <StatusChips scenario={lab.session.scenario} t={t} />
              <button className="btn btn-small" onClick={() => setExpanded(null)} autoFocus><Icon name="x" size={14} /> {t("close")}</button>
            </div>
            <Phone world={lab.session.world} deviceId={expanded} locale={locale} apply={lab.apply} simple={mode === "gabi"} />
          </div>
        </div>
      )}
      {lab.notice && <div className="toast" role="status" data-testid="toast">{lab.notice}</div>}
    </div>
  );
}
