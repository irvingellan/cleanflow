import { useCallback, useState } from "react";
import { AccessPhotoPreview } from "../../components/AccessPhotoPreview.jsx";
import { PhotoLightbox } from "../../components/PhotoLightbox.jsx";
import { translateInLanguage } from "../../i18n/translations.js";

export function JobAccessPhotos({ t, jobId, photos, load }) {
  const [viewer, setViewer] = useState(null);
  const loadPhoto = useCallback((photoId) => load(jobId, photoId), [jobId, load]);
  const translate = (key, params) => translateInLanguage(t.lang || t.locale?.slice(0, 2), key, params);

  function close() {
    viewer.trigger.focus();
    setViewer(null);
  }

  return <div className="hb-access-photos">
    <h4>{t("hb.access.photos")}</h4>
    <div className="access-photo-grid">
      {photos.map((photo) => <AccessPhotoPreview key={photo.id} photo={photo} loadPhoto={loadPhoto}
        translate={translate} onOpen={(src, label, trigger) => setViewer({ src, label, trigger })} />)}
    </div>
    {viewer && <PhotoLightbox count={1} index={0} getSrc={() => viewer.src} onClose={close}
      translate={translate} alt={viewer.label}
      renderActions={() => <span className="photo-lightbox__caption">{viewer.label}</span>} />}
  </div>;
}
