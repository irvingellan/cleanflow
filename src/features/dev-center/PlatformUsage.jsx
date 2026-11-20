import { DetailItem } from "../../components/UiPrimitives.jsx";
import { Icon } from "../../components/Icon.jsx";
import { useTranslation } from "../../i18n/translations.js";
import "./platformUsage.css";

export function AttentionList({ organizations, onOpen, restoreFocus }) {
  const { translate } = useTranslation();
  if (!organizations.length || !organizations.every(org => Array.isArray(org.attentionReasons))) return null;
  const flagged = organizations.filter(org => org.attentionReasons.length);
  return <section className="cf-block platform-attention" aria-labelledby="platform-attention">
    <div className="cf-block__header"><h3 id="platform-attention">{translate("platform.needsAttention")}</h3></div>
    {flagged.length ? <ul>{flagged.flatMap(org => org.attentionReasons.map(reason => {
      const label = org.displayName || translate("platform.idLabel", { id: org.id });
      const key = org.id + "/" + reason;
      return <li key={key}>
        <span>{translate(`platform.reason.${reason}`)}</span>
        <a className={org.displayName ? undefined : "platform-org-id"} href={`/platform#company=${encodeURIComponent(org.id)}`}
          ref={node => {
            if (node && restoreFocus.current === key) {
              node.focus();
              restoreFocus.current = null;
            }
          }}
          onClick={event => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
            event.preventDefault();
            onOpen(org, key);
          }}>
          {label}<Icon name="chevronR" size={14} />
        </a>
      </li>;
    }))}</ul> : <p>{translate("platform.noAttention")}</p>}
  </section>;
}

function Funnel({ adoption }) {
  const { translate, language } = useTranslation();
  const count = new Intl.NumberFormat(language);
  return <section className="cf-block platform-usage-card" aria-labelledby="platform-funnel">
    <div className="cf-block__header"><h3 id="platform-funnel">{translate("platform.funnel")}</h3></div>
    <ol className="platform-funnel">{["profiles", "hubAccess", "active30d", "submitted30d"].map(key =>
      <li key={key}>
        <div><span>{translate(`platform.funnel.${key}`)}</span><strong>{count.format(adoption[key])}</strong></div>
        <span className="platform-funnel__track" aria-hidden="true">
          <span style={{ width: adoption.profiles ? `${100 * adoption[key] / adoption.profiles}%` : 0 }} />
        </span>
      </li>)}</ol>
  </section>;
}

function ActivityTrend({ weeks }) {
  const { translate, language } = useTranslation();
  const count = new Intl.NumberFormat(language);
  const date = new Intl.DateTimeFormat(language, { month: "numeric", day: "numeric", timeZone: "UTC" });
  const max = Math.max(1, ...weeks.map(week => week.count));
  return <section className="cf-block platform-usage-card" aria-labelledby="platform-weeks">
    <div className="cf-block__header"><div>
      <h3 id="platform-weeks">{translate("platform.trend")}</h3>
      <p className="cf-block__subtitle">{translate("platform.trendWindow")}</p>
    </div></div>
    <ol className="platform-trend">
      {weeks.map(week => <li key={week.startDate}>
        <strong>{count.format(week.count)}</strong>
        <span className="platform-trend__track" aria-hidden="true">
          <span style={{ height: `${100 * week.count / max}%` }} />
        </span>
        <time dateTime={week.startDate}>{date.format(new Date(week.startDate + "T00:00:00Z"))}</time>
      </li>)}
    </ol>
  </section>;
}

function Counts({ title, entries }) {
  const { translate, language } = useTranslation();
  const number = new Intl.NumberFormat(language);
  return <section className="cf-block platform-panel">
    <div className="cf-block__header"><h3>{translate(`platform.${title}`)}</h3></div>
    <dl className="platform-metrics">
      {entries.map(([key, value]) => <DetailItem key={key} label={translate(`platform.${key}`)}
        value={typeof value === "number" ? number.format(value) : value} />)}
    </dl>
  </section>;
}

export function UsageDetails({ usage }) {
  const { translate, language } = useTranslation();
  if (!usage) return null;
  const { adoption, checklists, reports, notifications, weeklyJobs } = usage;
  const deliveries = notifications.deliveries7d;
  const numerator = checklists.completedWithChecklist30d;
  const denominator = checklists.completedJobs30d;
  const number = new Intl.NumberFormat(language);
  const coverage = denominator ? translate("platform.coverageRate", {
    covered: number.format(numerator), completed: number.format(denominator),
    rate: new Intl.NumberFormat(language, { style: "percent", maximumFractionDigits: 1 }).format(numerator / denominator),
  }) : translate("platform.noCompletedJobs");
  return <div className="platform-usage-grid">
    <Funnel adoption={adoption} />
    <ActivityTrend weeks={weeklyJobs} />
    <Counts title="checklistUse" entries={[
      ["submittedChecklists", checklists.submitted30d], ["uploadedPhotos", checklists.photos30d], ["checklistCoverage", coverage],
    ]} />
    <Counts title="reportUse" entries={[["preparedReports", reports.prepared30d], ["sentReports", reports.sent30d]]} />
    <Counts title="registeredDevices" entries={[
      ["managerDevices", notifications.managerDevices], ["managerDevices7d", notifications.managerActive7d], ["cleanerDevices", notifications.cleanerDevices],
    ]} />
    <Counts title="deliveryUse" entries={[
      ["delivered", deliveries.sent], ["partial", deliveries.partial], ["deliveryFailed", deliveries.failed], ["noDevice", deliveries.noDevice],
    ]} />
  </div>;
}
