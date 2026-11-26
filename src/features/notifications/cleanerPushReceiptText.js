import { translateInLanguage } from "../../i18n/translations.js";

export function cleanerPushReceiptText({ attemptedAt, receipt }, language, { lastTest = false } = {}) {
  const copy = (key, values) => translateInLanguage(language, `cleanerPushReceipt.${key}`, values);
  const format = new Intl.DateTimeFormat(language === "pt" ? "pt-BR" : language, {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  const time = (iso) => iso && Number.isFinite(Date.parse(iso)) ? format.format(new Date(iso)) : null;
  const attempted = time(attemptedAt);
  const received = time(receipt?.receivedAt);
  const status = received
    ? copy("reached", { time: received, visibility: copy(receipt.clientVisible ? "open" : "closed") })
    : copy("unconfirmed");
  const failure = received && ["error", "suppressed"].includes(receipt.outcome) ? copy(receipt.outcome) : null;
  const summary = [attempted && copy("sent", { time: attempted }), status, failure].filter(Boolean).join(" · ");
  return lastTest ? copy("lastTest", { summary }) : summary;
}
