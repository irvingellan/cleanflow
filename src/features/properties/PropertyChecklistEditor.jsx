import { useMemo, useState } from "react";
import { useTranslation } from "../../i18n/translations.js";
import { globalChecklistDefinition } from "../checklists/checklistDefinition.js";
import { normalizePropertyChecklistSettings, resolveChecklistDefinition } from "../checklists/checklistRunDefinition.js";

// FB07: the manager edits this Property's checklist without code. Changes are
// a template for checklists created afterwards; a Run already created keeps
// its own frozen copy, so work in progress or under review is never rewritten.

const requiredPhotoItemId = "living-belongings";

function slug(text, taken) {
  const base = String(text || "item").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "item";
  let id = `custom-${base}`;
  for (let index = 2; taken.has(id); index += 1) id = `custom-${base}-${index}`;
  return id;
}

/** Editable rows per section, from the saved settings. */
function draftFrom(settings) {
  const normalized = normalizePropertyChecklistSettings(settings);
  const overrides = new Map(normalized.itemOverrides.map((override) => [override.id, override]));
  const sections = globalChecklistDefinition.sections.map((section) => {
    const standard = section.items.map((item, index) => {
      const override = overrides.get(item.id) || {};
      return {
        id: item.id, standard: true, labelKey: item.labelKey, label: override.label || "",
        hidden: override.hidden === true, optional: override.canBeNotApplicable ?? item.canBeNotApplicable === true,
        defaultOptional: item.canBeNotApplicable === true, requiresPhoto: item.requiresPhoto === true,
        position: override.order ?? index,
      };
    });
    const additional = normalized.additionalChecklistItems.filter((item) => item.sectionId === section.id)
      .map((item, index) => ({
        id: item.id, standard: false, label: item.label, hidden: false, optional: item.canBeNotApplicable === true,
        defaultOptional: false, requiresPhoto: false, position: item.order ?? 100 + index,
      }));
    const rows = [...standard, ...additional].map((row, index) => ({ row, index }))
      .sort((a, b) => a.row.position - b.row.position || a.index - b.index).map(({ row }) => row);
    return { id: section.id, titleKey: section.titleKey, rows };
  });
  const inventoryById = new Map(normalized.inventoryItems.map((item) => [item.id, item]));
  const inventory = [
    ...globalChecklistDefinition.inventoryItems.map((item) => ({
      id: item.id, standard: true, labelKey: item.labelKey,
      label: inventoryById.get(item.id)?.label || "", hidden: inventoryById.get(item.id)?.hidden === true,
    })),
    ...normalized.inventoryItems.filter((item) => !globalChecklistDefinition.inventoryItems.some((standard) => standard.id === item.id))
      .map((item) => ({ id: item.id, standard: false, label: item.label, hidden: false })),
  ];
  return {
    sections, inventory,
    photos: normalized.requiredPhotoTypes.map((type) => ({ id: type.id, label: type.label })),
    cleanerInstructions: normalized.cleanerInstructions || "",
  };
}

/** Settings to persist; only real differences from the standard checklist are written. */
function settingsFrom(draft) {
  const itemOverrides = [];
  const additionalChecklistItems = [];
  for (const section of draft.sections) {
    const standardOrder = section.rows.filter((row) => row.standard).map((row) => row.id);
    const defaultOrder = globalChecklistDefinition.sections.find((item) => item.id === section.id).items.map((item) => item.id);
    const reordered = section.rows.some((row, index) => row.standard && section.rows.slice(0, index).some((other) => !other.standard))
      || standardOrder.join() !== defaultOrder.join();
    section.rows.forEach((row, index) => {
      if (row.standard) {
        const override = { id: row.id };
        if (row.label.trim()) override.label = row.label.trim();
        if (row.hidden && row.id !== requiredPhotoItemId) override.hidden = true;
        if (row.optional !== row.defaultOptional && row.id !== requiredPhotoItemId) override.canBeNotApplicable = row.optional;
        if (reordered) override.order = index;
        if (Object.keys(override).length > 1) itemOverrides.push(override);
      } else if (row.label.trim()) {
        additionalChecklistItems.push({
          id: row.id, sectionId: section.id, label: row.label.trim(),
          ...(row.optional ? { canBeNotApplicable: true } : {}), ...(reordered ? { order: index } : { order: 100 + index }),
        });
      }
    });
  }
  return normalizePropertyChecklistSettings({
    itemOverrides, additionalChecklistItems,
    inventoryItems: draft.inventory.flatMap((item) => {
      if (item.standard) {
        if (item.hidden) return [{ id: item.id, hidden: true }];
        return item.label.trim() ? [{ id: item.id, label: item.label.trim() }] : [];
      }
      return item.label.trim() ? [{ id: item.id, label: item.label.trim() }] : [];
    }),
    requiredPhotoTypes: draft.photos.filter((photo) => photo.label.trim()).map((photo) => ({ id: photo.id, label: photo.label.trim() })),
    cleanerInstructions: draft.cleanerInstructions,
  });
}

