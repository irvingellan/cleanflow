export function createEmptyPropertyForm(preselectedClient = null) {
  return {
    name: "",
    clientId: preselectedClient?.id || "",
    clientName: preselectedClient?.name || "",
    address: "",
    defaultClientPrice: "",
    defaultCleanerPrice: "",
    garageParking: "",
    cleanerInstructions: "",
    additionalNotes: "",
    keyCodeInfo: "",
    accessInstructions: "",
    active: true,
  };
}

export function optionalPrice(value) {
  if (value.trim() === "") {
    return undefined;
  }

  const price = Number(value);
  return Number.isFinite(price) && price >= 0 ? price : null;
}

export function optionalText(value) {
  const trimmedValue = value.trim();
  return trimmedValue === "" ? undefined : trimmedValue;
}
