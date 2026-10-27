import { useMemo, useState } from "react";
import { Banner } from "../../../components/v2/primitives.jsx";
import { checklistItems, clients } from "../model/demoData.js";
import { useStore } from "../model/store.js";
import { rangeFor } from "../model/time.js";
import { Icon } from "../ui/Icon.jsx";
import { Overlay, SimTag, useT } from "../ui/kit.jsx";

const btn = (variant, extra = "") => `cfv2-button cfv2-button-${variant === "quiet" ? "tertiary" : variant} mw-btn ${extra}`.trim();
const clone = value => JSON.parse(JSON.stringify(value));

/* ---------------- Property: instructions, access and checklist template ---------------- */
export function PropertySheet({ propertyId, onClose }) {
  const t = useT();
  const { data, act } = useStore();
  const property = data.properties.find(p => p.id === propertyId);
  const template = data.templates[property.checklistTemplateId];
  const [sections, setSections] = useState(() => clone(template.sections));
  const [reveal, setReveal] = useState(false);
  const [savedVersion, setSavedVersion] = useState(null);
  const [view, setView] = useState("edit");
  const [openItem, setOpenItem] = useState(null);
  const lang = t.lang;
  const dirty = JSON.stringify(sections) !== JSON.stringify(template.sections);
  const pinned = data.jobs.filter(j => j.propertyId === propertyId && (j.checklist?.state || "none") !== "none");
  const upcoming = data.jobs.filter(j => j.propertyId === propertyId && j.date >= data.clock.date && j.status !== "COMPLETED" && (j.checklist?.state || "none") === "none").length;
  const setLabel = (obj, value) => ({ ...obj, [lang]: value, ...(lang === "pt" ? {} : {}) });
  const update = fn => setSections(prev => { const next = clone(prev); fn(next); return next; });
  const move = (list, i, d) => { const j = i + d; if (j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]]; };
  const save = () => {
    act("TEMPLATE_SAVE", { templateId: template.id, sections });
    setSavedVersion(template.version + 1);
  };
  return (
    <Overlay title={property.name} onClose={onClose} wide footer={
      <button type="button" className={btn("primary")} disabled={!dirty} onClick={save}><Icon name="check" size={17} />{t("pr.save", { next: template.version + 1 })}</button>}>
      <p className="mw-sheet-sub">{property.area}</p>
      <section className="mw-sheet-section">
        <h3 className="mw-micro">{t("pr.instructions")}</h3>
        <p>{property.instructions[lang] || property.instructions.en}</p>
        <p className="mw-sec">{t("pr.instructionsNote")}</p>
      </section>
      <section className="mw-sheet-section">
        <h3 className="mw-micro">{t("pr.access")} <SimTag kind="proposal" /></h3>
        <div className="mw-access">
          <Icon name={reveal ? "unlock" : "lock"} />
          <span className="mw-mono">{reveal ? t("pr.code", { code: property.accessCode }) : "•••• ••••"}</span>
          <button type="button" className={btn("quiet", "cfv2-button-small")} onClick={() => setReveal(r => !r)}>{reveal ? t("pr.hide") : t("pr.reveal")}</button>
        </div>
        <p className="mw-hint"><Icon name="info" size={14} />{t("pr.accessRule")}</p>
      </section>
      <section className="mw-sheet-section">
        <div className="mw-section-head">
          <h3 className="mw-micro">{t("pr.template")}</h3>
          <span className="mw-tag">{t("pr.version", { v: template.version })}</span>
          <span className="mw-sec">{t("pr.usedBy", { count: upcoming })} · {t("pr.itemsCount", { count: checklistItems(sections).length })}</span>
          {dirty && <span className="mw-flag tone-attention">{t("pr.unsaved")}</span>}
        </div>
        {savedVersion && !dirty && <Banner tone="success" title={t("pr.saved", { v: savedVersion })} />}
        <p className="mw-hint"><Icon name="history" size={14} />{t("pr.versionNote", { next: template.version + 1 })}</p>
        <div className="cfv2-segmented mw-seg-control" role="group" aria-label={t("pr.template")}>
          {["edit", "preview", "history"].map(v => <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>{t(`pr.view.${v}`)}</button>)}
        </div>
        {view === "preview" && <TemplatePreview sections={sections} lang={lang} />}
        {view === "history" && (
          <div className="mw-tplhistory">
            <ol>
              {[...template.history].reverse().map(h => (
                <li key={h.version}><span className="mw-tag">{t("pr.version", { v: h.version })}</span>{h.version === template.version ? <strong>{t("pr.current")}</strong> : <span className="mw-sec">{t(`pr.h.${h.note}`)}</span>}
                  <span className="mw-sec">{t("pr.h.inUse", { count: pinned.filter(j => j.checklist.templateVersion === h.version).length })}</span></li>
              ))}
            </ol>
            <p className="mw-hint"><Icon name="lock" size={14} />{t("pr.immutable")}</p>
          </div>
        )}
        {view === "edit" && (<>
        <ol className="mw-template">
          {sections.map((section, si) => (
            <li key={section.id} className="mw-template-section">
              <div className="mw-template-row">
                <input aria-label={t("pr.newSection")} className="mw-input-strong" value={section.title[lang] || section.title.en || ""} onChange={e => update(s => { s[si].title = setLabel(s[si].title, e.target.value); })} />
                <button type="button" className="mw-iconbtn" aria-label={t("pr.moveUp")} onClick={() => update(s => move(s, si, -1))}><Icon name="up" size={16} /></button>
                <button type="button" className="mw-iconbtn" aria-label={t("pr.moveDown")} onClick={() => update(s => move(s, si, 1))}><Icon name="down" size={16} /></button>
                <button type="button" className="mw-iconbtn" aria-label={t("pr.remove")} onClick={() => update(s => s.splice(si, 1))}><Icon name="trash" size={16} /></button>
              </div>
              <ul>
                {section.items.map((item, ii) => (
                  <li key={item.id} className={`mw-template-item${openItem === item.id ? " is-open" : ""}`}>
                    <div className="mw-template-row">
                      <input aria-label={t("pr.newItem")} value={item.label[lang] || item.label.en || ""} onChange={e => update(s => { s[si].items[ii].label = setLabel(s[si].items[ii].label, e.target.value); })} />
                      <span className="mw-tplbadges">
                        <span className={`mw-tag${item.optional ? "" : " is-strong"}`}>{t(item.optional ? "pr.optional" : "pr.required")}</span>
                        {item.photo && <span className="mw-tag"><Icon name="camera" size={12} />{t("pr.photo")}</span>}
                        {item.allowNa && <span className="mw-tag">{t("pr.na")}</span>}
                      </span>
                      <button type="button" className="mw-iconbtn" aria-expanded={openItem === item.id} aria-label={t("pr.itemDetails")} onClick={() => setOpenItem(openItem === item.id ? null : item.id)}><Icon name="edit" size={16} /></button>
                      <button type="button" className="mw-iconbtn" aria-label={t("pr.moveUp")} onClick={() => update(s => move(s[si].items, ii, -1))}><Icon name="up" size={16} /></button>
                      <button type="button" className="mw-iconbtn" aria-label={t("pr.remove")} onClick={() => update(s => s[si].items.splice(ii, 1))}><Icon name="trash" size={16} /></button>
                    </div>
                    {openItem === item.id && (
                      <div className="mw-template-details">
                        <div className="cfv2-segmented mw-seg-control" role="group" aria-label={t("pr.required")}>
                          <button type="button" aria-pressed={!item.optional} onClick={() => update(s => { s[si].items[ii].optional = false; })}>{t("pr.required")}</button>
                          <button type="button" aria-pressed={Boolean(item.optional)} onClick={() => update(s => { s[si].items[ii].optional = true; })}>{t("pr.optional")}</button>
                        </div>
                        <label className="mw-check mw-check-small"><input type="checkbox" checked={Boolean(item.photo)} onChange={e => update(s => { s[si].items[ii].photo = e.target.checked; })} /><Icon name="camera" size={14} />{t("pr.photoNeeded")}</label>
                        {item.photo && <label className="mw-field"><span>{t("pr.photoHint")}</span><input value={item.photoHint?.[lang] || ""} placeholder={t("pr.photoHintPh")} onChange={e => update(s => { s[si].items[ii].photoHint = setLabel(s[si].items[ii].photoHint || {}, e.target.value); })} /></label>}
                        <label className="mw-check mw-check-small"><input type="checkbox" checked={Boolean(item.allowNa)} onChange={e => update(s => { s[si].items[ii].allowNa = e.target.checked; })} />{t("pr.allowNa")}</label>
                        <label className="mw-field"><span>{t("pr.note")}</span><input value={item.note?.[lang] || ""} placeholder={t("pr.notePh")} onChange={e => update(s => { s[si].items[ii].note = setLabel(s[si].items[ii].note || {}, e.target.value); })} /></label>
                        <p className="mw-hint">{t("pr.langNote")}</p>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              <button type="button" className="mw-linkbtn" onClick={() => update(s => { s[si].items.push({ id: `i${Date.now()}`, label: { pt: t("pr.newItem"), en: t("pr.newItem"), es: t("pr.newItem") } }); })}><Icon name="plus" size={15} />{t("pr.addItem")}</button>
            </li>
          ))}
        </ol>
        <button type="button" className={btn("secondary", "cfv2-button-small")} onClick={() => update(s => { s.push({ id: `s${Date.now()}`, title: { pt: t("pr.newSection"), en: t("pr.newSection"), es: t("pr.newSection") }, items: [] }); })}><Icon name="plus" size={15} />{t("pr.addSection")}</button>
        </>)}
      </section>
    </Overlay>
  );
}

/** Read-only preview of the template as the cleaner will see it. */
function TemplatePreview({ sections, lang }) {
  const t = useT();
  const text = obj => (obj ? obj[lang] || obj.en || obj.pt || "" : "");
  return (
    <div className="mw-tplpreview" aria-label={t("pr.view.preview")}>
      <p className="mw-hint">{t("pr.previewNote")}</p>
      {sections.map(section => (
        <section key={section.id} className="mw-tplpreview-section">
          <h4>{text(section.title)}</h4>
          <ul>
            {section.items.map(item => (
              <li key={item.id}>
                <span className="mw-tplpreview-box" aria-hidden="true">{item.photo ? <Icon name="camera" size={14} /> : null}</span>
                <span className="mw-grow">
                  <span>{text(item.label)} {item.optional ? <em className="mw-sec">({t("pr.optional").toLowerCase()})</em> : null}</span>
                  {item.photo && <span className="mw-sec">{text(item.photoHint) || t("pr.photoDefaultHint")}</span>}
                  {text(item.note) && <span className="mw-flag tone-info"><Icon name="info" size={13} />{text(item.note)}</span>}
                </span>
                {item.allowNa && <span className="mw-tag">{t("pr.na")}</span>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/* ---------------- New service ---------------- */
export function NewServiceSheet({ onClose }) {
  const t = useT();
  const { data, act, setUi } = useStore();
  const [clientId, setClientId] = useState("c3");
  const props = useMemo(() => data.properties.filter(p => p.clientId === clientId), [data, clientId]);
  const [propertyId, setPropertyId] = useState("harbor");
  const property = data.properties.find(p => p.id === propertyId) || props[0];
  const [type, setType] = useState("turnover");
  const [customType, setCustomType] = useState("");
  const [date, setDate] = useState(data.clock.date);
  const [start, setStart] = useState("11:00");
  const [noTime, setNoTime] = useState(false);
  const [mode, setMode] = useState("fixed");
  const [amount, setAmount] = useState(property?.defaultPayout ? String(property.defaultPayout) : "");
  const [rate, setRate] = useState("28");
  const [hours, setHours] = useState("3");
  const [after, setAfter] = useState("offer");
  const template = property ? data.templates[property.checklistTemplateId] : null;
  const chooseProperty = id => { setPropertyId(id); const p = data.properties.find(x => x.id === id); setAmount(p?.defaultPayout ? String(p.defaultPayout) : ""); };
  const chooseClient = id => { setClientId(id); const first = data.properties.find(p => p.clientId === id); if (first) chooseProperty(first.id); };
  const comp = mode === "hourly" ? { mode: "hourly", rate: Number(rate), estHours: Number(hours), source: "manual" }
    : { mode: "fixed", amount: Number(amount) || null, source: property?.defaultPayout && Number(amount) === property.defaultPayout ? "property" : "manual" };
  const blocked = !property ? t("ns.pickProperty") : null;
  const create = () => {
    const id = `jn${Date.now().toString(36)}`;
    act("CREATE_JOB", { job: { id, propertyId: property.id, date, start: noTime ? null : start, type, customType: type === "custom" ? customType : undefined, comp } }, { text: t("ns.created") });
    const range = date === data.clock.date ? rangeFor("today", date, data.clock.date) : rangeFor("day", date, data.clock.date);
    setUi({ range, filter: "all", selectedJobId: id, hybridScreen: "work", overlay: after === "none" ? null : { type: after === "assign" ? "assign" : "offer", jobId: id } });
  };
  return (
    <Overlay title={t("ns.title")} onClose={onClose} footer={
      <button type="button" className={btn("primary")} disabled={Boolean(blocked)} onClick={create}><Icon name="plus" size={17} />{blocked || t("ns.create")} · {t(`ns.after.${after}`)}</button>}>
      <div className="mw-form">
        <div className="mw-fieldrow">
          <label className="mw-field"><span>{t("ns.client")}</span>
            <select value={clientId} onChange={e => chooseClient(e.target.value)}>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          </label>
          <label className="mw-field"><span>{t("ns.property")}</span>
            <select value={property?.id || ""} onChange={e => chooseProperty(e.target.value)}>{props.map(p => <option key={p.id} value={p.id}>{p.name} · {p.area}</option>)}</select>
          </label>
        </div>
        <fieldset className="mw-fieldset"><legend>{t("ns.type")}</legend>
          <div className="cfv2-segmented mw-seg-control mw-seg-wrap">
            {["turnover", "cleaning", "touchup", "custom"].map(k => <button key={k} type="button" aria-pressed={type === k} onClick={() => setType(k)}>{t(`type.${k}`)}</button>)}
          </div>
          {type === "custom" && <label className="mw-field"><span>{t("ns.customType")}</span><input value={customType} onChange={e => setCustomType(e.target.value)} /></label>}
        </fieldset>
        <div className="mw-fieldrow">
          <label className="mw-field"><span>{t("ns.date")}</span><input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
          <label className="mw-field"><span>{t("ns.time")}</span><input type="time" value={start} disabled={noTime} onChange={e => setStart(e.target.value)} /></label>
        </div>
        <label className="mw-check"><input type="checkbox" checked={noTime} onChange={e => setNoTime(e.target.checked)} />{t("ns.noTime")}</label>
        <fieldset className="mw-fieldset"><legend>{t("ns.comp")}</legend>
          <div className="cfv2-segmented mw-seg-control">
            <button type="button" aria-pressed={mode === "fixed"} onClick={() => setMode("fixed")}>{t("ns.fixed")}</button>
            <button type="button" aria-pressed={mode === "hourly"} onClick={() => setMode("hourly")}>{t("ns.hourly")} </button>
          </div>
          {mode === "fixed" ? (
            <>
              <label className="mw-field"><span>{t("ns.amount")}</span><input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} /></label>
              {property?.defaultPayout && Number(amount) === property.defaultPayout && <p className="mw-flag tone-success"><Icon name="checkCircle" size={14} />{t("ns.knownRate")}</p>}
            </>
          ) : (
            <>
              <div className="mw-fieldrow">
                <label className="mw-field"><span>{t("ns.rate")}</span><input inputMode="decimal" value={rate} onChange={e => setRate(e.target.value.replace(/[^0-9.]/g, ""))} /></label>
                <label className="mw-field"><span>{t("ns.estHours")}</span><input inputMode="decimal" value={hours} onChange={e => setHours(e.target.value.replace(/[^0-9.]/g, ""))} /></label>
              </div>
              <p><strong>{t("ns.estimate", { total: t.money((Number(rate) || 0) * (Number(hours) || 0)) })}</strong> <SimTag kind="proposal" /></p>
              <p className="mw-hint"><Icon name="info" size={14} />{t("ns.hourlyNote")}</p>
            </>
          )}
        </fieldset>
        {template && (
          <div className="mw-known is-on"><Icon name="clipCheck" size={18} /><span><strong>{t("ns.checklist")}</strong><span className="mw-sec">{t("ns.checklistFrom", { property: property.name, v: template.version, count: checklistItems(template.sections).length })}</span></span></div>
        )}
        <fieldset className="mw-fieldset"><legend>{t("ns.after")}</legend>
          <div className="cfv2-segmented mw-seg-control mw-seg-wrap">
            {["offer", "assign", "none"].map(k => <button key={k} type="button" aria-pressed={after === k} onClick={() => setAfter(k)}>{t(`ns.after.${k}`)}</button>)}
          </div>
        </fieldset>
      </div>
    </Overlay>
  );
}
