import { useEffect, useState } from "react";
import { content } from "../../app/content.js";
import { LanguageSelector } from "../../components/LanguageSelector.jsx";
import {
  DetailItem,
  StateCard,
} from "../../components/UiPrimitives.jsx";
import { PublicOfferAssignmentAcknowledgment } from "./PublicOfferAssignmentAcknowledgment.jsx";
import { PublicOfferCompensation } from "./PublicOfferCompensation.jsx";
import { FIRST_ACCEPT_WINS } from "../jobs/automaticOffers.js";
import {
  acknowledgePublicOfferAssignment,
  getPublicOffer,
  respondToPublicOffer,
} from "./publicOfferService.js";
import { usePublicTranslation } from "../../i18n/translations.js";
import {
  formatDate,
  formatStatus,
} from "../../lib/presentation.js";

export function PublicOfferPage({ token }) {
  const [offer, setOffer] = useState(null);
  const [offerLoadAttempt, setOfferLoadAttempt] = useState(0);
  const { language, setLanguage, translate } = usePublicTranslation(offer?.preferredLanguage);
  const [loadError, setLoadError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isResponding, setIsResponding] = useState(false);
  const [responseError, setResponseError] = useState(null);
  const requiresHub = offer?.offerDistributionMode === FIRST_ACCEPT_WINS;

  function handleResponseError(error) {
    if (["offer_not_found", "offer_expired", "offer_unavailable", "offer_already_taken"].includes(error.code)) {
      setLoadError(error.code);
    } else if (error.code === "offer_hub_required") {
      setOffer((current) => ({ ...current, offerDistributionMode: FIRST_ACCEPT_WINS }));
    } else {
      setResponseError(error.code || "request_failed");
    }
  }

  useEffect(() => {
    let isCurrent = true;

    async function loadOffer() {
      if (!token) {
        if (isCurrent) {
          setLoadError("offer_not_found");
          setIsLoading(false);
        }
        return;
      }

      setIsLoading(true);
      setLoadError(null);

      try {
        const loadedOffer = await getPublicOffer(token);

        if (isCurrent) {
          setOffer(loadedOffer);
        }
      } catch (error) {
        if (isCurrent) {
          setLoadError(error.code || "request_failed");
        }
      } finally {
        if (isCurrent) {
          setIsLoading(false);
        }
      }
    }

    loadOffer();

    return () => {
      isCurrent = false;
    };
  }, [token, offerLoadAttempt]);

  async function submitResponse(status) {
    setIsResponding(true);
    setResponseError(null);

    try {
      const result = await respondToPublicOffer({ token, status });
      setOffer((currentOffer) => ({ ...currentOffer, status: result.status }));
    } catch (error) {
      handleResponseError(error);
    } finally {
      setIsResponding(false);
    }
  }

  async function acknowledgeAssignment() {
    setIsResponding(true);
    setResponseError(null);

    try {
      const result = await acknowledgePublicOfferAssignment({ token });
      setOffer((currentOffer) => ({
        ...currentOffer,
        assignmentAcknowledgment: result.assignmentAcknowledgment,
      }));
    } catch (error) {
      handleResponseError(error);
    } finally {
      setIsResponding(false);
    }
  }

  const errorMessage = {
    offer_not_found: "publicOffer.notFound",
    offer_expired: "publicOffer.expired",
    offer_unavailable: "publicOffer.unavailable",
    offer_already_taken: "publicOffer.alreadyTaken",
  }[loadError] || "publicOffer.loadError";
  const hasAnswered = offer && offer.status !== "PENDING";

  return (
    <main className="app-shell public-offer-shell">
      <section className="foundation public-offer-foundation" aria-labelledby="public-offer-page-title">
        <header className="public-offer-header">
          <div>
            <p className="eyebrow">{translate("brand.operationsPlatform")}</p>
            <h1 id="public-offer-page-title">{content.productName}</h1>
          </div>
          <LanguageSelector language={language} onChange={setLanguage} translate={translate} />
        </header>

        {isLoading && <StateCard message={translate("publicOffer.loading")} status="status" />}

        {!isLoading && loadError && (
          <>
            <StateCard message={translate(errorMessage)} status="alert" isError />
            {loadError === "request_failed" && (
              <button className="button" type="button" onClick={() => setOfferLoadAttempt((attempt) => attempt + 1)}>
                {translate("common.retry")}
              </button>
            )}
          </>
        )}

        {!isLoading && !loadError && offer && (
          <section className="panel public-offer-panel" aria-labelledby="public-offer-title">
            <p className="eyebrow">{translate("publicOffer.eyebrow")}</p>
            <h2 id="public-offer-title" className="panel__title">
              {translate("publicOffer.title")}
            </h2>

            {!requiresHub && (
              <dl className="detail-list">
                <DetailItem
                  label={translate("common.property")}
                  value={offer.propertyName || translate("properties.unnamed")}
                />
                <DetailItem
                  label={translate("publicOffer.serviceDate")}
                  value={formatDate(offer.scheduledDate, translate, language)}
                />
                {offer.scheduledStart && (
                  <DetailItem label={translate("publicOffer.startTime")} value={offer.scheduledStart} />
                )}
                <PublicOfferCompensation
                  offeredPay={offer.offeredPay}
                  offeredFirstSlotExtraCents={offer.offeredFirstSlotExtraCents}
                  offeredPayEstimated={offer.offeredPayEstimated}
                  recipientTranslation={{ language, translate }}
                  amount={offer.offeredCompensation}
                />
                <DetailItem
                  label={translate("publicOffer.status")}
                  value={formatStatus(offer.status, translate)}
                />
                {offer.assignmentAcknowledgment && (
                  <DetailItem
                    label={translate("publicOffer.assignment")}
                    value={translate(offer.assignmentAcknowledgment === "CONFIRMED"
                      ? "publicOffer.assignmentAcknowledgedShort"
                      : "publicOffer.assignmentAwaitingShort")}
                  />
                )}
              </dl>
            )}

            {responseError && (
              <p className="form-error" role="alert">
                {translate("publicOffer.responseError")}
              </p>
            )}

            {requiresHub ? (
              <>
                <p className="public-offer-confirmation">{translate("publicOffer.hubRequired")}</p>
                <div className="public-offer-actions">
                  <a className="button button--primary" href="/agenda">{translate("publicOffer.openHub")}</a>
                </div>
              </>
            ) : (
              <PublicOfferAssignmentAcknowledgment
                state={offer.assignmentAcknowledgment}
                isSaving={isResponding}
                onConfirm={acknowledgeAssignment}
              />
            )}

            {!requiresHub && offer.status === "PENDING" && (
              <div className="public-offer-actions" aria-label={translate("publicOffer.status")}>
                <button
                  className="button button--primary"
                  type="button"
                  disabled={isResponding}
                  onClick={() => submitResponse("INTERESTED")}
                >
                  {isResponding ? translate("publicOffer.responding") : translate("cleaner.interested")}
                </button>
                <button
                  className="button"
                  type="button"
                  disabled={isResponding}
                  onClick={() => submitResponse("DECLINED")}
                >
                  {translate("cleaner.notAvailable")}
                </button>
              </div>
            )}

            {!requiresHub && hasAnswered && !offer.assignmentAcknowledgment && (
              <p className="public-offer-confirmation" role="status">
                {offer.status === "INTERESTED"
                  ? translate("publicOffer.interestedConfirmation")
                  : translate("publicOffer.declinedConfirmation")}
              </p>
            )}
          </section>
        )}
      </section>
    </main>
  );
}
