import { useEffect, useRef, useState } from "react";
import "./AccessPhotoPreview.css";

export function AccessPhotoPreview({ photo, loadPhoto, translate, onOpen }) {
  const container = useRef(null);
  const [visible, setVisible] = useState(false);
  const [preview, setPreview] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (typeof IntersectionObserver !== "function") {
      setVisible(true);
      return undefined;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return undefined;
    let current = true;
    loadPhoto(photo.id).then((result) => {
      if (!current) return;
      setPreview(result?.contentType === "image/jpeg" && result.dataBase64
        ? `data:image/jpeg;base64,${result.dataBase64}` : false);
    }).catch(() => { if (current) setPreview(false); });
    return () => { current = false; };
  }, [visible, photo.id, loadPhoto, attempt]);

  const label = photo.caption || translate("accessPhoto.label");
  const thumbnail = preview && <img className="access-photo__image" src={preview} alt={label} decoding="async" onError={() => setPreview(false)} />;
  return <figure ref={container} className="access-photo">
    {thumbnail && (onOpen
      ? <button type="button" className="access-photo__open" onClick={(event) => onOpen(preview, label, event.currentTarget)}>{thumbnail}</button>
      : thumbnail)}
    {preview === null && <span className="access-photo__placeholder" role="status">{translate("photoViewer.loading")}</span>}
    {preview === false && <button type="button" className="access-photo__placeholder" onClick={() => {
      setPreview(null);
      setAttempt((value) => value + 1);
    }}>{translate("accessPhoto.retry")}</button>}
    {photo.caption && <figcaption>{photo.caption}</figcaption>}
  </figure>;
}
