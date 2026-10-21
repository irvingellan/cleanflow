import { Button } from "../../../components/v2/primitives.jsx";
import { attentionFor, checklistSummary, nextActionFor, offerSummary, otherActionsFor } from "../model/selectors.js";
import { useStore } from "../model/store.js";
import { Icon } from "../ui/Icon.jsx";
import { AttentionTag, JobStatus, Rail, SimTag, cleanerName, clientOf, compText, propertyOf, useT, whenText, whyText } from "../ui/kit.jsx";

const actionIcon = { assign: "userCheck", sendOffer: "send", reviewOffers: "users", remind: "msg", message: "msg", review: "clipCheck", viewProgress: "clipboard", viewReport: "clipboard", complete: "checkCircle", newLink: "link", issue: "alert", property: "building", cleanerView: "phone" };

/** One place that turns an intent into an overlay or a domain action. */
export function useActions() {
  const { setUi, act, data, ui } = useStore();
  const t = useT();
  return (action, job) => {
    const open = overlay => setUi({ overlay: { ...overlay, jobId: job?.id } });
    switch (action) {
      case "assign": case "reviewOffers": return open({ type: "assign" });
      case "sendOffer": return open({ type: "offer" });
      case "remind": case "message": return open({ type: "remind" });
      case "review": case "viewProgress": case "viewReport": return open({ type: "review" });
      case "complete": return open({ type: "complete" });
      case "issue": return open({ type: "issue" });
      case "property": return open({ type: "property", propertyId: job.propertyId });
      case "newLink": return act("NEW_LINK", { jobId: job.id }, { text: t("nl.done"), icon: "link" });
      case "cleanerView": {
        const assigned = job.cleanerIds[0];
        const offered = job.offers.find(o => !o.response) || job.offers[0];
        if (assigned) return setUi({ cleanerView: { kind: "checklist", jobId: job.id, cleanerId: assigned }, overlay: null });
        if (offered) return setUi({ cleanerView: { kind: "offer", jobId: job.id, cleanerId: offered.cleanerId }, overlay: null });
        return open({ type: "offer" });
      }
      default: return undefined;
    }
  };
}

export function ActionButton({ action, job, variant = "secondary", size, block }) {
  const t = useT();
  const run = useActions();
  return (
    <button type="button" className={`cfv2-button cfv2-button-${variant === "quiet" ? "tertiary" : variant} mw-btn${size ? ` cfv2-button-${size}` : ""}${block ? " mw-btn-block" : ""}`} onClick={() => run(action, job)}>
      <Icon name={actionIcon[action] || "arrowR"} size={17} />{t(`a.${action}`)}
    </button>
  );
}

export function NextStep({ job, sticky = false }) {
  const t = useT();
  const { data } = useStore();
  const next = nextActionFor(data, job);
  const top = attentionFor(data, job)[0];
  const others = otherActionsFor(data, job, next.action);
  if (sticky) {
    return (
      <div className="mw-sticky-action">
        <span className="mw-micro">{t("j.nextStep")}</span>
        <ActionButton action={next.action} job={job} variant={top ? "primary" : "secondary"} size="large" block />
      </div>
    );
  }
  return (
    <section className={`mw-nextstep${top ? ` tone-${top.tone}` : ""}`} aria-label={t("j.nextStep")}>
      <span className="mw-micro">{t("j.nextStep")}</span>
      {top ? <><AttentionTag item={top} /><p className="mw-why">{whyText(t, data, top, job)}</p></>
        : <p className="mw-why"><strong>{t(`att.${next.kind}`)}</strong></p>}
      <ActionButton action={next.action} job={job} variant={top || next.action === "complete" ? "primary" : "secondary"} size="large" block />
      {others.length > 0 && (
        <div className="mw-other-actions">
          <span className="mw-micro">{t("j.otherActions")}</span>
          {others.map(a => <ActionButton key={a} action={a} job={job} variant="quiet" block />)}
        </div>
      )}
    </section>
  );
}

function Block({ title, icon, children, aside }) {
  return (
    <section className="mw-block">
      <header><h3><Icon name={icon} size={16} />{title}</h3>{aside}</header>
      {children}
    </section>
  );
}

