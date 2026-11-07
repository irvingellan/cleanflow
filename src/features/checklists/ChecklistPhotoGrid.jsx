import { useCallback, useEffect, useRef, useState } from "react";
import { PhotoLightbox } from "../../components/PhotoLightbox.jsx";

const maximumParallelLoads = 3;

export function evidenceKey(item) {
  return item.evidenceId || item.requirementId;
}

const entryKey = (item, variant) => `${evidenceKey(item)}|${variant}`;

/**
 * Loads saved checklist photos on demand: at most three at a time, each one
 * once per visit, released when the screen closes. The grid asks for a photo
 * when its tile comes near the screen; the viewer asks first for the photo
 * being viewed and its neighbours.
 */
export function useChecklistPhotoLoader(jobId, loadEvidence) {
  const [entries, setEntries] = useState({});
  const state = useRef(null);

  useEffect(() => {
    const current = { alive: true, active: 0, queue: [], requested: new Set(), urls: new Set() };
    state.current = current;
    setEntries({});
    return () => {
      current.alive = false;
      current.queue = [];
      current.urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [jobId, loadEvidence]);

  const pump = useCallback(() => {
    const current = state.current;
    while (current?.alive && current.active < maximumParallelLoads && current.queue.length) {
      const { key, item, variant } = current.queue.shift();
      current.active += 1;
      setEntries((value) => ({ ...value, [key]: { status: "loading" } }));
      const load = loadEvidence(jobId, item.requirementId, item.evidenceId, { variant });
      Promise.resolve(load).then((blob) => {
        if (!current.alive) return;
        const url = URL.createObjectURL(blob);
        current.urls.add(url);
        setEntries((value) => ({ ...value, [key]: { status: "ready", url } }));
      }).catch(() => {
        if (!current.alive) return;
        current.requested.delete(key);
        setEntries((value) => ({ ...value, [key]: { status: "error" } }));
      }).finally(() => {
        current.active -= 1;
        if (current.alive) pump();
      });
    }
  }, [jobId, loadEvidence]);

  const request = useCallback((item, { first = false, variant = "full" } = {}) => {
    const current = state.current;
    if (!current?.alive || !item) return;
    const key = entryKey(item, variant);
    if (current.requested.has(key)) {
      const queued = current.queue.findIndex((entry) => entry.key === key);
      if (first && queued > 0) current.queue.unshift(...current.queue.splice(queued, 1));
      return;
    }
    current.requested.add(key);
    if (first) current.queue.unshift({ key, item, variant });
    else current.queue.push({ key, item, variant });
    pump();
  }, [pump]);

  return { entries, request };
}

function PhotoTile({ item, entry, request, onOpen, label, translate, hidden }) {
  const ref = useRef(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      request(item, { variant: "thumbnail" });
      return undefined;
    }
    const observer = new IntersectionObserver((records) => {
      if (records.some((record) => record.isIntersecting)) {
        request(item, { variant: "thumbnail" });
        observer.disconnect();
      }
    }, { rootMargin: "300px 0px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [item, request]);

  return (
    <button ref={ref} type="button" className={hidden ? "photo-grid__tile is-hidden-from-report" : "photo-grid__tile"}
      onClick={onOpen} aria-label={label}>
      {entry?.status === "ready"
        ? <img src={entry.url} alt="" loading="lazy" decoding="async" draggable={false} />
        : entry?.status === "error"
          ? <span className="photo-grid__error">{translate("photoViewer.unavailableShort")}</span>
          : <span className="photo-grid__skeleton" aria-hidden="true" />}
      {hidden && <span className="photo-grid__badge">{translate("photoViewer.hiddenShort")}</span>}
    </button>
  );
}

/** Saved checklist photos as a grid with a full-screen viewer. */
export function ChecklistPhotoGrid({ jobId, evidence, loadEvidence, translate, isHidden, onToggleReport, requirementLabel }) {
  const { entries, request } = useChecklistPhotoLoader(jobId, loadEvidence);
  const [openIndex, setOpenIndex] = useState(null);
  const getSrc = useCallback((index) => {
    const item = evidence[index];
    return item ? entries[entryKey(item, "full")]?.url || null : null;
  }, [entries, evidence]);
  // The small preview shows at once while the full photo loads.
  const getPlaceholderSrc = useCallback((index) => {
    const item = evidence[index];
    return item ? entries[entryKey(item, "thumbnail")]?.url || null : null;
  }, [entries, evidence]);
  const onNeed = useCallback((index) => request(evidence[index], { first: true, variant: "full" }), [evidence, request]);
  const close = useCallback(() => setOpenIndex(null), []);

  return (
    <>
      <ul className="photo-grid">
        {evidence.map((item, index) => (
          <li key={evidenceKey(item)}>
            <PhotoTile item={item} entry={entries[entryKey(item, "thumbnail")]} request={request} translate={translate}
              hidden={isHidden?.(item)} onOpen={() => setOpenIndex(index)}
              label={translate("photoViewer.openPhoto", { index: index + 1, label: requirementLabel(item) })} />
          </li>
        ))}
      </ul>
      {openIndex !== null && evidence[openIndex] && (
        <PhotoLightbox
          count={evidence.length}
          index={openIndex}
          getSrc={getSrc}
          getPlaceholderSrc={getPlaceholderSrc}
          onNeed={onNeed}
          onIndexChange={setOpenIndex}
          onClose={close}
          translate={translate}
          alt={translate("checklists.savedPhoto")}
          renderActions={(index) => {
            const item = evidence[index];
            return (
              <>
                <span className="photo-lightbox__caption">{requirementLabel(item)}</span>
                {item.evidenceId && onToggleReport && (
                  <button className="photo-lightbox__action" type="button" onClick={() => onToggleReport(item)}>
                    {translate(isHidden?.(item) ? "checklists.showInReport" : "checklists.hideFromReport")}
                  </button>
                )}
              </>
            );
          }}
        />
      )}
    </>
  );
}
