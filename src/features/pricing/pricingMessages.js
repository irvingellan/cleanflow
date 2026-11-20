import { formatPrice } from "../../lib/presentation.js";

const messages = {
  en: {
    title: "Prices by service type", client: "Client price", cleaner: "Cleaner pay",
    cleanerHouseAmount: "Total cleaner pay for the house, split across the team (USD)", cleanerHourlyRate: "Hourly rate per cleaner (USD)",
    clientHourlyRate: "Hourly client rate (USD)", houseSummary: "{value} for the house", cleanerHourlySummary: "{value} per cleaner",
    splitRule: "Fixed cleaner pay is split across the team. A rate set for a specific team size applies to each cleaner.",
    teamHourlyRate: "Hourly rate per cleaner for this team size (USD)",
    mode: "Pricing", amount: "Amount (USD)", fixed: "Fixed", hourly: "Hourly", perHour: "{value} per hour",
    notSet: "Not set", edit: "Edit prices", close: "Close editor", teamRates: "Override pay by team size",
    teamSize: "Team size", teamAmount: "Amount per cleaner (USD)", teamSummary: "Team of {count}: {value} each",
    defaults: "Standard service uses the default prices when its row is empty.",
    invalid: "Enter a valid USD amount with up to two decimal places (maximum $100,000).",
    baseRequired: "Enter the base cleaner pay when setting pay by team size.",
  },
  pt: {
    title: "Preços por tipo de serviço", client: "Preço do cliente", cleaner: "Repasse às profissionais",
    cleanerHouseAmount: "Repasse total da casa, dividido entre as profissionais (USD)", cleanerHourlyRate: "Valor por hora de cada profissional (USD)",
    clientHourlyRate: "Preço por hora para o cliente (USD)", houseSummary: "{value} pela casa", cleanerHourlySummary: "{value} por profissional",
    splitRule: "O repasse fixo da casa é dividido entre as profissionais. Se houver um valor para o tamanho da equipe, cada profissional recebe esse valor.",
    teamHourlyRate: "Valor por hora de cada profissional nesta equipe (USD)",
    mode: "Cobrança", amount: "Valor (USD)", fixed: "Fixo", hourly: "Por hora", perHour: "{value} por hora",
    notSet: "Não definido", edit: "Editar preços", close: "Fechar edição", teamRates: "Definir repasse específico por tamanho da equipe",
    teamSize: "Tamanho da equipe", teamAmount: "Valor por profissional (USD)", teamSummary: "Equipe de {count}: {value} por pessoa",
    defaults: "O serviço padrão usa os preços padrão quando a linha está vazia.",
    invalid: "Informe um valor válido em USD com até duas casas decimais (máximo de US$ 100.000).",
    baseRequired: "Informe o repasse base para definir valores por tamanho da equipe.",
  },
  es: {
    title: "Precios por tipo de servicio", client: "Precio al cliente", cleaner: "Pago a las profesionales",
    cleanerHouseAmount: "Pago total de la casa, repartido entre las profesionales (USD)", cleanerHourlyRate: "Tarifa por hora de cada profesional (USD)",
    clientHourlyRate: "Precio por hora para el cliente (USD)", houseSummary: "{value} por la casa", cleanerHourlySummary: "{value} por profesional",
    splitRule: "El pago fijo de la casa se reparte entre las profesionales. Si hay una tarifa para ese tamaño de equipo, cada profesional recibe esa tarifa.",
    teamHourlyRate: "Tarifa por hora de cada profesional de este equipo (USD)",
    mode: "Modalidad", amount: "Importe (USD)", fixed: "Fijo", hourly: "Por hora", perHour: "{value} por hora",
    notSet: "Sin definir", edit: "Editar precios", close: "Cerrar editor", teamRates: "Definir un pago específico por tamaño del equipo",
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
