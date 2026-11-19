import { useEffect, useRef, useState } from "react";
import { Icon } from "../../components/Icon.jsx";
import { BackButton, DetailItem, StateCard } from "../../components/UiPrimitives.jsx";
import { useTranslation } from "../../i18n/translations.js";
import { getPlatformOverview } from "./devCenterService.js";
import { AttentionList, UsageDetails } from "./PlatformUsage.jsx";
import { HealthBadge, HealthDetails } from "./PlatformHealth.jsx";
import "./platformConsole.css";

function usePlatformRead(organizationId, onAccessDenied) {
  const [read, setRead] = useState({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    // A StrictMode remount can retire this effect before the read starts.
    Promise.resolve().then(() => current && getPlatformOverview(organizationId)).then(data => {
      if (current) setRead({ status: "ready", data });
    }).catch(error => {
      if (!current) return;
      if (["functions/permission-denied", "functions/unauthenticated"].includes(error?.code)) {
        onAccessDenied(true);
      } else {
        setRead({ status: "error" });
      }
    });
    return () => { current = false; };
  }, [organizationId, attempt, onAccessDenied]);
  function retry() {
    setRead({ status: "loading" });
    setAttempt(value => value + 1);
  }
  return { ...read, retry };
}

function ReadStatus({ read, detail = false }) {
  const { translate } = useTranslation();
  if (read.status === "loading") {
    return <StateCard status="status" message={translate(detail ? "platform.loadingTeam" : "platform.loading")} />;
  }
  return <div className="platform-notice">
    <StateCard status="alert" isError message={translate(detail ? "platform.teamError" : "platform.readError")} />
    <button type="button" className="button button--small" onClick={read.retry}>{translate("platform.retry")}</button>
  </div>;
}

function DateValue({ value, withTime = false }) {
  const { language, translate } = useTranslation();
  if (!value) return <span className="platform-muted">{translate("platform.missingDate")}</span>;
  const options = withTime ? { dateStyle: "short", timeStyle: "short" } : { dateStyle: "medium" };
  return <time dateTime={value}>{new Intl.DateTimeFormat(language, options).format(new Date(value))}</time>;
}

function CompanyName({ org }) {
  const { translate } = useTranslation();
  return org.displayName || <span className="platform-org-id">{translate("platform.idLabel", { id: org.id })}</span>;
}

function Summary({ organizations }) {
  const { language, translate } = useTranslation();
  const format = new Intl.NumberFormat(language);
  const totals = [
    ["companies", "building", organizations.length],
    ["cleaners", "users", organizations.reduce((sum, org) => sum + org.people.activeCleaners, 0)],
    ["created30d", "calendar", organizations.reduce((sum, org) => sum + org.jobs.created30d, 0)],
    ["openIssues", "alert", organizations.reduce((sum, org) => sum + org.attention.openIssues, 0)],
  ];
  return <dl className="platform-summary">
    {totals.map(([label, icon, value]) => <div key={label}>
      <dt><Icon name={icon} size={16} />{translate(`platform.${label}`)}</dt>
      <dd>{format.format(value)}</dd>
    </div>)}
  </dl>;
}

function operationMetrics(org) {
  return [
    ["team", [["managers", org.people.activeManagers], ["cleaners", org.people.activeCleaners], ["archivedCleaners", org.people.archivedCleaners]]],
    ["portfolio", [["activeClients", org.clients.active], ["archivedClients", org.clients.archived], ["activeProperties", org.properties.active], ["archivedProperties", org.properties.archived]]],
    ["jobs", [["totalJobs", org.jobs.total], ["created30d", org.jobs.created30d], ["scheduled7d", org.jobs.scheduled7d], ["completed30d", org.jobs.completed30d]]],
    ["attention", [["openIssues", org.attention.openIssues], ["waitingOffers", org.attention.waitingOffers]]],
  ];
}

function Metrics({ entries }) {
  const { translate, language } = useTranslation();
  const format = new Intl.NumberFormat(language);
  return <dl className="platform-metrics">
    {entries.map(([key, value]) => <DetailItem key={key} label={translate(`platform.${key}`)} value={format.format(value)} />)}
  </dl>;
}

function byActivity(a, b, ascending) {
  if (!a.lastActivityAt && b.lastActivityAt) return 1;
  if (a.lastActivityAt && !b.lastActivityAt) return -1;
  const dateOrder = (a.lastActivityAt || "").localeCompare(b.lastActivityAt || "");
  return dateOrder ? (ascending ? dateOrder : -dateOrder) : a.id.localeCompare(b.id);
}

