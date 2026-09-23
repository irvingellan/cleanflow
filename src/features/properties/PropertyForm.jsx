import { useEffect, useState } from "react";
import { BackButton, DetailItem, StateCard } from "../../components/UiPrimitives.jsx";
import { getActiveClients } from "../clients/clientService.js";
import { useTranslation } from "../../i18n/translations.js";
import { createEmptyPropertyForm, optionalPrice, optionalText } from "./propertyForm.js";

export function PropertyForm({ preselectedClient, onBack, onSaved }) {
  const { translate } = useTranslation();
  const [formValues, setFormValues] = useState(() =>
    createEmptyPropertyForm(preselectedClient),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const { clients, isLoadingClients, hasClientsError } = useActiveClients();

  function updateField(event) {
    const { name, value, checked, type } = event.target;

    setFormValues((currentValues) => ({
      ...currentValues,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  async function saveProperty(event) {
    event.preventDefault();
    const name = formValues.name.trim();
    const client = preselectedClient || clients.find((item) => item.id === formValues.clientId);
    const defaultClientPrice = optionalPrice(formValues.defaultClientPrice);
    const defaultCleanerPrice = optionalPrice(formValues.defaultCleanerPrice);

    if (!name) {
      setFormError(translate("properties.nameRequired"));
      return;
    }

    if (!client) {
      setFormError(translate("properties.clientRequired"));
      return;
    }

    if (defaultClientPrice === null || defaultCleanerPrice === null) {
      setFormError(translate("properties.priceInvalid"));
      return;
    }

    setIsSaving(true);
    setFormError("");

    try {
      await onSaved({
        name,
        clientId: client.id,
        clientName: client.name,
        address: optionalText(formValues.address),
        defaultClientPrice,
        defaultCleanerPrice,
        garageParking: optionalText(formValues.garageParking),
        cleanerInstructions: optionalText(formValues.cleanerInstructions),
        additionalNotes: optionalText(formValues.additionalNotes),
        active: formValues.active,
      });
    } catch {
      setFormError(translate("properties.createError"));
      setIsSaving(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="property-create-title">
      <BackButton onClick={onBack} />
      <p className="eyebrow">{translate("navigation.properties")}</p>
      <h2 id="property-create-title" className="panel__title">
        {translate("properties.createTitle")}
      </h2>

      <form className="cleaning-form" noValidate onSubmit={saveProperty}>
        <label>
          {translate("properties.name")}
          <input name="name" value={formValues.name} onChange={updateField} required />
        </label>

        <PropertyClientField
          clients={clients}
          isLoading={isLoadingClients}
          hasError={hasClientsError}
          preselectedClient={preselectedClient}
          value={formValues.clientId}
          onChange={updateField}
          required
        />

        <label>
          {translate("properties.address")}
          <input name="address" value={formValues.address} onChange={updateField} />
        </label>

        <fieldset className="cleaning-form__group">
          <legend>{translate("properties.defaultPricing")}</legend>
          <label>
            {translate("properties.defaultClientPrice")}
            <input
              type="number"
              name="defaultClientPrice"
              value={formValues.defaultClientPrice}
              min="0"
              step="0.01"
              inputMode="decimal"
              onChange={updateField}
            />
          </label>
          <label>
            {translate("properties.defaultCleanerPrice")}
            <input
              type="number"
              name="defaultCleanerPrice"
              value={formValues.defaultCleanerPrice}
              min="0"
              step="0.01"
              inputMode="decimal"
              onChange={updateField}
            />
          </label>
        </fieldset>

        <fieldset className="cleaning-form__group">
          <legend>{translate("properties.cleanerInformation")}</legend>
          <label>
            {translate("properties.garageParking")}
            <input name="garageParking" value={formValues.garageParking} onChange={updateField} />
          </label>
          <label>
            {translate("properties.cleanerInstructions")}
            <textarea name="cleanerInstructions" value={formValues.cleanerInstructions} onChange={updateField} rows="3" />
          </label>
          <label>
            {translate("properties.additionalNotes")}
            <textarea name="additionalNotes" value={formValues.additionalNotes} onChange={updateField} rows="3" />
          </label>
        </fieldset>

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
            {isSaving ? translate("properties.creating") : translate("properties.save")}
          </button>
        </div>
      </form>
    </section>
  );
}

export function PropertyEditForm({ property, onBack, onSaved }) {
  const { translate } = useTranslation();
  const [formValues, setFormValues] = useState(() => propertyToEditForm(property));
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [isSaved, setIsSaved] = useState(false);
  const { clients, isLoadingClients, hasClientsError } = useActiveClients();

  useEffect(() => {
    setFormValues(propertyToEditForm(property));
    setFormError("");
    setIsSaved(false);
    setIsSaving(false);
  }, [property]);

  function updateField(event) {
    const { name, value } = event.target;
    setIsSaved(false);
    setFormValues((currentValues) => ({ ...currentValues, [name]: value }));
  }

  async function saveProperty(event) {
    event.preventDefault();
    const name = formValues.name.trim();
    const defaultClientPrice = optionalPrice(formValues.defaultClientPrice);
    const defaultCleanerPrice = optionalPrice(formValues.defaultCleanerPrice);
    const selectedClient = clients.find((client) => client.id === formValues.clientId);

    if (!name) {
      setFormError(translate("properties.nameRequired"));
      return;
    }

    if (defaultClientPrice === null || defaultCleanerPrice === null) {
      setFormError(translate("properties.priceInvalid"));
      return;
    }

    setIsSaving(true);
    setFormError("");
    setIsSaved(false);

    try {
      await onSaved({
        name,
        client: selectedClient?.id !== property.clientId ? selectedClient : undefined,
        address: optionalText(formValues.address),
        defaultClientPrice,
        defaultCleanerPrice,
        garageParking: optionalText(formValues.garageParking),
        cleanerInstructions: optionalText(formValues.cleanerInstructions),
        additionalNotes: optionalText(formValues.additionalNotes),
      });
      setIsSaved(true);
    } catch {
      setFormError(translate("properties.updateError"));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="property-edit-title">
      <BackButton onClick={onBack} />
      <p className="eyebrow">{translate("properties.details")}</p>
      <h2 id="property-edit-title" className="panel__title">{translate("properties.editTitle")}</h2>

      <form className="cleaning-form" noValidate onSubmit={saveProperty}>
        <label>
          {translate("properties.name")}
          <input name="name" value={formValues.name} onChange={updateField} required />
        </label>

        <PropertyClientField
          clients={clients}
          isLoading={isLoadingClients}
          hasError={hasClientsError}
          value={formValues.clientId}
          onChange={updateField}
          currentClientName={property.clientName}
        />

        <label>
          {translate("properties.address")}
          <input name="address" value={formValues.address} onChange={updateField} />
        </label>

        <fieldset className="cleaning-form__group">
          <legend>{translate("properties.defaultPricing")}</legend>
          <label>
            {translate("properties.defaultClientPrice")}
            <input type="number" name="defaultClientPrice" value={formValues.defaultClientPrice} min="0" step="0.01" inputMode="decimal" onChange={updateField} />
          </label>
          <label>
            {translate("properties.defaultCleanerPrice")}
            <input type="number" name="defaultCleanerPrice" value={formValues.defaultCleanerPrice} min="0" step="0.01" inputMode="decimal" onChange={updateField} />
          </label>
        </fieldset>

        <fieldset className="cleaning-form__group">
          <legend>{translate("properties.cleanerInformation")}</legend>
          <label>
            {translate("properties.garageParking")}
            <input name="garageParking" value={formValues.garageParking} onChange={updateField} />
          </label>
          <label>
            {translate("properties.cleanerInstructions")}
            <textarea name="cleanerInstructions" value={formValues.cleanerInstructions} onChange={updateField} rows="3" />
          </label>
          <label>
            {translate("properties.additionalNotes")}
            <textarea name="additionalNotes" value={formValues.additionalNotes} onChange={updateField} rows="3" />
          </label>
        </fieldset>

        {formError && <p className="form-error" role="alert">{formError}</p>}
        {isSaved && <p className="form-success" role="status">{translate("properties.updated")}</p>}

        <div className="button-row">
          <button className="button button--primary" type="submit" disabled={isSaving}>
            {isSaving ? translate("properties.saving") : translate("properties.save")}
          </button>
          <button className="button" type="button" onClick={onBack}>{translate("common.cancel")}</button>
        </div>
      </form>
    </section>
  );
}

function PropertyClientField({
  clients,
  isLoading,
  hasError,
  preselectedClient,
  value,
  onChange,
  currentClientName,
  required = false,
}) {
  const { translate } = useTranslation();

  if (preselectedClient) {
    return (
      <label>
        {translate("properties.currentClient")}
        <input value={preselectedClient.name || ""} readOnly />
      </label>
    );
  }

  if (isLoading) {
    return <StateCard message={translate("properties.loadingClients")} status="status" />;
  }

  if (hasError) {
    return <StateCard message={translate("properties.clientsError")} status="alert" isError />;
  }

  return (
    <label>
      {translate("common.client")}
      <select name="clientId" value={value} onChange={onChange} required={required}>
        <option value="">
          {currentClientName
            ? translate("properties.keepCurrentClient", { client: currentClientName })
            : translate("properties.selectClient")}
        </option>
        {clients.map((client) => (
          <option key={client.id} value={client.id}>{client.name}</option>
        ))}
      </select>
    </label>
  );
}

function useActiveClients() {
  const [clients, setClients] = useState([]);
  const [isLoadingClients, setIsLoadingClients] = useState(true);
  const [hasClientsError, setHasClientsError] = useState(false);

  useEffect(() => {
    let isCurrent = true;

    async function loadClients() {
      try {
        const loadedClients = await getActiveClients();
        if (isCurrent) {
          setClients([...loadedClients].sort((firstClient, secondClient) =>
            (firstClient.name || "").localeCompare(secondClient.name || ""),
          ));
        }
      } catch {
        if (isCurrent) {
          setHasClientsError(true);
        }
      } finally {
        if (isCurrent) {
          setIsLoadingClients(false);
        }
      }
    }

    loadClients();
    return () => { isCurrent = false; };
  }, []);

  return { clients, isLoadingClients, hasClientsError };
}

export function PropertyClientLinkForm({ property, onBack, onLinked }) {
  const { translate } = useTranslation();
  const [clients, setClients] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const currentClientName = property.clientName || translate("common.notProvided");

  useEffect(() => {
    let isCurrent = true;

    async function loadActiveClients() {
      setIsLoading(true);
      setHasLoadError(false);

      try {
        const loadedClients = await getActiveClients();

        if (isCurrent) {
          setClients(loadedClients);
        }
      } catch {
        if (isCurrent) {
          setHasLoadError(true);
        }
      } finally {
        if (isCurrent) {
          setIsLoading(false);
        }
      }
    }

    loadActiveClients();

    return () => {
      isCurrent = false;
    };
  }, [property.id]);

  const sortedClients = [...clients].sort((firstClient, secondClient) =>
    (firstClient.name || "").localeCompare(secondClient.name || ""),
  );

  async function saveLink(event) {
    event.preventDefault();
    const selectedClient = clients.find((client) => client.id === selectedClientId);

    if (!selectedClient) {
      setFormError(translate("properties.clientRequired"));
      return;
    }

    setIsSaving(true);
    setFormError("");

    try {
      await onLinked(selectedClient);
    } catch {
      setFormError(translate("properties.linkClientError"));
      setIsSaving(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="property-link-client-title">
      <BackButton onClick={onBack} />
      <p className="eyebrow">{translate("properties.details")}</p>
      <h2 id="property-link-client-title" className="panel__title">
        {translate("properties.linkClient")}
      </h2>

      <dl className="detail-list">
        <DetailItem label={translate("common.property")} value={property.name || translate("properties.unnamed")} />
        <DetailItem label={translate("properties.currentClient")} value={currentClientName} />
      </dl>

      {isLoading && <StateCard message={translate("properties.loadingClients")} status="status" />}

      {hasLoadError && (
        <StateCard message={translate("properties.clientsError")} status="alert" isError />
      )}

      {!isLoading && !hasLoadError && (
        <form className="cleaning-form" noValidate onSubmit={saveLink}>
          {sortedClients.length === 0 ? (
            <StateCard message={translate("properties.noActiveClients")} />
          ) : (
            <label>
              {translate("properties.selectClient")}
              <select
                value={selectedClientId}
                onChange={(event) => setSelectedClientId(event.target.value)}
                required
              >
                <option value="">{translate("properties.selectClient")}</option>
                {sortedClients.map((client) => (
                  <option key={client.id} value={client.id}>{client.name}</option>
                ))}
              </select>
            </label>
          )}

          {formError && (
            <p className="form-error" role="alert">
              {formError}
            </p>
          )}

          {sortedClients.length > 0 && (
            <div className="button-row">
              <button className="button button--primary" type="submit" disabled={isSaving}>
                {isSaving ? translate("properties.linkingClient") : translate("properties.confirmClientLink")}
              </button>
            </div>
          )}
        </form>
      )}
    </section>
  );
}

function propertyToEditForm(property) {
  return {
    name: property?.name || "",
    clientId: property?.clientId || "",
    address: property?.address || "",
    defaultClientPrice: property?.defaultClientPrice === undefined ? "" : String(property.defaultClientPrice),
    defaultCleanerPrice: property?.defaultCleanerPrice === undefined ? "" : String(property.defaultCleanerPrice),
    garageParking: property?.garageParking || "",
    cleanerInstructions: property?.cleanerInstructions || "",
    additionalNotes: property?.additionalNotes || "",
  };
}
