import {
  supportedCleanerTeamTypes,
  supportedPaymentMethods,
} from "./cleanerService.js";

export const supportedCleanerLanguages = ["en", "pt", "es"];
export const cleanerProfileLimits = {
  cityOrRegion: 120,
  internalNotes: 1000,
  paymentContact: 160,
};

export function normalizeCleanerPreferredLanguage(language) {
  return supportedCleanerLanguages.includes(language) ? language : "en";
}

function formPreferredLanguage(language) {
  return supportedCleanerLanguages.includes(language) ? language : "";
}

function normalizedCleanerText(value) {
  return value === undefined || value === null ? "" : String(value);
}

function normalizedCleanerProfileOption(value, supportedValues) {
  return supportedValues.includes(value) ? value : "";
}

export function normalizeCleanerPhone(phone) {
  return phone.trim().replace(/[\s()-]/g, "");
}

export function createEmptyCleanerForm() {
  return {
    name: "",
    phone: "",
    preferredLanguage: "",
    active: true,
    cityOrRegion: "",
    teamType: "",
    internalNotes: "",
    preferredPaymentMethod: "",
    paymentContact: "",
  };
}

/** Legacy Cleaner documents may omit operational profile fields; forms normalize them safely. */
export function cleanerToForm(cleaner) {
  if (!cleaner) {
    return createEmptyCleanerForm();
  }

  return {
    name: normalizedCleanerText(cleaner.name),
    phone: normalizedCleanerText(cleaner.phone),
    preferredLanguage: formPreferredLanguage(cleaner.preferredLanguage),
    active: typeof cleaner.active === "boolean" ? cleaner.active : true,
    cityOrRegion: normalizedCleanerText(cleaner.cityOrRegion),
    teamType: normalizedCleanerProfileOption(
      cleaner.teamType,
      supportedCleanerTeamTypes,
    ),
    internalNotes: normalizedCleanerText(cleaner.internalNotes),
    preferredPaymentMethod: normalizedCleanerProfileOption(
      cleaner.preferredPaymentMethod,
      supportedPaymentMethods,
    ),
    paymentContact: normalizedCleanerText(cleaner.paymentContact),
  };
}
