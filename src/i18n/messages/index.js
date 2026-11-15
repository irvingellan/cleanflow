import core from "./01-core.js";
import checklistsGallery from "./02-checklists-gallery.js";
import checklistsEvidence from "./03-checklists-evidence.js";
import checklistPreview from "./04-checklist-preview.js";
import checklistPreviewCleaner from "./05-checklist-preview-cleaner.js";
import common from "./06-common.js";
import checklistsNotes from "./07-checklists-notes.js";

// Order matters: a later part may override a key from an earlier one.
const parts = [core, checklistsGallery, checklistsEvidence, checklistPreview, checklistPreviewCleaner, common, checklistsNotes];

export const messages = { en: {}, pt: {}, es: {} };
for (const part of parts) {
  for (const language of ["en", "pt", "es"]) Object.assign(messages[language], part[language]);
}
