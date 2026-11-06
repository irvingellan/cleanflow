import { useEffect, useState } from "react";
import { useTranslation } from "../../i18n/translations.js";

// FB01: what the manager deliberately shares with the cleaner on a Job at
// this Property. Internal fields (key codes, access notes) are never shared
// by themselves; "Copy from internal notes" only pre-fills this form.

export const cleanerAccessFields = ["door", "gate", "lockbox", "parking", "wifi", "alarm", "note"];

function formFrom(property) {
  const access = property.cleanerAccess || {};
  return {
    shared: access.shared === true,
    ...Object.fromEntries(cleanerAccessFields.map((field) => [field, typeof access[field] === "string" ? access[field] : ""])),
  };
}

export function PropertyCleanerAccess({ property, onSave }) {
  const { translate } = useTranslation();
  const [form, setForm] = useState(() => formFrom(property));
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);
  useEffect(() => { if (!editing) setForm(formFrom(property)); }, [property, editing]);

  const filled = cleanerAccessFields.filter((field) => form[field].trim());
  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      await onSave({
        shared: form.shared,
        ...Object.fromEntries(cleanerAccessFields.map((field) => [field, form[field].trim().slice(0, 400)])),
      });
      setEditing(false);
      setStatus("saved");
    } catch {
      setStatus("error");
    } finally {
      setSaving(false);
    }
  }

  return <section className="cf-block property-access" aria-labelledby="property-access-title">
    <div className="cf-block__header">
      <div>
        <h3 id="property-access-title">{translate("propertyAccess.title")}</h3>
        <p className="cf-block__subtitle">{translate(form.shared ? "propertyAccess.sharedOn" : "propertyAccess.sharedOff")}</p>
      </div>
      {!editing && <button className="button" type="button" onClick={() => { setEditing(true); setStatus(null); }}>
        {translate("propertyAccess.edit")}
      </button>}
    </div>
    {!editing && filled.length > 0 && <dl className="detail-list property-access__list">
      {filled.map((field) => <div key={field}><dt>{translate(`propertyAccess.field.${field}`)}</dt><dd>{form[field]}</dd></div>)}
    </dl>}
    {editing && <div className="property-access__form">
      <label className="cleaner-push-alerts__row">
        <input type="checkbox" role="switch" checked={form.shared} onChange={(event) => set("shared", event.target.checked)} />
        <span>
          <strong>{translate("propertyAccess.switch")}</strong>
          <span>{translate("propertyAccess.switchHelp")}</span>
        </span>
      </label>
      {cleanerAccessFields.map((field) => <label key={field} className="property-access__field">
        <span>{translate(`propertyAccess.field.${field}`)}</span>
        {field === "note"
          ? <textarea rows={2} maxLength={400} value={form[field]} onChange={(event) => set(field, event.target.value)} />
          : <input type="text" maxLength={400} value={form[field]} onChange={(event) => set(field, event.target.value)} autoComplete="off" />}
      </label>)}
      <p className="cf-block__subtitle">{translate("propertyAccess.alsoShared")}</p>
      {(property.keyCodeInfo || property.garageParking || property.accessInstructions) && (
        <button className="button button--text" type="button" onClick={() => setForm((current) => ({
          ...current,
          door: current.door || property.keyCodeInfo || "",
          parking: current.parking || property.garageParking || "",
          note: current.note || property.accessInstructions || "",
        }))}>{translate("propertyAccess.copyInternal")}</button>
      )}
      <div className="button-row">
        <button className="button button--primary" type="button" disabled={saving} onClick={save}>
          {translate(saving ? "propertyAccess.saving" : "propertyAccess.save")}
        </button>
        <button className="button" type="button" disabled={saving} onClick={() => setEditing(false)}>{translate("common.cancel")}</button>
      </div>
    </div>}
    {status === "saved" && <p className="property-history-state" role="status">{translate("propertyAccess.saved")}</p>}
    {status === "error" && <p className="form-error" role="alert">{translate("propertyAccess.error")}</p>}
  </section>;
}
