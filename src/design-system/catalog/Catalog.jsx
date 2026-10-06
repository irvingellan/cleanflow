import { useEffect, useState } from "react";
import * as UI from "../../components/v2/primitives.jsx";
import { useTheme } from "../../theme/theme.js";
import { languageOptions, useTranslation } from "../../i18n/translations.js";
import { serviceLifecyclePresentation } from "../../features/jobs/serviceLifecyclePresentation.js";
import { catalogTranslate } from "./messages.js";
import "./catalog.css";

export function Catalog() {
  const { language, setLanguage, translate } = useTranslation();
  const { theme, setTheme } = useTheme();
  const t = key => catalogTranslate(language, key);
  useEffect(() => { document.documentElement.lang = language; document.title = `CleanFlow · ${catalogTranslate(language, "title")}`; }, [language]);
  const [search, setSearch] = useState(""); const [filter, setFilter] = useState("all");
  const [confirmation, setConfirmation] = useState(false); const [notice, setNotice] = useState("");
  const [keyboard, setKeyboard] = useState(false); const [selected, setSelected] = useState(0);
  const lifecycle = serviceLifecyclePresentation({ job: { id: "synthetic", operationalStatus: "IN_PROGRESS", assignedCleanerIds: ["demo"], startedAt: "2026-01-01T10:00:00Z" } });
  const railProps = { presentation: lifecycle, translate, stateLabels: { completed: t("completed"), current: t("current"), future: t("future"), skipped: t("skipped"), "unknown-past": t("unknownPast") } };
  const options = [{ value: "all", label: t("all") }, { value: "active", label: t("active") }];
  return <main className="cfv2-catalog" data-catalog="design-system-v2-catalog">
    <header className="cfv2-catalog-header"><UI.EnvironmentIndicator>{t("environment")}</UI.EnvironmentIndicator><h1>{t("title")}</h1><p>{t("intro")}</p><div className="cfv2-catalog-controls">
      <UI.SegmentedControl label={t("theme")} value={theme} onChange={setTheme} options={[{ value: "light", label: t("light") }, { value: "dark", label: t("dark") }]} />
      <UI.Select label={t("language")} value={language} onChange={e => setLanguage(e.target.value)} options={languageOptions.map(({ code, label }) => ({ value: code, label }))} />
    </div></header>
    <div className="cfv2-catalog-columns">
      <div className="cfv2-catalog-stack">
        <UI.Panel title={t("states")}><div className="cfv2-catalog-state-list">{["neutral", "brand", "info", "attention", "warning", "risk", "success"].map(tone => <UI.StateLabel key={tone} tone={tone}>{t(tone)}</UI.StateLabel>)}</div><div className="cfv2-catalog-wrap">{["success", "attention", "risk", "info", "neutral"].map(tone => <UI.StatusPill key={tone} tone={tone}>{t(tone)}</UI.StatusPill>)}</div><div className="cfv2-catalog-wrap"><UI.InlineFlag tone="warning">{t("warning")}</UI.InlineFlag><UI.InlineFlag tone="attention">{t("stale")}</UI.InlineFlag></div><div className="cfv2-catalog-wrap"><UI.Tag>{t("demo")}</UI.Tag><UI.Tag>{t("unknown")}</UI.Tag><UI.Tag>{t("archived")}</UI.Tag><UI.Count>3</UI.Count></div><UI.EnvironmentIndicator environment="production">{t("build")}</UI.EnvironmentIndicator></UI.Panel>
        <UI.Panel title={t("actions")}><div className="cfv2-catalog-wrap"><UI.Button onClick={() => setNotice(t("previewOnly"))}>{t("primary")}</UI.Button><UI.Button variant="secondary">{t("secondary")}</UI.Button><UI.Button variant="tertiary" icon="arrow">{t("tertiary")}</UI.Button><UI.Button variant="danger">{t("danger")}</UI.Button><UI.Button variant="danger-solid">{t("danger")}</UI.Button><UI.Button disabled>{t("disabled")}</UI.Button><UI.Button busy>{t("busy")}</UI.Button><UI.Button blockedReason={t("blocked")} /><UI.IconButton icon="refresh" label={t("refresh")} /><UI.Button size="small" variant="secondary">{t("secondary")}</UI.Button><UI.Button size="large">{t("primary")}</UI.Button></div></UI.Panel>
        <UI.Panel title={t("inputs")}><div className="cfv2-catalog-field-grid"><UI.TextField label={t("guest")} defaultValue="Demo" /><UI.TextField label={t("time")} type="time" defaultValue="11:00" /><UI.TextField label={t("price")} defaultValue="abc" error={t("priceError")} /><UI.Select label={t("cleaner")} options={[{ value: "a", label: t("nameA") }, { value: "b", label: t("nameB") }]} /></div><UI.SearchField label={t("search")} value={search} onChange={e => setSearch(e.target.value)} clearLabel={t("clear")} /><div className="cfv2-catalog-wrap"><UI.SegmentedControl label={t("inputs")} options={options} value={filter} onChange={setFilter} /><UI.FilterChip selected={filter === "active"} icon="clock" onClick={() => setFilter(filter === "active" ? "all" : "active")}>{t("active")}</UI.FilterChip><UI.FilterToken removeLabel={t("filterRemove")} onRemove={() => setNotice(t("previewOnly"))}>{t("nameA")}</UI.FilterToken></div><div className="cfv2-catalog-wrap"><UI.Checkbox label={t("include")} defaultChecked /><UI.Checkbox label={t("showArchived")} /><UI.Radio label={t("nameA")} name="demo-cleaner" defaultChecked /><UI.Radio label={t("nameB")} name="demo-cleaner" /></div></UI.Panel>
        <UI.Panel title={t("typography")}><h2>{t("propertyA")}</h2><p>{t("intro")}</p><div className="cfv2-secondary">{t("client")}</div><UI.StateLabel>{t("next")}</UI.StateLabel></UI.Panel>
      </div>
      <div className="cfv2-catalog-stack">
        <UI.Panel title={t("surfaces")}><div className="cfv2-catalog-stack"><UI.Card selected><strong>{t("selected")}</strong></UI.Card><UI.Card subtle>{t("inset")}</UI.Card></div>{[t("propertyA"), t("propertyB")].map((property, i) => <UI.Row key={property} dense selected={selected === i} onClick={() => setSelected(i)}><UI.Avatar initials={i ? "DB" : "DA"} label={i ? t("nameB") : t("nameA")} /><div><strong>{property}</strong><div className="cfv2-secondary">{t("client")}</div></div><UI.StatusPill tone="success">{t("brand")}</UI.StatusPill></UI.Row>)}</UI.Panel>
        <UI.Panel title={t("lifecycle")}><UI.LifecycleRail {...railProps} compact /><hr /><UI.LifecycleRail {...railProps} /></UI.Panel>
        <UI.Panel title={t("decisions")}><div className="cfv2-catalog-stack"><UI.BeforeAfterDiff label={t("comparison")} beforeLabel={t("before")} afterLabel={t("after")} before="11:00" after="13:00" /><UI.ConsequenceDisclosure title={t("consequences")} will={[t("will")]} willNot={[t("willNot")]} /><UI.Button onClick={() => setConfirmation(true)}>{t("openConfirmation")}</UI.Button><UI.Disclosure title={t("details")}><UI.TextField label={t("guest")} defaultValue="Demo" /></UI.Disclosure><UI.TechnicalDetails title={t("technical")}><p>{t("environment")}</p><p>{__CLEANFLOW_BUILD_ID__}</p></UI.TechnicalDetails></div></UI.Panel>
        <UI.Panel title={t("mobile")}><UI.Checkbox label={t("keyboard")} checked={keyboard} onChange={e => setKeyboard(e.target.checked)} /><UI.StickyMobileAction label={t("next")} keyboardOpen={keyboard}><UI.Button icon="arrow" onClick={() => setNotice(t("previewOnly"))}>{t("checklist")}</UI.Button></UI.StickyMobileAction></UI.Panel>
      </div>
    </div>
    <section id="system-states" className="cfv2-catalog-system"><h2>{t("system")}</h2><div className="cfv2-catalog-columns">
      <UI.Panel title={t("loading")} actions={<UI.SyncLine status="updating">{t("loading")}</UI.SyncLine>}><UI.Skeleton label={t("loading")} /></UI.Panel>
      <UI.Panel title={t("updating")} actions={<UI.SyncLine status="updating">{t("updating")}</UI.SyncLine>}><UI.Row>{t("propertyA")}</UI.Row><UI.Row>{t("propertyB")}</UI.Row><UI.SyncLine>{t("updated")}</UI.SyncLine></UI.Panel>
      <UI.Panel title={t("stale")}><UI.StaleIndicator>{t("stale")}</UI.StaleIndicator><UI.Banner tone="attention" title={t("stale")} action={<UI.Button variant="secondary" onClick={() => setNotice(t("retryResult"))}>{t("retry")}</UI.Button>}>{t("errorBody")}</UI.Banner><UI.Row>{t("propertyA")}</UI.Row></UI.Panel>
      <UI.Panel title={t("slow")}><UI.Banner tone="info" title={t("slow")} action={<UI.Button variant="secondary" onClick={() => setNotice(t("retryResult"))}>{t("retry")}</UI.Button>}>{t("slowBody")}</UI.Banner><UI.Skeleton label={t("loading")} rows={2} /></UI.Panel>
      <UI.Panel title={t("error")}><UI.Disclosure title={t("details")} defaultOpen><UI.ErrorState title={t("error")} retryLabel={t("retry")} onRetry={() => setNotice(t("retryResult"))}>{t("errorBody")}</UI.ErrorState></UI.Disclosure></UI.Panel>
      <UI.Panel title={t("empty")}><UI.EmptyState title={t("empty")} action={<UI.Button onClick={() => setNotice(t("previewOnly"))}>{t("primary")}</UI.Button>}>{t("emptyBody")}</UI.EmptyState></UI.Panel>
    </div></section>
    <p role="status" className="cfv2-catalog-notice">{notice}</p>
    <UI.ConfirmationSheet open={confirmation} title={t("confirmTitle")} confirmLabel={t("confirm")} cancelLabel={t("cancel")} danger onCancel={() => setConfirmation(false)} onConfirm={() => { setConfirmation(false); setNotice(t("previewOnly")); }}><UI.ConsequenceDisclosure title={t("consequences")} will={[t("will")]} willNot={[t("willNot")]} /></UI.ConfirmationSheet>
  </main>;
}
