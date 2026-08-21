import { useEffect, useState } from "react";
import { getProperties } from "./features/properties/propertyService.js";

const content = {
  productName: "CleanFlow",
  productDescription: "Operations platform",
  buildLabel: "Foundation build",
  loadingMessage: "Loading properties…",
  errorMessage: "Unable to load properties.",
  emptyMessage: "No properties found.",
  propertyLabel: "Property",
  unnamedProperty: "Unnamed property",
};

function App() {
  const [properties, setProperties] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let isCurrent = true;

    async function loadProperties() {
      try {
        const loadedProperties = await getProperties();

        if (isCurrent) {
          setProperties(loadedProperties);
        }
      } catch {
        if (isCurrent) {
          setHasError(true);
        }
      } finally {
        if (isCurrent) {
          setIsLoading(false);
        }
      }
    }

    loadProperties();

    return () => {
      isCurrent = false;
    };
  }, []);

  return (
    <main className="app-shell">
      <section className="foundation" aria-labelledby="page-title">
        <header className="foundation__header">
          <div>
            <p className="eyebrow">{content.productDescription}</p>
            <h1 id="page-title">{content.productName}</h1>
          </div>
          <span className="badge">{content.buildLabel}</span>
        </header>

        {isLoading && (
          <p className="state-card" role="status">
            {content.loadingMessage}
          </p>
        )}

        {!isLoading && hasError && (
          <p className="state-card state-card--error" role="alert">
            {content.errorMessage}
          </p>
        )}

        {!isLoading && !hasError && properties.length === 0 && (
          <p className="state-card">{content.emptyMessage}</p>
        )}

        {!isLoading && !hasError && properties.length > 0 && (
          <div className="property-list">
            {properties.map((property) => {
              const propertyName = property.name || content.unnamedProperty;

              return (
                <article
                  key={property.id}
                  className="property-card"
                  aria-label={propertyName}
                >
                  <h2>{propertyName}</h2>

                  <p className="property-card__label">
                    <span className="status-dot" aria-hidden="true" />
                    {content.propertyLabel}
                  </p>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

export default App;
