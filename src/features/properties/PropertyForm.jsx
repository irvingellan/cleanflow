import { useEffect, useState } from "react";
import { BackButton, DetailItem, StateCard } from "../../components/UiPrimitives.jsx";
import { getActiveClients } from "../clients/clientService.js";
import { useTranslation } from "../../i18n/translations.js";
import { createEmptyPropertyForm, optionalPrice } from "./propertyForm.js";

export function PropertyForm({ properties, preselectedClient, onBack, onSaved }) {
  const { translate } = useTranslation();
  const [formValues, setFormValues] = useState(() =>
    createEmptyPropertyForm(preselectedClient),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const clientNames = [...new Set(
    properties.map((property) => property.clientName).filter(Boolean),
  )].sort((firstClient, secondClient) => firstClient.localeCompare(secondClient));

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
    const clientName = formValues.clientName.trim();
    const defaultClientPrice = optionalPrice(formValues.defaultClientPrice);
    const defaultCleanerPrice = optionalPrice(formValues.defaultCleanerPrice);

    if (!name) {
      setFormError(translate("properties.nameRequired"));
      return;
    }

    if (!clientName) {
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
        clientId: preselectedClient?.id,
        clientName,
        defaultClientPrice,
        defaultCleanerPrice,
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

        {preselectedClient ? (
          <label>
            {translate("properties.currentClient")}
            <input value={preselectedClient.name || ""} readOnly />
          </label>
        ) : (
          <label>
            {translate("common.client")}
            <select
              name="clientName"
              value={formValues.clientName}
              onChange={updateField}
              required
            >
              <option value="">{translate("properties.selectClient")}</option>
              {clientNames.map((clientName) => (
                <option key={clientName} value={clientName}>{clientName}</option>
              ))}
            </select>
          </label>
        )}

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