function CompanyTable({ organizations, ascending, onSort, onOpen, restoreFocus }) {
  const { translate } = useTranslation();
  return <section className="cf-block platform-directory" aria-labelledby="platform-companies">
    <div className="cf-block__header">
      <h3 id="platform-companies">{translate("platform.companies")}</h3>
    </div>
    <table className="platform-table" aria-labelledby="platform-companies">
      <thead><tr>
        <th scope="col">{translate("platform.company")}</th>
        {["team", "portfolio", "jobs", "attention"].map(key => <th className="platform-wide" scope="col" key={key}>{translate(`platform.${key}`)}</th>)}
        <th scope="col" aria-sort={ascending ? "ascending" : "descending"}>
          <button type="button" className="platform-sort" onClick={onSort}>
            {translate("platform.activity")}<span aria-hidden="true">{ascending ? "↑" : "↓"}</span>
          </button>
        </th>
        <th scope="col">{translate("platform.health")}</th>
      </tr></thead>
      <tbody>{[...organizations].sort((a, b) => byActivity(a, b, ascending)).map(org =>
        <tr key={org.id} onClick={() => onOpen(org)}>
          <th scope="row">
            <button type="button" className="platform-company" ref={node => {
              if (node && restoreFocus.current === org.id) {
                node.focus();
                restoreFocus.current = null;
              }
            }} onClick={event => { event.stopPropagation(); onOpen(org); }}>
              <CompanyName org={org} /><Icon name="chevronR" size={15} />
            </button>
          </th>
          {operationMetrics(org).map(([key, entries]) => <td className="platform-wide" key={key}><Metrics entries={entries} /></td>)}
          <td><DateValue value={org.lastActivityAt} withTime /></td>
          <td><HealthBadge health={org.health} /></td>
        </tr>
      )}</tbody>
    </table>
  </section>;
}

function CompanyDetail({ org, onBack, onAccessDenied }) {
  const { translate } = useTranslation();
  const read = usePlatformRead(org.id, onAccessDenied);
  const heading = useRef(null);
  useEffect(() => { heading.current?.focus(); }, []);
  return <div className="platform-detail">
    <div className="platform-detail-heading">
      <BackButton onClick={onBack} />
      <h3 ref={heading} tabIndex={-1}><CompanyName org={org} /></h3>
      <p>{translate("platform.created")} <DateValue value={org.createdAt} /></p>
    </div>
    <HealthDetails health={org.health} />
    {read.status === "ready" && <UsageDetails usage={read.data.usage} />}
    <section className="cf-block platform-panel" aria-labelledby="platform-members">
      <div className="cf-block__header"><h3 id="platform-members">{translate("platform.members")}</h3></div>
      {read.status !== "ready" ? <ReadStatus read={read} detail /> : read.data.people.length ? (
        <table className="platform-table platform-people" aria-labelledby="platform-members">
          <thead><tr>{["name", "role", "state", "lastAccess"].map(key =>
            <th scope="col" key={key}>{translate(`platform.${key}`)}</th>
          )}</tr></thead>
          <tbody>{read.data.people.map((member, index) => <tr key={index}>
            <th scope="row">{member.displayName || translate("platform.unnamed")}</th>
            <td>{translate(`platform.${member.role}`)}</td>
            <td>{translate(member.active ? "platform.active" : "platform.inactive")}</td>
            <td>
              <DateValue value={member.lastActivityAt ?? (member.role === "MANAGER" ? member.lastSignInAt : null)} withTime />
              {member.activitySource && <small className="platform-activity-source">
                {translate(`platform.source.${member.activitySource}`)}
              </small>}
            </td>
          </tr>)}</tbody>
        </table>
      ) : <StateCard status="status" message={translate("platform.noMembers")} />}
    </section>
    <div className="platform-detail-metrics">{operationMetrics(org).map(([key, entries]) =>
      <section key={key} className="cf-block platform-panel">
        <div className="cf-block__header"><h3>{translate(`platform.${key}`)}</h3></div>
        <Metrics entries={entries} />
      </section>
    )}</div>
  </div>;
}

export function PlatformConsole({ children }) {
  const { translate } = useTranslation();
  const [denied, setDenied] = useState(false);
  const read = usePlatformRead(undefined, setDenied);
  const [selectedId, setSelectedId] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get("company"));
  const [ascending, setAscending] = useState(false);
  const restoreFocus = useRef(null);
  const attentionFocus = useRef(null);
  if (denied) return <StateCard isError status="alert" message={translate("platform.denied")} />;
  if (read.status !== "ready") return <ReadStatus read={read} />;
  const { organizations } = read.data;
  const selected = organizations.find(org => org.id === selectedId);
  if (selected) return <><CompanyDetail key={selected.id} org={selected} onAccessDenied={setDenied} onBack={() => {
    if (!attentionFocus.current) restoreFocus.current = selected.id;
    if (new URLSearchParams(window.location.hash.slice(1)).has("company")) {
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    }
    setSelectedId(null);
  }} />{children}</>;
  return <><div className="platform-overview">
    <AttentionList organizations={organizations} restoreFocus={attentionFocus} onOpen={(org, key) => {
      attentionFocus.current = key;
      setSelectedId(org.id);
    }} />
    <Summary organizations={organizations} />
    {organizations.length ? <CompanyTable organizations={organizations} ascending={ascending}
      onSort={() => setAscending(value => !value)} onOpen={org => setSelectedId(org.id)} restoreFocus={restoreFocus} /> :
      <StateCard status="status" message={translate("platform.empty")} />}
  </div>{children}</>;
}
