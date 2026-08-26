import { useEffect, useState } from "react";
import {
  createProperty,
  getProperties,
  linkPropertyToClient,
} from "./propertyService.js";

/** Owns Property data and local mutations; the application shell owns screen and origin state. */
export function usePropertiesController() {
  const [properties, setProperties] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState(null);

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

  function clearProperty() {
    setSelectedProperty(null);
  }

  function openProperty(property) {
    setSelectedProperty(property);
  }

  async function saveProperty(values) {
    const property = await createProperty(values);
    setProperties((currentProperties) => [...currentProperties, property]);
    return property;
  }

  async function linkClient(property, client) {
    const propertyUpdate = await linkPropertyToClient(property.id, client);
    const linkedProperty = { ...property, ...propertyUpdate };

    setSelectedProperty(linkedProperty);
    setProperties((currentProperties) =>
      currentProperties.map((currentProperty) =>
        currentProperty.id === linkedProperty.id ? linkedProperty : currentProperty,
      ),
    );

    return linkedProperty;
  }

  return {
    directory: { properties, isLoading, hasError },
    selection: { selectedProperty, clearProperty, openProperty },
    saveProperty,
    linkClient,
  };
}
