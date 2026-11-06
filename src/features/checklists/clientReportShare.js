// The manager sends the client report herself, from her own WhatsApp or
// email. These helpers only build the message and the links that open those
// apps; nothing is sent by CleanFlow.

const messages = {
  en: ({ name, property, date, url }) =>
    `Hi${name ? ` ${name}` : ""}! The cleaning${property ? ` at ${property}` : ""}${date ? ` on ${date}` : ""} is done. Here is the report with the photos: ${url}`,
  pt: ({ name, property, date, url }) =>
    `Olá${name ? `, ${name}` : ""}! A limpeza${property ? ` de ${property}` : ""}${date ? ` em ${date}` : ""} foi concluída. Aqui está o relatório com as fotos: ${url}`,
  es: ({ name, property, date, url }) =>
    `¡Hola${name ? `, ${name}` : ""}! La limpieza${property ? ` de ${property}` : ""}${date ? ` del ${date}` : ""} está lista. Aquí está el informe con las fotos: ${url}`,
};

const subjects = {
  en: (property) => `Cleaning report${property ? ` — ${property}` : ""}`,
  pt: (property) => `Relatório de limpeza${property ? ` — ${property}` : ""}`,
  es: (property) => `Informe de limpieza${property ? ` — ${property}` : ""}`,
};

export const clientReportMessageLanguages = Object.keys(messages);

function firstName(value) {
  return typeof value === "string" ? value.trim().split(/\s+/)[0] || "" : "";
}

/** Short, friendly message in the client's language with the report link. */
export function buildClientReportMessage({ language = "en", clientName, propertyName, serviceDate, url }) {
  const build = messages[language] || messages.en;
  return build({
    name: firstName(clientName),
    property: typeof propertyName === "string" ? propertyName.trim() : "",
    date: serviceDate || "",
    url,
  });
}

export function buildClientReportSubject({ language = "en", propertyName }) {
  return (subjects[language] || subjects.en)(typeof propertyName === "string" ? propertyName.trim() : "");
}

/**
 * WhatsApp number in international digits. A 10-digit number is treated as a
 * US number (+1), the operation's default. Anything else unusual opens
 * WhatsApp without a recipient so the manager picks the chat.
 */
export function whatsappDigits(phone) {
  if (typeof phone !== "string") return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `1${digits}`;
  return digits.length >= 11 && digits.length <= 15 ? digits : "";
}

export function clientReportWhatsappUrl({ phone, message }) {
  const digits = whatsappDigits(phone);
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function clientReportEmailUrl({ email, subject, message }) {
  const recipient = typeof email === "string" && /^[^\s@]+@[^\s@]+$/.test(email.trim()) ? email.trim() : "";
  return `mailto:${encodeURIComponent(recipient).replace(/%40/g, "@")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
}
