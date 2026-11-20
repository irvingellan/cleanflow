import { formatPrice } from "../../lib/presentation.js";

const messages = {
  en: {
    title: "Prices by service type", client: "Client price", cleaner: "Cleaner pay",
    mode: "Pricing", amount: "Amount (USD)", fixed: "Fixed", hourly: "Hourly", perHour: "{value} per hour",
    notSet: "Not set", edit: "Edit prices", close: "Close editor", teamRates: "Pay by team size",
    teamSize: "Team size", teamAmount: "Amount per cleaner (USD)", teamSummary: "Team of {count}: {value} each",
    defaults: "Standard service uses the default prices when its row is empty.",
    invalid: "Enter a valid USD amount with up to two decimal places (maximum $100,000).",
    baseRequired: "Enter the base cleaner pay when setting pay by team size.",
  },
  pt: {
    title: "Preços por tipo de serviço", client: "Preço do cliente", cleaner: "Repasse por profissional",
    mode: "Cobrança", amount: "Valor (USD)", fixed: "Fixo", hourly: "Por hora", perHour: "{value} por hora",
    notSet: "Não definido", edit: "Editar preços", close: "Fechar edição", teamRates: "Repasse por tamanho da equipe",
    teamSize: "Tamanho da equipe", teamAmount: "Valor por profissional (USD)", teamSummary: "Equipe de {count}: {value} por pessoa",
    defaults: "O serviço padrão usa os preços padrão quando a linha está vazia.",
    invalid: "Informe um valor válido em USD com até duas casas decimais (máximo de US$ 100.000).",
    baseRequired: "Informe o repasse base para definir valores por tamanho da equipe.",
  },
  es: {
    title: "Precios por tipo de servicio", client: "Precio al cliente", cleaner: "Pago por profesional",
    mode: "Modalidad", amount: "Importe (USD)", fixed: "Fijo", hourly: "Por hora", perHour: "{value} por hora",
    notSet: "Sin definir", edit: "Editar precios", close: "Cerrar editor", teamRates: "Pago por tamaño del equipo",
    teamSize: "Tamaño del equipo", teamAmount: "Importe por profesional (USD)", teamSummary: "Equipo de {count}: {value} por persona",
    defaults: "El servicio estándar usa los precios predeterminados cuando su fila está vacía.",
    invalid: "Ingresa un importe válido en USD con hasta dos decimales (máximo de 100.000 US$).",
    baseRequired: "Ingresa el pago base para definir importes por tamaño del equipo.",
  },
};

export function pricingMessage(language, key, values = {}) {
  return (messages[language] || messages.en)[key].replace(/\{(\w+)\}/g, (_, field) => values[field]);
}

export function formatPricingRate(rate, language, translate) {
  if (rate.state !== "ready") return pricingMessage(language, "notSet");
  const hourly = rate.mode === "HOURLY";
  const value = formatPrice((hourly ? rate.rateCents : rate.amountCents) / 100, translate, language);
  return hourly ? pricingMessage(language, "perHour", { value }) : value;
}
