import { useEffect, useRef, useState } from "react";
import { appVersion } from "../../appVersion.js";
import { useTranslation } from "../../i18n/translations.js";
import { submitFeedback } from "./feedbackService.js";

const messageLimit = 3000;

export function FeedbackPanel({ screen }) {
  const { translate } = useTranslation();
  const triggerRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [type, setType] = useState("suggestion");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("idle");
  const [validationError, setValidationError] = useState("");

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function closeOnEscape(event) {
      if (event.key === "Escape" && status !== "submitting") {
        setIsOpen(false);
        window.requestAnimationFrame(() => triggerRef.current?.focus());
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isOpen, status]);

  function openPanel() {
    setType("suggestion");
    setMessage("");
    setStatus("idle");
    setValidationError("");
    setIsOpen(true);
  }

  function closePanel() {
    if (status === "submitting") {
      return;
    }

    setIsOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const normalizedMessage = message.trim();

    if (!normalizedMessage) {
      setValidationError(translate("feedback.messageRequired"));
      return;
    }

    if (normalizedMessage.length > messageLimit) {
      setValidationError(
        translate("feedback.messageTooLong", { count: messageLimit }),
      );
      return;
    }

    setStatus("submitting");
    setValidationError("");

    try {
      await submitFeedback({
        type,
        message: normalizedMessage,
        appVersion,
        screen,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
        },
      });
      setStatus("success");
      setMessage("");
    } catch {
      setStatus("error");
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        className="feedback-trigger"
        type="button"
        onClick={openPanel}
      >
        <span aria-hidden="true">💬</span>
        <span>{translate("feedback.action")}</span>
      </button>

      {isOpen && (
        <div
          className="feedback-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closePanel();
            }
          }}
        >
          <section
            className="feedback-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-title"
          >
            <div className="feedback-dialog__header">
              <div>
                <h2 id="feedback-title">{translate("feedback.title")}</h2>
                <p>{translate("feedback.intro")}</p>
              </div>
              <button
                className="feedback-close"
                type="button"
                aria-label={translate("feedback.close")}
                disabled={status === "submitting"}
                onClick={closePanel}
              >
                ×
              </button>
            </div>

            {status === "success" ? (
              <div className="feedback-result" role="status">
                <strong>{translate("feedback.successTitle")}</strong>
                <p>{translate("feedback.successMessage")}</p>
                <button className="button button--primary" type="button" onClick={closePanel}>
                  {translate("feedback.close")}
                </button>
              </div>
            ) : (
              <form className="feedback-form" onSubmit={handleSubmit}>
                <label>
                  {translate("feedback.type")}
                  <select
                    value={type}
                    disabled={status === "submitting"}
                    onChange={(event) => setType(event.target.value)}
                  >
                    <option value="suggestion">{translate("feedback.typeSuggestion")}</option>
                    <option value="bug">{translate("feedback.typeBug")}</option>
                    <option value="other">{translate("feedback.typeOther")}</option>
                  </select>
                </label>

                <label>
                  {translate("feedback.message")}
                  <textarea
                    autoFocus
                    rows="6"
                    maxLength={messageLimit}
                    value={message}
                    disabled={status === "submitting"}
                    placeholder={translate("feedback.messagePlaceholder")}
                    onChange={(event) => {
                      setMessage(event.target.value);
                      setValidationError("");
                      if (status === "error") setStatus("idle");
                    }}
                  />
                </label>

                {validationError && (
                  <p className="form-error" role="alert">{validationError}</p>
                )}
                {status === "error" && (
                  <p className="form-error" role="alert">{translate("feedback.failure")}</p>
                )}

                <div className="button-row">
                  <button
                    className="button"
                    type="button"
                    disabled={status === "submitting"}
                    onClick={closePanel}
                  >
                    {translate("common.cancel")}
                  </button>
                  <button
                    className="button button--primary"
                    type="submit"
                    disabled={status === "submitting"}
                  >
                    {status === "submitting"
                      ? translate("feedback.submitting")
                      : translate("feedback.submit")}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}
    </>
  );
}
