import { StateCard } from "../../components/UiPrimitives.jsx";
import { useTranslation } from "../../i18n/translations.js";
import { preferredLanguageLabel } from "./cleanerPresentation.js";

function InformationIcon({ name }) {
  if (name === "phone") {
    return (
      <svg className="information-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5.5 3.5h3l1.5 4-2 1.75a16.5 16.5 0 0 0 6.75 6.75l1.75-2 4 1.5v3a2 2 0 0 1-2.1 2A16.9 16.9 0 0 1 3.5 5.6a2 2 0 0 1 2-2.1Z" />
      </svg>
    );
  }

  return (
    <svg className="information-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.1 2.3 3.2 5.1 3.2 8.5S14.1 18.2 12 20.5C9.9 18.2 8.8 15.4 8.8 12S9.9 5.8 12 3.5Z" />
    </svg>
  );
}

export function CleanerDirectory({ cleaners, isLoading, hasError, onSelect, onCreate }) {
  const { translate } = useTranslation();

  if (isLoading) {
    return <StateCard message={translate("cleaners.loading")} status="status" />;
  }

  if (hasError) {
    return <StateCard message={translate("cleaners.error")} status="alert" isError />;
  }

  const sortedCleaners = [...cleaners].sort((firstCleaner, secondCleaner) =>
    (firstCleaner.name || "").localeCompare(secondCleaner.name || ""),
  );

  return (
    <section aria-labelledby="cleaners-title">
      <div className="directory-heading">
        <div>
          <p className="eyebrow">{translate("navigation.cleaners")}</p>
          <h2 id="cleaners-title" className="list-title">
            {translate("cleaners.title")}
          </h2>
        </div>
        <button className="button button--primary" type="button" onClick={onCreate}>
          {translate("cleaners.new")}
        </button>
      </div>

      {sortedCleaners.length === 0 ? (
        <StateCard message={translate("cleaners.empty")} />
      ) : (
        <div className="cleaner-directory">
          {sortedCleaners.map((cleaner) => (
            <button
              key={cleaner.id}
              className="cleaner-directory-card"
              type="button"
              aria-label={translate("cleaners.view", {
                cleaner: cleaner.name || translate("common.notProvided"),
              })}
              onClick={() => onSelect(cleaner)}
            >
              <span className="cleaner-directory-card__identity">
                <strong>{cleaner.name || translate("common.notProvided")}</strong>
                <span className="cleaner-directory-card__detail">
                  <InformationIcon name="phone" />
                  {cleaner.phone || translate("cleaners.noPhone")}
                </span>
              </span>
              <span className="cleaner-directory-card__details">
                <span className="cleaner-directory-card__detail">
                  <InformationIcon name="language" />
                  {preferredLanguageLabel(cleaner.preferredLanguage, translate)}
                </span>
              </span>
              <span className="status-badge cleaner-directory-card__status-badge">
                {cleaner.active === false
                  ? translate("common.inactive")
                  : translate("common.active")}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
