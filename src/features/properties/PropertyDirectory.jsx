import { StateCard } from "../../components/UiPrimitives.jsx";
import { useTranslation } from "../../i18n/translations.js";

export function PropertyDirectory({ properties, isLoading, hasError, onSelect, onCreate }) {
  const { translate } = useTranslation();

  if (isLoading) {
    return <StateCard message={translate("properties.loading")} status="status" />;
  }

  if (hasError) {
    return <StateCard message={translate("properties.error")} status="alert" isError />;
  }

  return (
    <section aria-labelledby="properties-title">
      <div className="directory-heading">
        <div>
          <p className="eyebrow">{translate("navigation.properties")}</p>
          <h2 id="properties-title" className="list-title">
            {translate("properties.title")}
          </h2>
        </div>
        <button className="button button--primary" type="button" onClick={onCreate}>
          {translate("properties.new")}
        </button>
      </div>

      {properties.length === 0 ? (
        <StateCard message={translate("properties.empty")} />
      ) : (
        <div className="property-list">
          {properties.map((property) => {
            const propertyName = property.name || translate("properties.unnamed");

            return (
              <button
                key={property.id}
                className="property-card"
                type="button"
                aria-label={translate("properties.view", { property: propertyName })}
                onClick={() => onSelect(property)}
              >
                <span className="property-card__title">{propertyName}</span>

                <span className="property-card__label">
                  <span className="status-dot" aria-hidden="true" />
                  {translate("common.property")}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
