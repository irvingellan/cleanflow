import { useEffect, useMemo, useState } from "react";
import { buildMessage, cleanerT } from "../model/cleanerCopy.js";
import { checklistItems, cleaners } from "../model/demoData.js";
import { translate } from "../model/messages.js";
import { attentionFor, checklistSummary, templateFor } from "../model/selectors.js";
import { useStore } from "../model/store.js";
import { formatDay, formatTime, hhmm, minutesOf } from "../model/time.js";
import { linkFor } from "../flows/OperationalSheets.jsx";
import { Icon } from "../ui/Icon.jsx";
import { Overlay, PhotoTile, cleanerName, propertyOf, useT } from "../ui/kit.jsx";

const ct = (lang, key, params) => cleanerT(lang, key, params);

/* ---------------- Offer (cleaner side) ---------------- */
function CleanerOffer({ job, cleaner }) {
  const { data, act } = useStore();
  const lang = cleaner.lang;
  const property = propertyOf(data, job);
  const offer = job.offers.find(o => o.cleanerId === cleaner.id);
  const [screen, setScreen] = useState(offer?.response ? "result" : "message");
  const cl = checklistSummary(data, job);
  const hours = Math.round(job.durationMin / 60);
  const pay = job.comp?.mode === "hourly" ? `$${job.comp.rate}` : job.comp?.amount ? `$${job.comp.amount}` : "—";
  const respond = response => {
    act("OFFER_RESPONSE", { jobId: job.id, cleanerId: cleaner.id, cleanerName: cleaner.name, response, via: "link" });
    setScreen("result");
  };
  const message = buildMessage(job.offerConcept || "details", lang, {
    name: cleaner.name, type: translate(lang, `type.${job.type}`), area: property.area, property: property.name,
    day: formatDay(job.date, lang, "medium"), time: job.start ? formatTime(job.start, lang) : translate(lang, "c.timeNotSet"), hours, pay, link: linkFor(job, cleaner.id),
  });
  if (screen === "message") {
    return (
      <div className="cw-screen cw-chat">
        <header className="cw-chat-head"><span className="mw-avatar">CF</span><strong>{ct(lang, "co.messageTitle")}</strong></header>
        <div className="cw-chat-body">
          <div className="mw-bubble cw-incoming"><pre>{message.split(linkFor(job, cleaner.id))[0]}<button type="button" className="cw-link" onClick={() => setScreen("offer")}>{linkFor(job, cleaner.id)}</button>{message.split(linkFor(job, cleaner.id))[1]}</pre></div>
          <div className="cw-chat-hint"><Icon name="info" size={14} />{ct(lang, "co.why")}</div>
        </div>
        <div className="cw-sticky"><button type="button" className="cfv2-button cfv2-button-primary mw-btn cfv2-button-large mw-btn-block" onClick={() => setScreen("offer")}><Icon name="link" size={18} />{ct(lang, "co.openLink")}</button></div>
      </div>
    );
  }
  if (screen === "result") {
    const current = data.jobs.find(j => j.id === job.id).offers.find(o => o.cleanerId === cleaner.id);
    const interested = current?.response === "interested";
    return (
      <div className="cw-screen cw-result">
        <div className={`cw-result-mark ${interested ? "is-ok" : "is-neutral"}`}><Icon name={interested ? "checkCircle" : "x"} size={40} /></div>
        <h2>{ct(lang, interested ? "co.sentTitle" : "co.declinedTitle")}</h2>
        <p>{ct(lang, interested ? "co.sentBody" : "co.declinedBody")}</p>
        {interested && (
          <section className="cw-card">
            <h3>{ct(lang, "co.next")}</h3>
            <ol className="cw-steps"><li>{ct(lang, "co.next1")}</li><li>{ct(lang, "co.next2")}</li><li>{ct(lang, "co.next3")}</li></ol>
          </section>
        )}
        <section className="cw-card cw-summary"><strong>{translate(lang, `type.${job.type}`)} · {property.area}</strong><span>{formatDay(job.date, lang, "long")} · {job.start ? formatTime(job.start, lang) : "—"} · {pay}</span></section>
        {interested && <button type="button" className="mw-linkbtn" onClick={() => respond("declined")}>{ct(lang, "co.changeMind")}</button>}
      </div>
    );
  }
  return (
    <div className="cw-screen cw-offer">
      <header className="cw-offer-head">
        <span className="cw-brand">CleanFlow</span>
        <span className="cw-eyebrow">{ct(lang, "co.brand")}</span>
        <h2>{translate(lang, `type.${job.type}`)} · {property.area}</h2>
        <p>{ct(lang, "co.from")}</p>
      </header>
      <dl className="cw-facts">
        <div><dt><Icon name="calendar" size={16} />{ct(lang, "co.when")}</dt><dd><strong>{formatDay(job.date, lang, "long")}</strong><span>{job.start ? formatTime(job.start, lang) : translate(lang, "c.timeNotSet")} · {ct(lang, "co.duration", { hours })}</span></dd></div>
        <div><dt><Icon name="pin" size={16} />{ct(lang, "co.where")}</dt><dd><strong>{property.area}</strong><span>{ct(lang, "co.whereNote")}</span></dd></div>
        <div className="cw-pay"><dt><Icon name="dollar" size={16} />{ct(lang, "co.pay")}</dt><dd><strong className="cw-money">{pay}</strong><span>{job.comp?.mode === "hourly" ? ct(lang, "co.hourly", { total: `$${job.comp.rate * job.comp.estHours}`, hours: job.comp.estHours }) : ct(lang, "co.fixed")}</span></dd></div>
      </dl>
      <section className="cw-card">
        <h3>{ct(lang, "co.expect")}</h3>
        <ul className="cw-expect">
          <li><Icon name="clipCheck" size={16} />{ct(lang, "co.expectChecklist", { count: cl.total })}</li>
          {job.guestIn && <li><Icon name="clock" size={16} />{ct(lang, "co.expectGuest", { time: formatTime(job.guestIn, lang) })}</li>}
          <li><Icon name="check" size={16} />{ct(lang, "co.expectLinen")}</li>
        </ul>
      </section>
      <p className="cw-note"><Icon name="info" size={14} />{ct(lang, "co.notAssign")}</p>
      <p className="cw-note"><Icon name="lock" size={14} />{ct(lang, "co.secureNote")}</p>
      <div className="cw-sticky cw-sticky-double">
        <button type="button" className="cfv2-button cfv2-button-primary mw-btn mw-btn-xl mw-btn-block" onClick={() => respond("interested")}><Icon name="check" size={20} />{ct(lang, "co.interested")}</button>
        <button type="button" className="cfv2-button cfv2-button-secondary mw-btn mw-btn-block" onClick={() => respond("declined")}>{ct(lang, "co.decline")}</button>
      </div>
    </div>
  );
}

