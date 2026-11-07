import { useCallback, useEffect, useRef, useState } from "react";

const swipeThreshold = 50;

/**
 * Full-screen photo viewer shared by the manager checklist and the client
 * report: swipe or arrow keys to move, Escape to close, neighbours preloaded.
 * `getSrc(index)` returns a ready URL or null while it is still loading;
 * `onNeed(index)` asks the owner to load that photo (current and neighbours).
 */
export function PhotoLightbox({
  count, index, getSrc, onNeed, onIndexChange, onClose, translate, alt, renderActions,
}) {
  const closeRef = useRef(null);
  const pointer = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const src = getSrc(index);

  const move = useCallback((step) => onIndexChange((index + step + count) % count), [count, index, onIndexChange]);

  useEffect(() => { setLoaded(false); setFailed(false); }, [index, src]);

  useEffect(() => {
    onNeed?.(index);
    if (count > 1) {
      onNeed?.((index + 1) % count);
      onNeed?.((index - 1 + count) % count);
    }
  }, [count, index, onNeed]);

  useEffect(() => {
    if (count < 2 || typeof Image === "undefined") return;
    for (const neighbour of [index + 1, index - 1]) {
      const next = getSrc((neighbour + count) % count);
      if (next) new Image().src = next;
    }
  }, [count, getSrc, index]);

  useEffect(() => {
    closeRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowRight" && count > 1) move(1);
      else if (event.key === "ArrowLeft" && count > 1) move(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [count, move, onClose]);

  const label = translate("photoViewer.counter", { index: index + 1, count });
  const onPointerDown = (event) => { pointer.current = { x: event.clientX, y: event.clientY }; };
  const onPointerUp = (event) => {
    const start = pointer.current;
    pointer.current = null;
    if (!start || count < 2) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) > swipeThreshold && Math.abs(dx) > Math.abs(dy)) move(dx < 0 ? 1 : -1);
  };

  return (
    <div className="photo-lightbox" role="dialog" aria-modal="true" aria-label={label}>
      <div className="photo-lightbox__bar">
        <span className="photo-lightbox__counter">{label}</span>
        <button ref={closeRef} className="photo-lightbox__close" type="button" onClick={onClose}>
          {translate("photoViewer.close")}
        </button>
      </div>
      <div className="photo-lightbox__stage" onPointerDown={onPointerDown} onPointerUp={onPointerUp}
        onPointerCancel={() => { pointer.current = null; }}>
        {src && !failed && (
          <img key={src} className={loaded ? "photo-lightbox__image is-loaded" : "photo-lightbox__image"} src={src} alt={alt}
            decoding="async" draggable={false} onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />
        )}
        {!loaded && !failed && <span className="photo-lightbox__spinner" role="status" aria-label={translate("photoViewer.loading")} />}
        {failed && <p className="photo-lightbox__error">{translate("photoViewer.unavailable")}</p>}
        {count > 1 && (
          <>
            <button className="photo-lightbox__arrow is-previous" type="button" aria-label={translate("photoViewer.previous")} onClick={() => move(-1)}>‹</button>
            <button className="photo-lightbox__arrow is-next" type="button" aria-label={translate("photoViewer.next")} onClick={() => move(1)}>›</button>
          </>
        )}
      </div>
      {renderActions && <div className="photo-lightbox__actions">{renderActions(index)}</div>}
      {count > 1 && <p className="photo-lightbox__hint">{translate("photoViewer.swipeHint")}</p>}
    </div>
  );
}
