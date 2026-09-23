import { useEffect, useState } from "react";
import { BackButton } from "../../components/UiPrimitives.jsx";
import { useTranslation } from "../../i18n/translations.js";

export function ClientForm({ client, onBack, onSaved }) {
  const { translate } = useTranslation();
  const isEditing = Boolean(client);
  const [name, setName] = useState(client?.name || "");
  const [active, setActive] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    setName(client?.name || "");
    setFormError("");
    setIsSaved(false);
    setIsSaving(false);
  }, [client]);

  async function saveClient(event) {
    event.preventDefault();
    const clientName = name.trim();

    if (!clientName) {
      setFormError(translate("clients.nameRequired"));
      return;
    }

    setIsSaving(true);
    setFormError("");

    try {
      await onSaved(isEditing ? { name: clientName } : { name: clientName, active });
      setIsSaved(true);
    } catch {
      setFormError(translate(isEditing ? "clients.updateError" : "clients.createError"));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="client-create-title">
      <BackButton onClick={onBack} />
      <p className="eyebrow">{translate("navigation.clients")}</p>
      <h2 id="client-create-title" className="panel__title">
        {translate(isEditing ? "clients.editTitle" : "clients.createTitle")}
      </h2>

      <form className="cleaning-form" noValidate onSubmit={saveClient}>
        <label>
          {translate("clients.name")}
          <input value={name} onChange={(event) => { setName(event.target.value); setIsSaved(false); }} required />
        </label>

        {!isEditing && (
          <label className="cleaner-active-field">
            <input
              type="checkbox"
              checked={active}
              onChange={(event) => setActive(event.target.checked)}
            />
            {translate("common.active")}
          </label>
        )}

        {formError && (
          <p className="form-error" role="alert">
            {formError}
          </p>
        )}

        {isSaved && <p className="form-success" role="status">{translate("clients.updated")}</p>}

        <div className="button-row">
          <button className="button button--primary" type="submit" disabled={isSaving}>
            {isSaving ? translate("clients.saving") : translate("clients.save")}
          </button>
          {isEditing && <button className="button" type="button" onClick={onBack}>{translate("common.cancel")}</button>}
        </div>
      </form>
    </section>
  );
}
