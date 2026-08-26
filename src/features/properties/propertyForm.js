export function createEmptyPropertyForm(preselectedClient = null) {
  return {
    name: "",
    clientName: preselectedClient?.name || "",
    defaultClientPrice: "",
    defaultCleanerPrice: "",
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
