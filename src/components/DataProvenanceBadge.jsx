import { useTranslation } from "../i18n/translations.js";
import { normalizeDataProvenance } from "../lib/dataProvenance.js";

export function DataProvenanceBadge({ record }) {
  const { translate } = useTranslation();
  const provenance = normalizeDataProvenance(record);

  return (
    <span className={`data-provenance-badge data-provenance-badge--${provenance.toLowerCase()}`}>
      {translate(`provenance.${provenance.toLowerCase()}`)}
    </span>
  );
}