export function JobDetail({ job, withNextStep = true, onClose, outOfRange }) {
  const t = useT();
  const { data, act } = useStore();
  const run = useActions();
  const property = propertyOf(data, job);
  const cl = checklistSummary(data, job);
  const offers = offerSummary(job);
  const openIssues = job.issues.filter(i => i.status === "open");
  const pct = cl.total ? Math.round((cl.done / cl.total) * 100) : 0;
  return (
    <article className="mw-detail" aria-labelledby={`job-title-${job.id}`}>
      <header className="mw-detail-head">
        <div className="mw-detail-titles">
          <span className="mw-micro">{whenText(t, data, job)} · {t(`type.${job.type}`)}</span>
          <h2 id={`job-title-${job.id}`} tabIndex={-1}>{property.name}</h2>
          <p className="mw-sec">{property.area} · {clientOf(data, property)}{job.guestOut ? ` · ${t("j.guests", { out: t.time(job.guestOut), in: t.time(job.guestIn) })}` : ""}</p>
        </div>
        {onClose && <button type="button" className="mw-iconbtn" onClick={onClose} aria-label={t("j.close")}><Icon name="x" /></button>}
      </header>
      {outOfRange && <p className="mw-inline-note"><Icon name="info" size={15} />{t("j.outOfRange")}</p>}
      <div className="mw-detail-status"><JobStatus job={job} /></div>
      <Rail job={job} />
      {withNextStep && <NextStep job={job} />}

      <div className="mw-blocks">
        <Block title={t("j.cleaner")} icon="users" aside={job.cleanerIds.length > 1 ? <span className="mw-tag">{t("j.team")}</span> : null}>
          {job.cleanerIds.length ? (
            <ul className="mw-plainlist">
              {job.cleanerIds.map(id => (
                <li key={id} className="mw-person"><span className="mw-avatar">{cleanerName(id).slice(0, 2).toUpperCase()}</span>
                  <span><strong>{cleanerName(id)}</strong><span className={`mw-flag tone-${job.ack === "confirmed" ? "success" : "attention"}`}><Icon name={job.ack === "confirmed" ? "check" : "clock"} size={14} />{t(`ack.${job.ack || "pending"}`)}</span></span>
                </li>
              ))}
            </ul>
          ) : <p className="mw-sec">{offers.sent ? `${offers.sent} · ${t("j.offers")}` : t("j.noOffers")}</p>}
          {offers.sent > 0 && (
            <ul className="mw-offerlist" aria-label={t("j.offers")}>
              {job.offers.map(o => (
                <li key={o.cleanerId}><span>{cleanerName(o.cleanerId)}</span>
                  <span className={`mw-flag tone-${o.response === "interested" ? "attention" : o.response === "declined" ? "neutral" : "info"}`}>
                    <Icon name={o.response === "interested" ? "userCheck" : o.response === "declined" ? "x" : "clock"} size={14} />
                    {t(`offer.${o.response || "waiting"}`)}{o.via === "message" && o.response ? ` · ${t("offer.viaMessage")}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Block>

        <Block title={t("j.checklist")} icon="clipCheck" aside={<span className={`mw-flag tone-${cl.state === "submitted" ? "attention" : cl.state === "reviewed" ? "success" : "neutral"}`}>{t(`cl.${cl.state}`)}</span>}>
          {cl.state !== "none" ? (
            <>
              <div className="mw-progress" role="img" aria-label={t("j.items", { done: cl.done, total: cl.total })}><span style={{ width: `${pct}%` }} /></div>
              <p className="mw-sec">{t("j.items", { done: cl.done, total: cl.total })} · {t("j.photos", { count: cl.photos })}</p>
              {(cl.missingPhotos.length > 0 && cl.state === "submitted") && <p className="mw-flag tone-risk"><Icon name="alert" size={14} />{t("rv.missingTitle")}</p>}
            </>
          ) : <p className="mw-sec">{t("j.version", { v: cl.templateVersion })}</p>}
          <p className={`mw-flag tone-${cl.link === "stale" ? "attention" : "neutral"}`}><Icon name="link" size={14} />{t(`link.${cl.link || "none"}`)}</p>
          {cl.state !== "none" && <button type="button" className="mw-linkbtn" onClick={() => run("review", job)}>{t(cl.state === "submitted" ? "a.review" : cl.state === "draft" ? "a.viewProgress" : "a.viewReport")}<Icon name="arrowR" size={15} /></button>}
        </Block>

        <Block title={t("j.payment")} icon="dollar" aside={job.comp?.mode === "hourly" ? <SimTag kind="proposal" /> : null}>
          <p><strong>{compText(t, job.comp)}</strong></p>
          {job.comp?.source === "property" && <p className="mw-sec">{t("comp.fromProperty")}</p>}
          {job.comp?.source === "override" && <p className="mw-flag tone-attention">{t("comp.override", { reason: job.comp.reason })}</p>}
        </Block>

        <Block title={t("j.property")} icon="building">
          <p className="mw-sec">{property.instructions[t.lang] || property.instructions.en}</p>
          <p className="mw-flag tone-neutral"><Icon name="lock" size={14} />{t("j.accessMasked")}</p>
          <button type="button" className="mw-linkbtn" onClick={() => run("property", job)}>{t("a.property")}<Icon name="arrowR" size={15} /></button>
        </Block>

        <Block title={t("j.issues")} icon="alert">
          {openIssues.length ? openIssues.map(issue => (
            <div key={issue.id} className="mw-issue">
              <p><strong>{issue.title[t.lang] || issue.title.en}</strong></p>
              <p className="mw-sec">{cleanerName(issue.by)} · {t.stamp(issue.at)}</p>
              <button type="button" className="cfv2-button cfv2-button-secondary mw-btn cfv2-button-small" onClick={() => act("RESOLVE_ISSUE", { jobId: job.id, issueId: issue.id }, { text: t("is.resolved") })}>{t("is.resolve")}</button>
            </div>
          )) : <p className="mw-sec">{t("j.noIssues")}</p>}
        </Block>

        <Block title={t("j.activity")} icon="history">
          <ol className="mw-activity">
            {[...job.activity].reverse().slice(0, 6).map((entry, i) => <li key={i}><span className="tnum">{t.stamp(entry.at)}</span>{t(entry.key, entry.params)}</li>)}
            {!job.activity.length && <li className="mw-sec">—</li>}
          </ol>
        </Block>
      </div>
    </article>
  );
}

export function EmptyDetail() {
  const t = useT();
  return <div className="mw-empty-detail"><Icon name="layout" size={28} /><p>{t("j.selectPrompt")}</p></div>;
}

export function PrimaryFor({ job }) {
  const { data } = useStore();
  const next = nextActionFor(data, job);
  return <ActionButton action={next.action} job={job} variant="primary" size="small" />;
}

export { Button };
