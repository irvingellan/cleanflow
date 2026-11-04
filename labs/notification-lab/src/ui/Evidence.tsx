import { useState } from "react";
import { buildReport, gabiSummary, inconsistencies, reportMarkdown } from "../engine/evidence.ts";
import { createSession, fingerprint, isTerminal, replay } from "../engine/session.ts";
import type { Locale } from "../engine/types.ts";
import { scenarioById } from "../scenarios/registry.ts";
import { Icon } from "./icons.tsx";
import { useT } from "./Panels.tsx";
import { clearLabData, loadSnapshot, saveSnapshot } from "./storage.ts";
import { encodeLink, type Lab } from "./useLab.ts";

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall back below */
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

/** Real local download through a Blob URL. Nothing leaves the browser. */
export function downloadFile(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function evidenceFileName(lab: Lab): string {
  const s = lab.session;
  return `cleanflow-notification-lab_${s.scenario.id}_seed${s.seed}_${fingerprint(s.world)}.json`;
}

export type Output = { title: string; text: string } | null;

export function EvidencePanel({ lab, locale, output, setOutput }: { lab: Lab; locale: Locale; output: Output; setOutput: (o: Output) => void }) {
  const t = useT(locale);
  const { session } = lab;
  const [confirmClear, setConfirmClear] = useState(false);
  const [seed, setSeed] = useState(String(session.seed));
  const problems = inconsistencies(session.world);
  const terminal = isTerminal(session);
  const passed = session.scenario.checks.filter((c) => c.test(session.world)).length;

  const exportJson = () => {
    downloadFile(evidenceFileName(lab), JSON.stringify(buildReport(session, locale), null, 2), "application/json");
    lab.flash(t("downloaded"));
  };
  const copyMd = async () => {
    const md = reportMarkdown(buildReport(session, locale), locale);
    setOutput({ title: t("copyMarkdown"), text: md });
    lab.flash((await copyText(md)) ? t("copied") : t("copyMarkdown"));
  };
  const gabi = async () => {
    const text = gabiSummary(session, locale);
    setOutput({ title: t("gabiSummary"), text });
    lab.flash((await copyText(text)) ? t("copied") : t("gabiSummary"));
  };
  const save = () => {
    const ok = saveSnapshot({ scenarioId: session.scenario.id, seed: session.seed, ops: session.ops, savedAt: new Date().toISOString() });
    lab.flash(ok ? t("saved") : "localStorage ✕");
  };
  const restore = () => {
    const snap = loadSnapshot();
    if (!snap) return lab.flash(t("nothingSaved"));
    const base = createSession(scenarioById(snap.scenarioId), snap.seed);
    lab.load(replay({ ...base, ops: snap.ops }));
    lab.flash(t("restored"));
  };
  const copyLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}${encodeLink(session)}`;
    lab.flash((await copyText(url)) ? t("copied") : url);
  };

  return (
    <div className="rbody" data-testid="evidence-panel">
      <p className="sec">{t("evidenceIntro")}</p>
      <div className="details">
        <dl className="kv">
          <dt>{t("seed")}</dt><dd className="mono">{session.seed}</dd>
          <dt>{t("fingerprint")}</dt><dd className="mono">{fingerprint(session.world)}</dd>
          <dt>{t("checks")}</dt><dd>{terminal ? `${passed}/${session.scenario.checks.length} ${t("pass")}` : t("notYet")}</dd>
          <dt>{t("inconsistencies")}</dt><dd data-testid="inconsistencies">{problems.length ? problems.join("; ") : "0"}</dd>
          {lab.lastReplay && (
            <>
              <dt>{t("replay")}</dt>
              <dd data-testid="replay-result">{lab.lastReplay.match ? t("replayIdentical", { print: lab.lastReplay.print }) : t("replayDiffers")}</dd>
            </>
          )}
        </dl>
      </div>
      <div className="actions-grid">
        <button className="btn btn-primary" onClick={exportJson} data-action="export-json"><Icon name="download" /> {t("exportJson")}</button>
        <button className="btn" onClick={copyMd} data-action="copy-md"><Icon name="copy" /> {t("copyMarkdown")}</button>
        <button className="btn" onClick={gabi} data-action="gabi-summary"><Icon name="doc" /> {t("gabiSummary")}</button>
        <button className="btn" onClick={copyLink} data-action="copy-link"><Icon name="link" /> {t("copyLink")}</button>
        <button className="btn" onClick={save} data-action="save"><Icon name="save" /> {t("saveSnapshot")}</button>
        <button className="btn" onClick={restore} data-action="restore"><Icon name="replay" /> {t("loadSnapshot")}</button>
        <button className="btn btn-danger" onClick={() => setConfirmClear(true)} data-action="clear"><Icon name="trash" /> {t("clearAll")}</button>
      </div>
      <div className="field-row">
        <label className="field"><span>{t("seed")}</span>
          <input type="number" value={seed} onChange={(e) => setSeed(e.target.value)} data-testid="seed-input" />
        </label>
        <div className="field"><span>&nbsp;</span>
          <button className="btn" onClick={() => lab.reset(Number(seed) || 1)} data-action="apply-seed">{t("reset")} · {t("seed")}</button>
        </div>
      </div>
      {confirmClear && (
        <div className="note tone-risk" role="alertdialog" aria-label={t("clearAll")}>
          <strong>{t("clearAll")}</strong>
          <span>{t("clearAllConfirm")}</span>
          <div className="job-card-actions">
            <button className="btn btn-danger" onClick={() => { clearLabData(); setConfirmClear(false); lab.reset(); lab.flash(t("cleared")); }} data-action="confirm-clear">{t("confirm")}</button>
            <button className="btn" onClick={() => setConfirmClear(false)}>{t("cancel")}</button>
          </div>
        </div>
      )}
      {output && (
        <div className="section">
          <h3>{output.title}</h3>
          <textarea readOnly value={output.text} aria-label={output.title} data-testid="evidence-output" style={{ width: "100%", minHeight: 260, padding: 10, borderRadius: 12, border: "1px solid var(--c-input)", fontFamily: "var(--mono)", fontSize: 12 }} />
        </div>
      )}
    </div>
  );
}
