import { languageOptions, useTranslation } from "../i18n/translations.js";

export function LanguageSelector({ language, onChange, translate: localizedTranslate }) {
  const { translate: managerTranslate } = useTranslation();
  const translate = localizedTranslate || managerTranslate;

  return (
    <select
      className="language-selector"
      value={language}
      aria-label={translate("common.language")}
      onChange={(event) => onChange(event.target.value)}
    >
      {languageOptions.map((option) => (
        <option key={option.code} value={option.code}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
