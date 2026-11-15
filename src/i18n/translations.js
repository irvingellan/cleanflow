import { createContext, createElement, useContext, useEffect, useMemo, useRef, useState } from "react";
import { messages } from "./messages/index.js";

const languageStorageKey = "cleanflow-language";
const TranslationContext = createContext(null);

export const languageOptions = [
  { code: "en", label: "English" },
  { code: "pt", label: "Português" },
  { code: "es", label: "Español" },
];

const supportedLanguages = new Set(languageOptions.map(({ code }) => code));

export function normalizeTranslationLanguage(language) {
  return supportedLanguages.has(language) ? language : "en";
}

export { messages };

export function translateInLanguage(language, key, replacements = {}) {
  const safeLanguage = normalizeTranslationLanguage(language);
  const message = messages[safeLanguage][key] || messages.en[key] || key;
  return Object.entries(replacements).reduce(
    (result, [replacementKey, replacementValue]) => result.replaceAll(`{${replacementKey}}`, String(replacementValue)),
    message,
  );
}

/** Public cleaner pages keep their locale local to the page, not the manager's saved UI preference. */
export function usePublicTranslation(preferredLanguage) {
  const [selectedLanguage, setSelectedLanguage] = useState(null);
  const userSelectedLanguageRef = useRef(false);
  const language = userSelectedLanguageRef.current && selectedLanguage
    ? selectedLanguage
    : normalizeTranslationLanguage(preferredLanguage);

  const setLanguage = (nextLanguage) => {
    userSelectedLanguageRef.current = true;
    setSelectedLanguage(normalizeTranslationLanguage(nextLanguage));
  };
  const translate = useMemo(
    () => (key, replacements = {}) => translateInLanguage(language, key, replacements),
    [language],
  );

  return { language, setLanguage, translate };
}

function getInitialLanguage() {
  if (typeof window === "undefined") return "en";

  try {
    const savedLanguage = window.localStorage.getItem(languageStorageKey);
    return Object.hasOwn(messages, savedLanguage) ? savedLanguage : "en";
  } catch {
    return "en";
  }
}

export function TranslationProvider({ children }) {
  const [language, setLanguage] = useState(getInitialLanguage);

  useEffect(() => {
    try {
      window.localStorage.setItem(languageStorageKey, language);
    } catch {
      // A preference can stay in memory when this browser denies persistence.
    }
  }, [language]);

  const value = useMemo(() => {
    const translate = (key, replacements = {}) => translateInLanguage(language, key, replacements);

    return { language, setLanguage, translate };
  }, [language]);

  return createElement(TranslationContext.Provider, { value }, children);
}

export function useTranslation() {
  const translation = useContext(TranslationContext);
  if (!translation) throw new Error("useTranslation must be used within TranslationProvider");
  return translation;
}
