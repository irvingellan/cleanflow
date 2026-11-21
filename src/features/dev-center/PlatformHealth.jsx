import { Icon } from "../../components/Icon.jsx";
import { DetailItem } from "../../components/UiPrimitives.jsx";
import { useTranslation } from "../../i18n/translations.js";

const badgeStyles = {
  errors: ["risk", "alert"],
  slow: ["warning", "clock"],
  ok: ["success", "checkCircle"],
  "no-data": ["neutral", "info"],
  unknown: ["neutral", "info"],
};

function useHealthReadings(health) {
  const { language, translate } = useTranslation();
  const count = new Intl.NumberFormat(language);
  const percent = new Intl.NumberFormat(language, { style: "percent", maximumFractionDigits: 1 });
  function rate(failed, attempts, fraction) {
    if (!Number.isFinite(failed)) return translate("platform.unavailable");
    if (!Number.isFinite(fraction) || !attempts) return count.format(failed);
    return translate("platform.failureRate", {
      failed: count.format(failed), attempts: count.format(attempts), rate: percent.format(fraction),
    });
  }

  const operations = Object.keys(health.operationAttempts || health.failedOperations || {}).map(kind => ({
    label: translate(`loadDiagnostics.operations.${kind}`),
    value: rate(health.failedOperations?.[kind] ?? 0, health.operationAttempts?.[kind], health.operationFailureRates?.[kind]),
  }));
  const failedLoads = rate(health.failedPageLoads, health.pageLoads, health.pageFailureRate);
  const timings = Number.isFinite(health.timedLoads) ? count.format(health.timedLoads) : translate("platform.unavailable");
  const tooltip = [
    translate("platform.failedPageLoads") + " · " + failedLoads,
    translate("platform.timedLoads") + " · " + timings,
    ...operations.map(({ label, value }) => label + " · " + value),
  ].join("\n");
  return { operations, failedLoads, timings, tooltip };
}

export function HealthBadge({ health }) {
  const { translate } = useTranslation();
  const { tooltip } = useHealthReadings(health);
  const [tone, icon] = badgeStyles[health.status] || badgeStyles.unknown;
  return <span className={`cf-tone--${tone}`} title={tooltip}>
    <span className="cf-state"><Icon name={icon} size={13} />{translate(`platform.${health.status}`)}</span>
  </span>;
}

export function HealthDetails({ health }) {
  const { language, translate } = useTranslation();
  const { operations, failedLoads, timings } = useHealthReadings(health);
  const count = new Intl.NumberFormat(language);
  const duration = ms => Number.isFinite(ms) ? `${count.format(ms)} ms` : translate("platform.unavailable");
  return <section className="cf-block platform-panel" aria-labelledby="platform-health">
    <div className="cf-block__header">
      <h3 id="platform-health">{translate("platform.health7d")}</h3>
      <HealthBadge health={health} />
    </div>
    <dl className="platform-health-facts">
      <DetailItem label={translate("platform.pageLoads")} value={count.format(health.pageLoads)} />
      <DetailItem label={translate("platform.failedPageLoads")} value={failedLoads} />
      <DetailItem label={translate("platform.median")} value={duration(health.medianMs)} />
      <DetailItem label={translate("platform.p95")} value={duration(health.p95Ms)} />
      <DetailItem label={translate("platform.timedLoads")} value={timings} />
    </dl>
    <div className="platform-failures">
      <h4>{translate("platform.operationRates")}</h4>
      {operations.length ? <dl className="platform-metrics">{operations.map(({ label, value }) =>
        <DetailItem key={label} label={label} value={value} />
      )}</dl> : <p>{translate("platform.noAttempts")}</p>}
    </div>
  </section>;
}
