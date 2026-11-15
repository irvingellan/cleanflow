import core from "./01-core.js";

// Order matters: a later part may override a key from an earlier one.
const parts = [core];

export const messages = { en: {}, pt: {}, es: {} };
for (const part of parts) {
  for (const language of ["en", "pt", "es"]) Object.assign(messages[language], part[language]);
}
