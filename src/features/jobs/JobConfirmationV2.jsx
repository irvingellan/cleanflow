import { ConfirmationSheet, ConsequenceDisclosure } from "../../components/v2/primitives.jsx";
import { useTranslation } from "../../i18n/translations.js";
import { createPortal } from "react-dom";
import { formatDate } from "../../lib/presentation.js";

// Presentation of an existing confirmation contract. No guard, operation or read.
export function JobConfirmationV2({ job, kind, message, error, ...contract }) {
  const { translate, language } = useTranslation();
  // Native dialogs must not inherit a closed disclosure's hidden subtree.
  // Portal is presentation-only; callback/state ownership remains at the source.
  return createPortal(<div className="job-v2-confirmation-host"><ConfirmationSheet {...contract} open title={contract.title}>
    <div className="job-v2-confirmation-context">
      <p><strong>{job.propertyName || translate("properties.unnamed")}</strong></p>
      <p>{formatDate(job.scheduledDate, translate, language)} · {job.scheduledStart || translate("common.notProvided")}</p>
      <p>{message}</p>
      <ConsequenceDisclosure title={translate("jobV2.consequences")}
        will={[translate(`jobV2.confirm.${kind}.will`)]}
        willNot={[translate(`jobV2.confirm.${kind}.willNot`)]} />
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  </ConfirmationSheet></div>, document.body);
}

export function JobConsequencesV2({ kind }) {
  const { translate } = useTranslation();
  return <ConsequenceDisclosure title={translate("jobV2.consequences")}
    will={[translate(`jobV2.confirm.${kind}.will`)]}
    willNot={[translate(`jobV2.confirm.${kind}.willNot`)]} />;
}
