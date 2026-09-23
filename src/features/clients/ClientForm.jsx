import { useEffect, useState } from "react";
import { BackButton } from "../../components/UiPrimitives.jsx";
import { useTranslation } from "../../i18n/translations.js";

export function ClientForm({ client, onBack, onSaved }) {
  const { translate } = useTranslation();
  const isEditing = Boolean(client);
  const [name, setName] = useState(client?.name || "");
  const [email, setEmail] = useState(client?.email || "");
  const [phone, setPhone] = useState(client?.phone || "");
  const [whatsapp, setWhatsapp] = useState(client?.whatsapp || "");
  const [preferredCommunicationChannel, setPreferredCommunicationChannel] = useState(
    client?.preferredCommunicationChannel || "",
  );
  const [notes, setNotes] = useState(client?.notes || "");
  const [active, setActive] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    setName(client?.name || "");
    setEmail(client?.email || "");
    setPhone(client?.phone || "");
    setWhatsapp(client?.whatsapp || "");
    setPreferredCommunicationChannel(client?.preferredCommunicationChannel || "");
    setNotes(client?.notes || "");
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
      const values = {
        name: clientName,
        email: optionalText(email),
        phone: optionalText(phone),
        whatsapp: optionalText(whatsapp),
        preferredCommunicationChannel: preferredCommunicationChannel || undefined,
        notes: optionalText(notes),
      };

      await onSaved(isEditing ? values : { ...values, active });
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

        <label>
          {translate("clients.email")}
          <input type="email" value={email} onChange={(event) => { setEmail(event.target.value); setIsSaved(false); }} />
        </label>

        <label>
          {translate("clients.phone")}
          <input type="tel" value={phone} onChange={(event) => { setPhone(event.target.value); setIsSaved(false); }} />
        </label>

        <label>
          {translate("clients.whatsapp")}
          <input type="tel" value={whatsapp} onChange={(event) => { setWhatsapp(event.target.value); setIsSaved(false); }} />
        </label>

        <label>
          {translate("clients.preferredCommunicationChannel")}
          <select value={preferredCommunicationChannel} onChange={(event) => { setPreferredCommunicationChannel(event.target.value); setIsSaved(false); }}>
            <option value="">{translate("common.notProvided")}</option>
            <option value="WHATSAPP">{translate("clients.communicationWhatsapp")}</option>
            <option value="EMAIL">{translate("clients.communicationEmail")}</option>
            <option value="PHONE">{translate("clients.communicationPhone")}</option>
          </select>
        </label>

        <label>
          {translate("clients.notes")}
          <textarea value={notes} onChange={(event) => { setNotes(event.target.value); setIsSaved(false); }} rows="3" />
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

function optionalText(value) {
  const trimmedValue = value.trim();
  return trimmedValue === "" ? undefined : trimmedValue;
}
