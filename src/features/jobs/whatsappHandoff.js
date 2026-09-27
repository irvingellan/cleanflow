/** Returns international digits only when the Cleaner phone has a clear country prefix. */
export function normalizeWhatsAppPhone(phone) {
  if (typeof phone !== "string") return null;
  const value = phone.trim();
  if (!value || !/^\+?[\d\s()-]+$/.test(value)) return null;

  const hasPlusPrefix = value.startsWith("+");
  const digits = value.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15 || digits.startsWith("0")) return null;

  // Cleaner profile entry requires '+'. Also accept an already-present NANP
  // country prefix (1) when a legacy value omitted the plus; never add one.
  if (!hasPlusPrefix && !(digits.length === 11 && digits.startsWith("1"))) return null;
  return digits;
}

export function buildWhatsAppHandoffUrl(phone, message) {
  const digits = normalizeWhatsAppPhone(phone);
  if (!digits || typeof message !== "string" || !message.trim()) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
