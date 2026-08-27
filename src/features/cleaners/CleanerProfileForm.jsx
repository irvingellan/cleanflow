import { useEffect, useState } from "react";
import { BackButton } from "../../components/UiPrimitives.jsx";
import { useTranslation } from "../../i18n/translations.js";
import {
  supportedCleanerTeamTypes,
  supportedPaymentMethods,
} from "./cleanerService.js";
import {
  cleanerProfileLimits,
  cleanerToForm,
  normalizeCleanerPhone,
  supportedCleanerLanguages,
} from "./cleanerProfile.js";

export function CleanerProfileForm({
  cleaner,
  defaultPreferredLanguage,
  onBack,
  onSave,
  onSaved,
}) {
  const { translate } = useTranslation();
  const isEditing = Boolean(cleaner);
  const [formValues, setFormValues] = useState(() =>
    cleanerToForm(cleaner, defaultPreferredLanguage),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    setFormValues(cleanerToForm(cleaner, defaultPreferredLanguage));
    setFormError("");
    setIsSaving(false);
  }, [cleaner, defaultPreferredLanguage]);

  function updateField(event) {
    const { name, value, checked, type } = event.target;

    setFormValues((currentValues) => ({
      ...currentValues,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  async function saveCleaner(event) {
    event.preventDefault();
    const name = formValues.name.trim();
    const phone = normalizeCleanerPhone(formValues.phone);
    const cityOrRegion = formValues.cityOrRegion.trim();
    const internalNotes = formValues.internalNotes.trim();
    const paymentContact = formValues.paymentContact.trim();

    if (!name) {
      setFormError(translate("cleaners.nameRequired"));
      return;
    }

    if (!phone) {
      setFormError(translate("cleaners.phoneRequired"));
      return;
    }

    if (phone && !/^\+\d{7,15}$/.test(phone)) {
      setFormError(translate("cleaners.phoneInvalid"));
      return;
    }

    if (!supportedCleanerLanguages.includes(formValues.preferredLanguage)) {
      setFormError(translate("cleaners.preferredLanguageRequired"));
      return;
    }

    if (!supportedCleanerTeamTypes.includes(formValues.teamType)) {
      setFormError(translate("cleaners.teamTypeInvalid"));
      return;
    }

    if (!supportedPaymentMethods.includes(formValues.preferredPaymentMethod)) {
      setFormError(translate("cleaners.preferredPaymentMethodInvalid"));
      return;
    }

    if (cityOrRegion.length > cleanerProfileLimits.cityOrRegion) {
      setFormError(
        translate("cleaners.cityOrRegionTooLong", {
          count: cleanerProfileLimits.cityOrRegion,
        }),
      );
      return;
    }

    if (internalNotes.length > cleanerProfileLimits.internalNotes) {
      setFormError(
        translate("cleaners.internalNotesTooLong", {
          count: cleanerProfileLimits.internalNotes,
        }),
      );
      return;
    }

    if (paymentContact.length > cleanerProfileLimits.paymentContact) {
      setFormError(
        translate("cleaners.paymentContactTooLong", {
          count: cleanerProfileLimits.paymentContact,
        }),
      );
      return;
    }

    setIsSaving(true);
    setFormError("");

    try {
      const savedProfile = await onSave(cleaner, {
        name,
        phone,
        preferredLanguage: formValues.preferredLanguage,
        active: formValues.active,
        cityOrRegion,
        teamType: formValues.teamType,
        internalNotes,
        preferredPaymentMethod: formValues.preferredPaymentMethod,
        paymentContact,
      });

      onSaved(savedProfile);
    } catch {
      setFormError(
        translate(isEditing ? "cleaners.updateError" : "cleaners.createError"),
      );
      setIsSaving(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="cleaner-profile-title">
      <BackButton onClick={onBack} />
      <p className="eyebrow">{translate("navigation.cleaners")}</p>
      <h2 id="cleaner-profile-title" className="panel__title">
        {translate(isEditing ? "cleaners.editTitle" : "cleaners.createTitle")}
      </h2>

      <form className="cleaning-form" noValidate onSubmit={saveCleaner}>
        <label>
          {translate("cleaners.name")}
          <input name="name" value={formValues.name} onChange={updateField} required />
        </label>

        <label>
          {translate("cleaners.phone")}
          <input
            type="tel"
            name="phone"
            value={formValues.phone}
            placeholder={translate("cleaners.phoneExample")}
            autoComplete="off"
            inputMode="tel"
            onChange={updateField}
            required
          />
        </label>

        <label>
          {translate("cleaners.preferredLanguage")}
          <select
            name="preferredLanguage"
            value={formValues.preferredLanguage}
            onChange={updateField}
            required
          >
            <option value="en">{translate("language.english")}</option>
            <option value="pt">{translate("language.portuguese")}</option>
            <option value="es">{translate("language.spanish")}</option>
          </select>
        </label>

        <div className="cleaner-profile-form-section">
          <h3>{translate("cleaners.operations")}</h3>
          <label>
            {translate("cleaners.cityOrRegion")}
            <input
              name="cityOrRegion"
              value={formValues.cityOrRegion}
              maxLength={cleanerProfileLimits.cityOrRegion}
              onChange={updateField}
            />
          </label>

          <label>
            {translate("cleaners.teamType")}
            <select name="teamType" value={formValues.teamType} onChange={updateField}>
              <option value="">{translate("common.notProvided")}</option>
              <option value="SOLO">{translate("cleaners.teamTypeSolo")}</option>
              <option value="COUPLE">{translate("cleaners.teamTypeCouple")}</option>
              <option value="TEAM">{translate("cleaners.teamTypeTeam")}</option>
            </select>
          </label>
        </div>

        <div className="cleaner-profile-form-section">
          <h3>{translate("cleaners.payment")}</h3>
          <label>
            {translate("cleaners.preferredPaymentMethod")}
            <select
              name="preferredPaymentMethod"
              value={formValues.preferredPaymentMethod}
              onChange={updateField}
            >
              <option value="">{translate("common.notProvided")}</option>
              <option value="ZELLE">Zelle</option>
              <option value="VENMO">Venmo</option>
              <option value="CASH">{translate("cleaners.paymentMethodCash")}</option>
              <option value="CHECK">{translate("cleaners.paymentMethodCheck")}</option>
              <option value="OTHER">{translate("cleaners.paymentMethodOther")}</option>
            </select>
          </label>

          <label>
            {translate("cleaners.paymentContact")}
            <input
              name="paymentContact"
              value={formValues.paymentContact}
              maxLength={cleanerProfileLimits.paymentContact}
              onChange={updateField}
            />
          </label>
        </div>

        <label>
          {translate("cleaners.internalNotes")}
          <textarea
            name="internalNotes"
            rows="4"
            value={formValues.internalNotes}
            maxLength={cleanerProfileLimits.internalNotes}
            onChange={updateField}
          />
        </label>

        <label className="cleaner-active-field">
          <input
            type="checkbox"
            name="active"
            checked={formValues.active}
            onChange={updateField}
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
            {isSaving ? translate("cleaners.saving") : translate("cleaners.save")}
          </button>
        </div>
      </form>
    </section>
  );
}

export function CleanerProfileSuccess({ cleaner, onBack, backLabel }) {
  const { translate } = useTranslation();

  return (
    <section className="panel success-panel" aria-labelledby="cleaner-success-title">
      <span className="success-mark" aria-hidden="true">
        ✓
      </span>
      <p className="eyebrow">{translate("navigation.cleaners")}</p>
      <h2 id="cleaner-success-title" className="panel__title">
        {translate(cleaner.wasCreated ? "cleaners.created" : "cleaners.updated")}
      </h2>
      <p className="success-panel__detail">{cleaner.name}</p>
      <div className="button-row">
        <button className="button button--primary" type="button" onClick={onBack}>
          {translate(backLabel)}
        </button>
      </div>
    </section>
  );
}
