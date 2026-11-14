const messages = {
  en: {
    "checklistPreview.dishDetergentLiquid": "Dish detergent (liquid)",
    "checklistPreview.coffee": "Coffee",
    "checklistPreview.dishSponge": "Dish sponge",
    "checklistPreview.shampoo": "Shampoo",
    "checklistPreview.conditioner": "Conditioner",
    "checklistPreview.bodyWash": "Body wash",
    "checklists.inventoryEMPTY": "Empty",
    "checklists.inventoryQuantityOptional": "Quantity (optional)",
    "checklists.inventoryWithQuantity": "{level} · Quantity {quantity}",
    "checklists.inventorySaveCorrection": "Save correction",
    "checklists.inventoryLevel": "Stock level",
    "checklists.photoOrientationTitle": "Photos your manager needs",
    "checklists.sendForReviewReminder": "Your checklist is ready. Send it to your manager.",
  },
  pt: {
    "checklistPreview.dishDetergentLiquid": "Detergente líquido para louça",
    "checklistPreview.coffee": "Café",
    "checklistPreview.dishSponge": "Esponja de louça",
    "checklistPreview.shampoo": "Shampoo",
    "checklistPreview.conditioner": "Condicionador",
    "checklistPreview.bodyWash": "Sabonete líquido para banho",
    "checklists.inventoryEMPTY": "Vazio",
    "checklists.inventoryQuantityOptional": "Quantidade (opcional)",
    "checklists.inventoryWithQuantity": "{level} · Quantidade {quantity}",
    "checklists.inventorySaveCorrection": "Salvar correção",
    "checklists.inventoryLevel": "Nível de estoque",
    "checklists.photoOrientationTitle": "Fotos que a gerente precisa",
    "checklists.sendForReviewReminder": "O checklist está pronto. Envie para a gerente.",
  },
  es: {
    "checklistPreview.dishDetergentLiquid": "Detergente líquido para platos",
    "checklistPreview.coffee": "Café",
    "checklistPreview.dishSponge": "Esponja para platos",
    "checklistPreview.shampoo": "Champú",
    "checklistPreview.conditioner": "Acondicionador",
    "checklistPreview.bodyWash": "Gel de baño",
    "checklists.inventoryEMPTY": "Vacío",
    "checklists.inventoryQuantityOptional": "Cantidad (opcional)",
    "checklists.inventoryWithQuantity": "{level} · Cantidad {quantity}",
    "checklists.inventorySaveCorrection": "Guardar corrección",
    "checklists.inventoryLevel": "Nivel de inventario",
    "checklists.photoOrientationTitle": "Fotos que necesita la gerente",
    "checklists.sendForReviewReminder": "La lista está lista. Envíala a la gerente.",
  },
};

export function withChecklistInventoryMessages(translate, language) {
  return (key, replacements = {}) => {
    const message = (messages[language] || messages.en)[key];
    if (!message) return translate(key, replacements);
    return Object.entries(replacements).reduce(
      (text, [name, value]) => text.replaceAll(`{${name}}`, () => String(value)),
      message,
    );
  };
}

export function formatChecklistInventoryAnswer(translate, answer, quantity) {
  const level = translate(`checklists.inventory${answer || "UNANSWERED"}`);
  return Number.isInteger(quantity)
    ? translate("checklists.inventoryWithQuantity", { level, quantity })
    : level;
}
