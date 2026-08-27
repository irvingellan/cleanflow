import { useTranslation } from "../i18n/translations.js";

export function StateCard({ message, status, isError = false }) {
  return (
    <p className={`state-card${isError ? " state-card--error" : ""}`} role={status}>
      {message}
    </p>
  );
}

export function BackButton({ onClick }) {
  const { translate } = useTranslation();

  return (
    <button className="back-button" type="button" onClick={onClick}>
      ← {translate("common.back")}
    </button>
  );
}

export function DetailItem({ label, value }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