/* ---------------- Checklist (cleaner side) ---------------- */
function useUploadSimulation(job) {
  const { act } = useStore();
  const uploading = (job.checklist.photos || []).filter(p => p.status === "uploading");
  useEffect(() => {
    if (!uploading.length) return undefined;
    const id = setTimeout(() => {
      uploading.forEach(p => {
        const progress = Math.min(100, (p.progress || 0) + 34);
        if (p.willFail && progress >= 60) act("CL_PHOTO_STATUS", { jobId: job.id, photoId: p.id, status: "failed", progress: 60 });
        else act("CL_PHOTO_STATUS", { jobId: job.id, photoId: p.id, status: progress >= 100 ? "saved" : "uploading", progress });
      });
    }, 420);
    return () => clearTimeout(id);
  }, [JSON.stringify(uploading.map(p => [p.id, p.progress]))]);
}

function CleanerChecklist({ job: initialJob, cleaner }) {
  const { data, act } = useStore();
  const job = data.jobs.find(j => j.id === initialJob.id);
  const lang = cleaner.lang;
  const property = propertyOf(data, job);
  const tpl = templateFor(data, job);
  const items = useMemo(() => checklistItems(tpl.sections), [tpl]);
  const cl = checklistSummary(data, job);
  const [screen, setScreen] = useState(cl.state === "submitted" ? "success" : "list");
  const [sectionId, setSectionId] = useState(null);
  const [note, setNote] = useState("");
  const [missingNote, setMissingNote] = useState("");
  const [workDone, setWorkDone] = useState(false);
  const [failNext, setFailNext] = useState(false);
  const [accessOverride, setAccessOverride] = useState(false);
  useUploadSimulation(job);
  const locked = cl.state === "submitted" || cl.state === "reviewed" || job.status === "COMPLETED";
  const photos = job.checklist.photos || [];
  const missing = items.filter(i => !job.checklist.items?.[i.id]);
  const uploadingCount = photos.filter(p => p.status === "uploading").length;
  const failedCount = photos.filter(p => p.status === "failed").length;
  const unlockAt = job.start ? minutesOf(job.start) - 120 : null;
  const accessOpen = accessOverride || (job.date === data.clock.date && unlockAt !== null && data.clock.minutes >= unlockAt) || job.date < data.clock.date;
  const savedTime = job.checklist.savedAt ? formatTime(hhmm(job.checklist.savedAt.min), lang) : "—";
  const addPhotos = (item, count, extra = false) => {
    const stamp = Date.now();
    const list = Array.from({ length: count }, (_, i) => ({ id: `${job.id}-x${stamp}-${i}`, itemId: item.id, sectionId: item.sectionId, status: "uploading", progress: 6, n: photos.length + i + 1, willFail: failNext && i === 0, extra }));
    setFailNext(false);
    act("CL_PHOTOS_ADD", { jobId: job.id, photos: list });
  };
  const blocked = uploadingCount ? ct(lang, "cc.waitUploads") : failedCount ? ct(lang, "cc.retryFailed")
    : (missing.length && !missingNote.trim()) ? ct(lang, "cc.needNote") : !workDone ? ct(lang, "cc.needWorkDone") : null;
  const banner = cl.state === "submitted" ? { tone: "success", icon: "checkCircle", text: ct(lang, "cc.submittedBanner", { time: formatTime(hhmm(job.checklist.submittedAt.min), lang) }) }
    : cl.state === "reviewed" ? { tone: "success", icon: "checkCircle", text: ct(lang, "cc.reviewedBanner") }
      : cl.state === "changes" ? { tone: "warning", icon: "alert", text: ct(lang, "cc.changesBanner") }
        : { tone: "attention", icon: "clipboard", text: ct(lang, "cc.draft"), sub: job.checklist.savedAt ? ct(lang, "cc.saved", { time: savedTime }) : null };

  const Banner = () => (
    <div className={`cw-state tone-${banner.tone}`} role="status">
      <Icon name={banner.icon} size={18} /><span><strong>{banner.text}</strong>{banner.sub && <span>{banner.sub}</span>}</span>
    </div>
  );

  if (screen === "success") {
    return (
      <div className="cw-screen cw-result">
        <div className="cw-result-mark is-ok"><Icon name="checkCircle" size={44} /></div>
        <h2>{ct(lang, "cc.successTitle")}</h2>
        <p>{ct(lang, "cc.successBody", { time: job.checklist.submittedAt ? formatTime(hhmm(job.checklist.submittedAt.min), lang) : "" })}</p>
        <section className="cw-card cw-summary"><strong>{property.name}</strong><span>{ct(lang, "cc.successSummary", { items: cl.done, photos: cl.photos })}</span></section>
        <p className="cw-note">{ct(lang, "cc.successNext")}</p>
        <button type="button" className="cfv2-button cfv2-button-secondary mw-btn mw-btn-block" onClick={() => addPhotos(items.find(i => i.photo) || items[0], 1, true)}><Icon name="camera" size={18} />{ct(lang, "cc.addExtra")}</button>
        {photos.some(p => p.extra) && <div className="mw-photostrip">{photos.filter(p => p.extra).map(p => <PhotoTile key={p.id} photo={p} label={ct(lang, "cc.extra")} statusLabel={p.status === "failed" ? ct(lang, "cc.failed") : ct(lang, "cc.uploading", { p: p.progress || 0 })} />)}</div>}
        <button type="button" className="mw-linkbtn" onClick={() => setScreen("list")}>{ct(lang, "cc.backToList")}</button>
      </div>
    );
  }

  if (screen === "section") {
    const section = tpl.sections.find(s => s.id === sectionId);
    const sItems = items.filter(i => i.sectionId === sectionId);
    return (
      <div className="cw-screen">
        <div className="cw-topbar"><button type="button" className="mw-linkbtn" onClick={() => setScreen("list")}><Icon name="arrowL" size={16} />{ct(lang, "cc.backToList")}</button></div>
        <Banner />
        <h2 className="cw-title">{section.title[lang] || section.title.en}</h2>
        <ul className="cw-items">
          {sItems.map(item => {
            const done = job.checklist.items?.[item.id];
            const itemPhotos = photos.filter(p => p.itemId === item.id);
            return (
              <li key={item.id} className={`cw-item${done ? " is-done" : ""}`}>
                {item.photo ? (
                  <div className="cw-photo-item">
                    <p className="cw-item-label"><Icon name={done ? "checkCircle" : "camera"} size={20} />{item.label[lang] || item.label.en}<span className="cw-req">{ct(lang, "cc.photoRequired")}</span></p>
                    {itemPhotos.length > 0 && (
                      <div className="mw-photostrip">
                        {itemPhotos.map(p => (
                          <PhotoTile key={p.id} photo={p} label={`${p.n}`} statusLabel={p.status === "failed" ? ct(lang, "cc.failed") : ct(lang, "cc.uploading", { p: p.progress || 0 })}
                            retryLabel={ct(lang, "cc.retry")} onRetry={() => act("CL_PHOTO_STATUS", { jobId: job.id, photoId: p.id, status: "uploading", progress: 8 })} />
                        ))}
                      </div>
                    )}
                    {!locked && (
                      <div className="cw-photo-actions">
                        <button type="button" className="cfv2-button cfv2-button-secondary mw-btn" onClick={() => addPhotos(item, 1)}><Icon name="camera" size={18} />{ct(lang, "cc.takePhoto")}</button>
                        <button type="button" className="cfv2-button cfv2-button-tertiary mw-btn" onClick={() => addPhotos(item, 4)}><Icon name="image" size={18} />{ct(lang, "cc.library")}</button>
                      </div>
                    )}
                  </div>
                ) : (
                  <label className="cw-check">
                    <input type="checkbox" checked={Boolean(done)} disabled={locked} onChange={() => act("CL_TOGGLE", { jobId: job.id, itemId: item.id })} />
                    <span>{item.label[lang] || item.label.en}</span>
                  </label>
                )}
              </li>
            );
          })}
        </ul>
        {!locked && <label className="cw-sim"><input type="checkbox" checked={failNext} onChange={e => setFailNext(e.target.checked)} />{ct(lang, "cc.offline")}</label>}
        <p className="cw-note">{ct(lang, "cc.limit")}</p>
      </div>
    );
  }

  if (screen === "review") {
    return (
      <div className="cw-screen">
        <div className="cw-topbar"><button type="button" className="mw-linkbtn" onClick={() => setScreen("list")}><Icon name="arrowL" size={16} />{ct(lang, "cc.backToList")}</button></div>
        <h2 className="cw-title">{ct(lang, "cc.beforeSubmit")}</h2>
        {missing.length ? (
          <section className="cw-card cw-missing">
            <h3><Icon name="alert" size={17} />{ct(lang, "cc.missingList")}</h3>
            <ul>{missing.map(i => <li key={i.id}><span>{i.label[lang] || i.label.en}</span><button type="button" className="mw-linkbtn" onClick={() => { setSectionId(i.sectionId); setScreen("section"); }}>{ct(lang, "cc.goTo")}</button></li>)}</ul>
            <label className="mw-field"><span>{ct(lang, "cc.missingNote")}</span><textarea rows={2} value={missingNote} onChange={e => setMissingNote(e.target.value)} /></label>
          </section>
        ) : <div className="cw-state tone-success"><Icon name="checkCircle" size={18} /><strong>{ct(lang, "cc.allDone")}</strong></div>}
        <p className="cw-note">{ct(lang, "cc.photosSummary", { count: cl.photos })}</p>
        <label className="mw-field"><span>{ct(lang, "cc.notes")}</span><textarea rows={2} value={note} onChange={e => setNote(e.target.value)} /></label>
        <label className="cw-check cw-workdone"><input type="checkbox" checked={workDone} onChange={e => setWorkDone(e.target.checked)} /><span>{ct(lang, "cc.workDone")}</span></label>
        <div className="cw-sticky">
          <button type="button" className="cfv2-button cfv2-button-primary mw-btn mw-btn-xl mw-btn-block" disabled={Boolean(blocked)}
            onClick={() => { act("CL_SUBMIT", { jobId: job.id, cleanerName: cleaner.name, note, missingNote }); setScreen("success"); }}>
            <Icon name={blocked ? "lock" : "send"} size={20} />{blocked || ct(lang, "cc.submit")}
          </button>
        </div>
      </div>
    );
  }

  // List
  return (
    <div className="cw-screen">
      <header className="cw-offer-head cw-compact-head">
        <span className="cw-brand">CleanFlow</span>
        <h2>{property.name}</h2>
        <p>{formatDay(job.date, lang, "long")} · {job.start ? formatTime(job.start, lang) : "—"}</p>
      </header>
      <Banner />
      {cl.state !== "submitted" && cl.state !== "reviewed" && <p className="cw-note"><Icon name="info" size={14} />{ct(lang, "cc.draftWarn")}</p>}
      <section className="cw-card cw-access">
        <h3><Icon name={accessOpen ? "unlock" : "lock"} size={17} />{ct(lang, "cc.access")}</h3>
        {accessOpen ? <><p className="mw-mono cw-code">{ct(lang, "cc.accessCode", { code: property.accessCode })}</p><p className="cw-note">{ct(lang, "cc.accessNote")}</p></>
          : <><p>{ct(lang, "cc.accessLocked", { time: formatTime(hhmm(unlockAt ?? 0), lang) })}</p><button type="button" className="mw-linkbtn" onClick={() => setAccessOverride(true)}>{ct(lang, "cc.accessSimulate")}</button></>}
        <p className="cw-instructions"><strong>{ct(lang, "cc.instructions")}:</strong> {property.instructions[lang] || property.instructions.en}</p>
      </section>
      <div className="cw-progress"><span className="mw-progress"><span style={{ width: `${Math.round((cl.done / cl.total) * 100)}%` }} /></span><strong>{ct(lang, "cc.progress", { done: cl.done, total: cl.total })}</strong></div>
      <ul className="cw-sections">
        {tpl.sections.map(section => {
          const sItems = items.filter(i => i.sectionId === section.id);
          const done = sItems.filter(i => job.checklist.items?.[i.id]).length;
          const needsPhoto = sItems.some(i => i.photo && !job.checklist.items?.[i.id]);
          return (
            <li key={section.id}>
              <button type="button" className="cw-section-row" onClick={() => { setSectionId(section.id); setScreen("section"); }}>
                <Icon name={done === sItems.length ? "checkCircle" : needsPhoto ? "camera" : "clipboard"} size={20} />
                <span className="mw-grow"><strong>{section.title[lang] || section.title.en}</strong>{needsPhoto && <span className="cw-req">{ct(lang, "cc.photoRequired")}</span>}</span>
                <span className="cw-count">{ct(lang, "cc.sectionDone", { done, total: sItems.length })}</span>
                <Icon name="chevronR" size={18} />
              </button>
            </li>
          );
        })}
      </ul>
      {!locked && (
        <div className="cw-sticky">
          <button type="button" className="cfv2-button cfv2-button-primary mw-btn mw-btn-xl mw-btn-block" onClick={() => setScreen("review")}>
            <Icon name="send" size={20} />{ct(lang, "cc.reviewSubmit")}{missing.length ? ` · ${ct(lang, "cc.pending", { count: missing.length })}` : ""}
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------------- Preview frame and scenario chooser ---------------- */
export function CleanerPreview({ view, onClose }) {
  const t = useT();
  const { data, setUi } = useStore();
  if (view.kind === "chooser") {
    const offerScenarios = data.jobs.filter(j => j.offers.some(o => !o.response) && j.status !== "COMPLETED").slice(0, 4)
      .map(j => ({ kind: "offer", job: j, cleanerId: j.offers.find(o => !o.response).cleanerId }));
    const checklistScenarios = data.jobs.filter(j => j.cleanerIds.length && j.date === data.clock.date && j.status !== "COMPLETED").slice(0, 6)
      .map(j => ({ kind: "checklist", job: j, cleanerId: j.cleanerIds[0] }));
    return (
      <Overlay title={t("cv.title")} onClose={onClose}>
        <p className="mw-sec">{t("cv.intro")}</p>
        {[["cv.offer", offerScenarios], ["cv.checklist", checklistScenarios]].map(([label, list]) => (
          <section key={label} className="mw-sheet-section">
            <h3 className="mw-micro">{t(label)}</h3>
            {!list.length && <p className="mw-sec">{t("cv.noOffers")}</p>}
            <ul className="mw-optionlist">
              {list.map(s => (
                <li key={`${s.kind}-${s.job.id}`}>
                  <button type="button" className="mw-option" onClick={() => setUi({ cleanerView: { kind: s.kind, jobId: s.job.id, cleanerId: s.cleanerId } })}>
                    <Icon name={s.kind === "offer" ? "send" : "clipCheck"} />
                    <span className="mw-grow"><strong>{t("cv.as", { name: cleanerName(s.cleanerId), property: propertyOf(data, s.job).name })}</strong>
                      <span className="mw-sec">{s.kind === "checklist" ? t(`cl.${s.job.checklist.state}`) : t("offer.waiting")}</span></span>
                    <Icon name="chevronR" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </Overlay>
    );
  }
  const job = data.jobs.find(j => j.id === view.jobId);
  const cleaner = cleaners.find(c => c.id === view.cleanerId);
  return (
    <div className="mw-overlay mw-overlay-phone">
      <div className="mw-scrim" onClick={onClose} aria-hidden="true" />
      <section className="mw-phone-stage" role="dialog" aria-modal="true" aria-label={t("cv.phoneLabel")} onKeyDown={e => { if (e.key === "Escape") onClose(); }}>
        <div className="mw-phone-bar">
          <span className="mw-simtag mw-simtag-simulated"><Icon name="phone" size={12} />{t("cv.title")}</span>
          <span className="mw-sec">{t("cv.as", { name: cleaner.name, property: propertyOf(data, job).name })} · {cleaner.lang.toUpperCase()}</span>
          <button type="button" className="cfv2-button cfv2-button-secondary mw-btn cfv2-button-small" onClick={onClose} data-autofocus><Icon name="arrowL" size={15} />{t("cv.backToManager")}</button>
        </div>
        <div className="mw-phone" lang={cleaner.lang}>
          {view.kind === "offer" ? <CleanerOffer key={`${job.id}-${cleaner.id}`} job={job} cleaner={cleaner} /> : <CleanerChecklist key={`${job.id}-${cleaner.id}`} job={job} cleaner={cleaner} />}
        </div>
      </section>
    </div>
  );
}

export { attentionFor };
