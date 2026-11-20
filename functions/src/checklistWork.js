import { pilotChecklistPhotoRequirementId } from "./checklistEvidenceDefinition.js";

/** A saved draft revision, photo state revision, saved photo or legacy alias freezes the Run. */
export async function checklistWorkStarted(transaction, runRef, run) {
  if (run && run.status !== "DRAFT") return true;
  const [draft, evidence, legacyPhoto] = await Promise.all([
    transaction.get(runRef.collection("drafts").doc("current")),
    transaction.get(runRef.collection("evidenceState").doc("current")),
    transaction.get(runRef.collection("evidence").doc(pilotChecklistPhotoRequirementId)),
  ]);
  return (draft.data()?.revision ?? 0) > 0 || (evidence.data()?.revision ?? 0) > 0
    || evidence.data()?.photos?.length > 0 || legacyPhoto.exists;
}
