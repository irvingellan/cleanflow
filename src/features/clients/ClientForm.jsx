import { useState } from "react";
import { BackButton } from "../../components/UiPrimitives.jsx";
import { useTranslation } from "../../i18n/translations.js";

export function ClientForm({ onBack, onSaved }) {
  const { translate } = useTranslation();
  const [name, setName] = useState("");
  const [active, setActive] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState("");

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
      await onSaved({ name: clientName, active });
    } catch {
      setFormError(translate("clients.createError"));
      setIsSaving(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="client-create-title">
      <BackButton onClick={onBack} />
      <p className="eyebrow">{translate("navigation.clients")}</p>
      <h2 id="client-create-title" className="panel__title">
        {translate("clients.createTitle")}
      </h2>

      <form className="cleaning-form" noValidate onSubmit={saveClient}>
        <label>
          {translate("clients.name")}
          <input value={name} onChange={(event) => setName(event.target.value)} required />
        </label>

        <label className="cleaner-active-field">
          <input
            type="checkbox"
            checked={active}
            onChange={(event) => setActive(event.target.checked)}
          />
          {translate("common.active")}
        </label>

        {formError && (
          <p className="form-error" role="alert">
            {formError}
          </p>
        )}

        <div className="button-row">
          <button className="button button--primary" type="submit" disabled={isSaving}>
            {isSaving ? translate("clients.creating") : translate("clients.save")}
          </button>
        </div>
      </form>
    </section>
  );
}
