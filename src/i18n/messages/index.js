import core from "./01-core.js";
import checklistsGallery from "./02-checklists-gallery.js";
import checklistsEvidence from "./03-checklists-evidence.js";
import checklistPreview from "./04-checklist-preview.js";
import checklistPreviewCleaner from "./05-checklist-preview-cleaner.js";
import common from "./06-common.js";
import checklistsNotes from "./07-checklists-notes.js";
import jobsFinancial from "./08-jobs-financial.js";
import jobsEdit from "./09-jobs-edit.js";
import publicOffer from "./10-public-offer.js";
import jobsNewService from "./11-jobs-new-service.js";
import jobsAssignment from "./12-jobs-assignment.js";
import devCenter from "./13-dev-center.js";
import notifications from "./14-notifications.js";
import weeklyClose from "./15-weekly-close.js";
import lifecycle from "./16-lifecycle.js";
import checklistsDraft from "./17-checklists-draft.js";
import shell from "./18-shell.js";
import home from "./19-home.js";

// Order matters: a later part may override a key from an earlier one.
const parts = [core, checklistsGallery, checklistsEvidence, checklistPreview, checklistPreviewCleaner, common, checklistsNotes, jobsFinancial, jobsEdit, publicOffer, jobsNewService, jobsAssignment, devCenter, notifications, weeklyClose, lifecycle, checklistsDraft, shell, home];

export const messages = { en: {}, pt: {}, es: {} };
for (const part of parts) {
  for (const language of ["en", "pt", "es"]) Object.assign(messages[language], part[language]);
}
