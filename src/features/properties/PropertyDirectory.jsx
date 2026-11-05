import { useState } from "react";
import { StateCard } from "../../components/UiPrimitives.jsx";
import { DataProvenanceBadge } from "../../components/DataProvenanceBadge.jsx";
import { ScrollToTopButton } from "../../components/ScrollToTopButton.jsx";
import { Icon } from "../../components/Icon.jsx";
import { useTranslation } from "../../i18n/translations.js";

export function PropertyDirectory({ properties, isLoading, hasError, onSelect, onCreate, canManageExcluded, showExcluded, onToggleExcluded }) {
  const { language, translate } = useTranslation();
  const [search, setSearch] = useState("");

  if (isLoading) {
    return <StateCard message={translate("properties.loading")} status="status" />;
  }

  if (hasError) {
    return <StateCard message={translate("properties.error")} status="alert" isError />;
  }

  const normalizedSearch = search.trim().toLocaleLowerCase(language);
  const filteredProperties = properties.filter((property) =>
    `${property.name || ""} ${property.address || ""}`
      .toLocaleLowerCase(language)
      .includes(normalizedSearch),
  );

  return (
    <section aria-labelledby="properties-title">
      <header className="cf-page-header directory-heading">
        <div className="cf-page-header__text">
          <h2 id="properties-title" className="list-title">
            {translate("properties.title")}
          </h2>
        </div>
        <div className="cf-page-header__actions">
          {canManageExcluded && <button className="button button--small" type="button" onClick={onToggleExcluded}>{translate(showExcluded ? "archive.hideExcluded" : "archive.showExcluded")}</button>}
          <button className="button button--primary" type="button" onClick={onCreate}>
            <Icon name="plus" size={18} />
            {translate("properties.new")}
          </button>
        </div>
      </header>

      {properties.length === 0 ? (
        <StateCard message={translate("properties.empty")} />
      ) : (
        <>
          <label className="job-filters__search directory-search">
            <Icon name="search" size={18} className="job-filters__search-icon" />
            <input
              id="property-directory-search"
              type="search"
              aria-label={translate("properties.search")}
              placeholder={translate("properties.searchPlaceholder")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          {filteredProperties.length === 0 ? (
            <StateCard message={translate("properties.noMatchingSearch")} />
          ) : (
            <div className="property-list">
              {filteredProperties.map((property) => {
                const propertyName = property.name || translate("properties.unnamed");

                return (
                  <button
                    key={property.id}
                    className="property-card"
                    type="button"
                    aria-label={translate("properties.view", { property: propertyName })}
                    onClick={() => onSelect(property)}
                  >
                    <span className="property-card__text">
                      <span className="property-card__title">{propertyName}</span>
                      {property.address && property.address.trim() !== propertyName.trim() && (
                        <span className="property-card__address">{property.address}</span>
                      )}
                    </span>
                    <span className="directory-row__meta">
                      {property.archivedAt && <span className="record-archive-badge">{translate("archive.excluded")}</span>}
                      <DataProvenanceBadge record={property} />
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
      <ScrollToTopButton />
    </section>
  );
}
