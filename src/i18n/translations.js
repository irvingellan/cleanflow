import { useEffect, useState } from "react";

const languageStorageKey = "cleanflow-language";

export const languageOptions = [
  { code: "en", label: "English" },
  { code: "pt", label: "Português" },
  { code: "es", label: "Español" },
];

const messages = {
  en: {
    "navigation.dashboard": "Dashboard",
    "navigation.properties": "Properties",
    "navigation.jobs": "Jobs",
    "dashboard.title": "Operations dashboard",
    "dashboard.subtitle": "Today's cleaning operation at a glance.",
    "dashboard.refresh": "Refresh dashboard",
    "dashboard.needsAttention": "Needs attention",
    "dashboard.recentlyCompleted": "Recently completed",
  },
  pt: {
    "navigation.dashboard": "Painel",
    "navigation.properties": "Propriedades",
    "navigation.jobs": "Serviços",
    "dashboard.title": "Painel de operações",
    "dashboard.subtitle": "Visão geral das operações de limpeza de hoje.",
    "dashboard.refresh": "Atualizar painel",
    "dashboard.needsAttention": "Precisa de atenção",
    "dashboard.recentlyCompleted": "Concluídos recentemente",
  },
  es: {
    "navigation.dashboard": "Panel",
    "navigation.properties": "Propiedades",
    "navigation.jobs": "Servicios",
    "dashboard.title": "Panel de operaciones",
    "dashboard.subtitle": "Resumen de las operaciones de limpieza de hoy.",
    "dashboard.refresh": "Actualizar panel",
    "dashboard.needsAttention": "Requiere atención",
    "dashboard.recentlyCompleted": "Completados recientemente",
  },
};

function getInitialLanguage() {
  if (typeof window === "undefined") {
    return "en";
  }

  const savedLanguage = window.localStorage.getItem(languageStorageKey);
  return messages[savedLanguage] ? savedLanguage : "en";
}

export function useTranslation() {
  const [language, setLanguage] = useState(getInitialLanguage);

  useEffect(() => {
    window.localStorage.setItem(languageStorageKey, language);
  }, [language]);

  function translate(key) {
    return messages[language][key] || messages.en[key] || key;
  }

  return { language, setLanguage, translate };
}