export function PropertyChecklistEditor({ property, onSave }) {
  const { translate } = useTranslation();
  const [draft, setDraft] = useState(null);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);
  const saved = useMemo(() => resolveChecklistDefinition(property), [property]);
  const savedCount = saved.sections.reduce((sum, section) => sum + section.items.length, 0);
  const editsCount = useMemo(() => {
    const settings = normalizePropertyChecklistSettings(property.checklistSettings);
    return settings.itemOverrides.length + settings.additionalChecklistItems.length + settings.inventoryItems.length
      + settings.requiredPhotoTypes.length;
  }, [property]);
  const allIds = () => new Set(draft.sections.flatMap((section) => section.rows.map((row) => row.id)));

  const update = (change) => setDraft((current) => change(structuredClone(current)));
  const rowLabel = (row) => row.label || (row.labelKey ? translate(row.labelKey) : "");

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      await onSave(settingsFrom(draft));
      setDraft(null);
      setPreview(false);
      setStatus("saved");
    } catch {
      setStatus("error");
    } finally {
      setSaving(false);
    }
  }

  if (!draft) {
    return <section className="cf-block property-checklist" aria-labelledby="property-checklist-title">
      <div className="cf-block__header">
        <div>
          <h3 id="property-checklist-title">{translate("propertyChecklist.title")}</h3>
          <p className="cf-block__subtitle">{translate("propertyChecklist.summary", { count: savedCount, edits: editsCount })}</p>
        </div>
        <button className="button" type="button" onClick={() => { setDraft(draftFrom(property.checklistSettings)); setStatus(null); }}>
          {translate("propertyChecklist.edit")}
        </button>
      </div>
      {status === "saved" && <p className="property-history-state" role="status">{translate("propertyChecklist.saved")}</p>}
    </section>;
  }

  const previewDefinition = preview ? resolveChecklistDefinition({ checklistSettings: settingsFrom(draft) }) : null;

  return <section className="cf-block property-checklist is-editing" aria-labelledby="property-checklist-title">
    <div className="cf-block__header">
      <div>
        <h3 id="property-checklist-title">{translate("propertyChecklist.title")}</h3>
        <p className="cf-block__subtitle">{translate("propertyChecklist.futureOnly")}</p>
      </div>
      <button className="button" type="button" aria-pressed={preview} onClick={() => setPreview((value) => !value)}>
        {translate(preview ? "propertyChecklist.backToEdit" : "propertyChecklist.preview")}
      </button>
    </div>

    {preview ? <div className="property-checklist__preview" data-testid="checklist-preview">
      {previewDefinition.sections.map((section) => <div key={section.id}>
        <h4>{translate(section.titleKey)}</h4>
        <ul>{section.items.map((item) => <li key={item.id}>
          <span className="property-checklist__box" aria-hidden="true" />
          <span>{item.label || translate(item.labelKey)}</span>
          {item.canBeNotApplicable && <small>{translate("propertyChecklist.optionalShort")}</small>}
          {item.requiresPhoto && <small>{translate("propertyChecklist.photoShort")}</small>}
        </li>)}</ul>
      </div>)}
      {previewDefinition.requiredPhotoTypes.length > 0 && <div>
        <h4>{translate("propertyChecklist.photosTitle")}</h4>
        <ul>{previewDefinition.requiredPhotoTypes.map((photo) => <li key={photo.id}><span>{photo.label}</span></li>)}</ul>
      </div>}
    </div> : <>
      {draft.sections.map((section, sectionIndex) => <fieldset key={section.id} className="property-checklist__section">
        <legend>{translate(section.titleKey)}</legend>
        <ul>
          {section.rows.map((row, rowIndex) => <li key={row.id} className={row.hidden ? "is-hidden" : ""}>
            <span className="property-checklist__move">
              <button className="button button--small" type="button" aria-label={translate("propertyChecklist.moveUp", { item: rowLabel(row) })}
                disabled={rowIndex === 0} onClick={() => update((next) => {
                  const rows = next.sections[sectionIndex].rows; [rows[rowIndex - 1], rows[rowIndex]] = [rows[rowIndex], rows[rowIndex - 1]]; return next;
                })}>↑</button>
              <button className="button button--small" type="button" aria-label={translate("propertyChecklist.moveDown", { item: rowLabel(row) })}
                disabled={rowIndex === section.rows.length - 1} onClick={() => update((next) => {
                  const rows = next.sections[sectionIndex].rows; [rows[rowIndex + 1], rows[rowIndex]] = [rows[rowIndex], rows[rowIndex + 1]]; return next;
                })}>↓</button>
            </span>
            <input type="text" value={row.label} maxLength={160} disabled={row.hidden}
              aria-label={translate("propertyChecklist.itemText")}
              placeholder={row.labelKey ? translate(row.labelKey) : translate("propertyChecklist.newItemPlaceholder")}
              onChange={(event) => update((next) => { next.sections[sectionIndex].rows[rowIndex].label = event.target.value; return next; })} />
            {row.requiresPhoto
              ? <small className="property-checklist__note">{translate("propertyChecklist.requiredPhotoNote")}</small>
              : <label className="property-checklist__optional">
                <input type="checkbox" checked={row.optional} disabled={row.hidden}
                  onChange={(event) => update((next) => { next.sections[sectionIndex].rows[rowIndex].optional = event.target.checked; return next; })} />
                {translate("propertyChecklist.optional")}
              </label>}
            {!row.requiresPhoto && <button className="button button--text" type="button"
              onClick={() => update((next) => {
                const rows = next.sections[sectionIndex].rows;
                if (row.standard) rows[rowIndex].hidden = !row.hidden; else rows.splice(rowIndex, 1);
                return next;
              })}>
              {translate(row.standard ? (row.hidden ? "propertyChecklist.restore" : "propertyChecklist.remove") : "propertyChecklist.delete")}
            </button>}
          </li>)}
        </ul>
        <button className="button button--text" type="button" onClick={() => update((next) => {
          next.sections[sectionIndex].rows.push({ id: slug(`${section.id}-${Date.now().toString(36)}`, allIds()), standard: false, label: "", hidden: false, optional: false, defaultOptional: false, requiresPhoto: false });
          return next;
        })}>{translate("propertyChecklist.addItem")}</button>
      </fieldset>)}

      <fieldset className="property-checklist__section">
        <legend>{translate("propertyChecklist.inventoryTitle")}</legend>
        <ul>{draft.inventory.map((item, index) => <li key={item.id} className={item.hidden ? "is-hidden" : ""}>
          <input type="text" value={item.label} maxLength={120} disabled={item.hidden} aria-label={translate("propertyChecklist.itemText")}
            placeholder={item.labelKey ? translate(item.labelKey) : translate("propertyChecklist.newItemPlaceholder")}
            onChange={(event) => update((next) => { next.inventory[index].label = event.target.value; return next; })} />
          <button className="button button--text" type="button" onClick={() => update((next) => {
            if (item.standard) next.inventory[index].hidden = !item.hidden; else next.inventory.splice(index, 1);
            return next;
          })}>{translate(item.standard ? (item.hidden ? "propertyChecklist.restore" : "propertyChecklist.remove") : "propertyChecklist.delete")}</button>
        </li>)}</ul>
        <button className="button button--text" type="button" onClick={() => update((next) => {
          next.inventory.push({ id: slug(`supply-${Date.now().toString(36)}`, new Set(next.inventory.map((item) => item.id))), standard: false, label: "", hidden: false });
          return next;
        })}>{translate("propertyChecklist.addItem")}</button>
      </fieldset>

      <fieldset className="property-checklist__section">
        <legend>{translate("propertyChecklist.photosTitle")}</legend>
        <p className="cf-block__subtitle">{translate("propertyChecklist.photosHelp")}</p>
        <ul>{draft.photos.map((photo, index) => <li key={photo.id}>
          <input type="text" value={photo.label} maxLength={120} aria-label={translate("propertyChecklist.photoText")}
            placeholder={translate("propertyChecklist.photoPlaceholder")}
            onChange={(event) => update((next) => { next.photos[index].label = event.target.value; return next; })} />
          <button className="button button--text" type="button" onClick={() => update((next) => { next.photos.splice(index, 1); return next; })}>
            {translate("propertyChecklist.delete")}
          </button>
        </li>)}</ul>
        <button className="button button--text" type="button" onClick={() => update((next) => {
          next.photos.push({ id: slug(`photo-${Date.now().toString(36)}`, new Set(next.photos.map((photo) => photo.id))), label: "" });
          return next;
        })}>{translate("propertyChecklist.addPhoto")}</button>
      </fieldset>

      <label className="property-checklist__instructions">
        <span>{translate("propertyChecklist.instructions")}</span>
        <textarea rows={3} maxLength={2000} value={draft.cleanerInstructions}
          onChange={(event) => update((next) => { next.cleanerInstructions = event.target.value; return next; })} />
      </label>
    </>}

    {status === "error" && <p className="form-error" role="alert">{translate("propertyChecklist.error")}</p>}
    <div className="button-row">
      <button className="button button--primary" type="button" disabled={saving} onClick={save}>
        {translate(saving ? "propertyChecklist.saving" : "propertyChecklist.save")}
      </button>
      <button className="button" type="button" disabled={saving} onClick={() => { setDraft(null); setPreview(false); }}>
        {translate("common.cancel")}
      </button>
    </div>
  </section>;
}
