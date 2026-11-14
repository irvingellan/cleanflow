const messages = {
  en: {
    title: "System status", subtitle: "What is live right now and how fast the checklist Functions answer.",
    version: "Live version", environment: "Environment", openCommit: "Open commit", loading: "Reading version…",
    versionError: "Could not read version.json.", flags: "Features in this build",
    automaticOffers: "Automatic approval", cleanerPush: "Cleaner push", inbox: "Notification inbox", on: "On", off: "Off",
    measure: "Measure Functions", measuring: "Measuring…", measureHint: "Calls each Function with a warm-up request. It reads and changes nothing.",
    warm: "Awake", cold: "Was asleep", failed: "Failed", links: "Shortcuts",
    functionsConsole: "Firebase Functions", firestoreConsole: "Firestore", hostingConsole: "Hosting", pulls: "Pull requests", actions: "GitHub Actions",
  },
  pt: {
    title: "Estado do sistema", subtitle: "O que está no ar agora e quanto as funções do checklist demoram para responder.",
    version: "Versão no ar", environment: "Ambiente", openCommit: "Abrir commit", loading: "Lendo a versão…",
    versionError: "Não foi possível ler o version.json.", flags: "Recursos desta versão",
    automaticOffers: "Aprovação automática", cleanerPush: "Push das cleaners", inbox: "Caixa de entrada", on: "Ligado", off: "Desligado",
    measure: "Medir funções", measuring: "Medindo…", measureHint: "Chama cada função com um pedido de “bom dia”. Não lê nem altera nada.",
    warm: "Acordada", cold: "Estava dormindo", failed: "Falhou", links: "Atalhos",
    functionsConsole: "Funções no Firebase", firestoreConsole: "Firestore", hostingConsole: "Hosting", pulls: "Pull requests", actions: "GitHub Actions",
  },
  es: {
    title: "Estado del sistema", subtitle: "Qué está publicado ahora y cuánto tardan en responder las funciones del checklist.",
    version: "Versión publicada", environment: "Entorno", openCommit: "Abrir commit", loading: "Leyendo la versión…",
    versionError: "No se pudo leer version.json.", flags: "Funciones de esta versión",
    automaticOffers: "Aprobación automática", cleanerPush: "Push de cleaners", inbox: "Bandeja de avisos", on: "Activo", off: "Inactivo",
    measure: "Medir funciones", measuring: "Midiendo…", measureHint: "Llama a cada función con una solicitud de calentamiento. No lee ni cambia nada.",
    warm: "Despierta", cold: "Estaba dormida", failed: "Falló", links: "Accesos",
    functionsConsole: "Funciones en Firebase", firestoreConsole: "Firestore", hostingConsole: "Hosting", pulls: "Pull requests", actions: "GitHub Actions",
  },
};

export function statusText(language, key) {
  return (messages[language] || messages.en)[key] ?? messages.en[key] ?? key;
}
