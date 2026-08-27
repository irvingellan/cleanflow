import { useEffect, useRef, useState } from "react";
import { appVersion } from "../../appVersion.js";
import { useTranslation } from "../../i18n/translations.js";
import { releaseNotes } from "./releaseNotes.js";

const lastSeenReleaseStorageKey = "cleanflow-last-seen-release";

function getLastSeenRelease() {
  if (typeof window === "undefined") return "";

  return window.localStorage.getItem(lastSeenReleaseStorageKey) || "";
}

export function WhatsNewPanel() {
  const { language, translate } = useTranslation();
  const triggerRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [lastSeenRelease, setLastSeenRelease] = useState(getLastSeenRelease);
  const currentRelease = releaseNotes.find((release) => release.version === appVersion);
  const hasUnseenRelease = Boolean(currentRelease && currentRelease.version !== lastSeenRelease);

  useEffect(() => {
    if (!isOpen) return undefined;

    function closeOnEscape(event) {
      if (event.key === "Escape") {
        setIsOpen(false);
        window.requestAnimationFrame(() => triggerRef.current?.focus());
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isOpen]);

  function openPanel() {
    setIsOpen(true);

    if (currentRelease) {
      // Seen state is deliberately local: release notes must not add user-profile data.
      window.localStorage.setItem(lastSeenReleaseStorageKey, currentRelease.version);
      setLastSeenRelease(currentRelease.version);
    }
  }

  function closePanel() {
    setIsOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  return (
    <>
      <button
        ref={triggerRef}
        className="whats-new-trigger"
        type="button"
        aria-label={hasUnseenRelease
          ? `${translate("releases.action")} — ${translate("releases.unseen")}`
          : translate("releases.action")}
        onClick={openPanel}
      >
        <span aria-hidden="true">✨</span>
        <span>{translate("releases.action")}</span>
        {hasUnseenRelease && (
          <span className="whats-new-trigger__indicator" aria-hidden="true" />
        )}
      </button>

      {isOpen && (
        <div
          className="whats-new-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closePanel();
          }}
        >
          <section className="whats-new-dialog" role="dialog" aria-modal="true" aria-labelledby="whats-new-title">
            <div className="whats-new-dialog__header">
              <div>
                <p className="eyebrow">{translate("releases.currentVersion", { version: appVersion })}</p>
                <h2 id="whats-new-title">{translate("releases.title")}</h2>
                <p>{translate("releases.intro")}</p>
              </div>
              <button className="whats-new-close" type="button" aria-label={translate("releases.close")} onClick={closePanel}>
                ×
              </button>
            </div>

            <div className="release-notes-list">
              {releaseNotes.map((release) => (
                <article key={release.version} className="release-note-card">
                  <h3>{release.version} · {release.title[language] || release.title.en}</h3>
                  <ul>
                    {release.changes.map((change) => (
                      <li key={change.text.en}>
                        <span aria-hidden="true">{change.icon}</span>
                        <span>{change.text[language] || change.text.en}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
