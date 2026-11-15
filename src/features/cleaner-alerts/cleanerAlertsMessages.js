// Manager-facing strings follow the app language; the WhatsApp message to a
// cleaner follows her preferred language. Labels match the Cleaner Hub
// ("Conta", "Ativar avisos neste aparelho") so she finds them.
const messages = {
  pt: {
    open: "Avisos no celular", title: "Avisos no celular das cleaners", back: "Voltar para cleaners",
    intro: "Quem já recebe os avisos do CleanFlow no celular e o que falta para cada uma.",
    summary: "{ready} de {total} cleaners recebem avisos no celular.",
    loading: "Conferindo cada cleaner…", error: "Não foi possível conferir agora. Confira a conexão e tente de novo.",
    refresh: "Conferir de novo", empty: "Nenhuma cleaner ativa.",
    "state.no-app": "Ainda não entrou no app", "state.alerts-off": "Avisos desligados no cadastro",
    "state.no-device": "Falta ativar no celular", "state.ready": "Recebe avisos", "state.unknown": "Não deu para conferir",
    "next.no-app": "Gere um código de acesso no cadastro dela e mande por WhatsApp.",
    "next.alerts-off": "Ligue os avisos aqui. Depois ela ativa no celular.",
    "next.no-device": "Mande o passo a passo para ela ativar no celular.",
    "next.ready": "Tudo certo. {devices} aparelho(s) recebem avisos.",
    "next.unknown": "Abra o cadastro dela ou tente de novo em instantes.",
    openProfile: "Abrir cadastro", turnOn: "Ligar avisos", turningOn: "Ligando…", turnOnFailed: "Não deu para ligar. Tente de novo.",
    sendSteps: "Mandar passo a passo", noPhone: "Cadastre o telefone com código do país para mandar no WhatsApp.",
    privacy: "A mensagem tem só o link da agenda e os passos. Nunca leva códigos de acesso.",
  },
  en: {
    open: "Phone alerts", title: "Cleaners' phone alerts", back: "Back to cleaners",
    intro: "Who already gets CleanFlow alerts on her phone, and what is missing for each one.",
    summary: "{ready} of {total} cleaners get phone alerts.",
    loading: "Checking each cleaner…", error: "Could not check right now. Check the connection and try again.",
    refresh: "Check again", empty: "No active cleaners.",
    "state.no-app": "Has not opened the app", "state.alerts-off": "Alerts off in her profile",
    "state.no-device": "Needs to turn on alerts on her phone", "state.ready": "Gets alerts", "state.unknown": "Could not check",
    "next.no-app": "Create an access code in her profile and send it on WhatsApp.",
    "next.alerts-off": "Turn alerts on here. Then she turns them on on her phone.",
    "next.no-device": "Send her the steps to turn alerts on on her phone.",
    "next.ready": "All set. {devices} device(s) get alerts.",
    "next.unknown": "Open her profile or try again in a moment.",
    openProfile: "Open profile", turnOn: "Turn on alerts", turningOn: "Turning on…", turnOnFailed: "Could not turn on. Try again.",
    sendSteps: "Send the steps", noPhone: "Add a phone with country code to send on WhatsApp.",
    privacy: "The message has only the agenda link and the steps. It never includes access codes.",
  },
  es: {
    open: "Avisos en el celular", title: "Avisos en el celular de las cleaners", back: "Volver a cleaners",
    intro: "Quién ya recibe los avisos de CleanFlow en el celular y qué falta para cada una.",
    summary: "{ready} de {total} cleaners reciben avisos en el celular.",
    loading: "Revisando cada cleaner…", error: "No se pudo revisar ahora. Revisa la conexión e intenta de nuevo.",
    refresh: "Revisar de nuevo", empty: "No hay cleaners activas.",
    "state.no-app": "Aún no entró a la app", "state.alerts-off": "Avisos apagados en su perfil",
    "state.no-device": "Falta activar en el celular", "state.ready": "Recibe avisos", "state.unknown": "No se pudo revisar",
    "next.no-app": "Genera un código de acceso en su perfil y envíalo por WhatsApp.",
    "next.alerts-off": "Activa los avisos aquí. Luego ella los activa en el celular.",
    "next.no-device": "Envíale los pasos para activar en el celular.",
    "next.ready": "Todo listo. {devices} dispositivo(s) reciben avisos.",
    "next.unknown": "Abre su perfil o intenta de nuevo en un momento.",
    openProfile: "Abrir perfil", turnOn: "Activar avisos", turningOn: "Activando…", turnOnFailed: "No se pudo activar. Intenta de nuevo.",
    sendSteps: "Enviar los pasos", noPhone: "Registra el teléfono con código de país para enviar por WhatsApp.",
    privacy: "El mensaje solo tiene el enlace de la agenda y los pasos. Nunca incluye códigos de acceso.",
  },
};

export function alertsText(language, key, replacements = {}) {
  const value = (messages[language] || messages.en)[key] ?? messages.en[key] ?? key;
  return value.replace(/\{(\w+)\}/g, (_, name) => String(replacements[name] ?? ""));
}

const steps = {
  pt: (name, url) => [
    `Olá, ${name}! Para receber os avisos do CleanFlow no celular:`,
    `1. Abra sua agenda: ${url}`,
    "2. No iPhone: toque em Compartilhar › “Adicionar à Tela de Início” e abra sempre pelo ícone CleanFlow.",
    "3. Toque em “Conta”.",
    "4. Toque em “Ativar avisos neste aparelho” e permita as notificações.",
    "Qualquer dúvida, me chame.",
  ],
  en: (name, url) => [
    `Hi ${name}! To get CleanFlow alerts on your phone:`,
    `1. Open your schedule: ${url}`,
    "2. On iPhone: tap Share › “Add to Home Screen” and always open it from the CleanFlow icon.",
    "3. Tap “Account”.",
    "4. Tap “Enable alerts on this device” and allow notifications.",
    "Any questions, just message me.",
  ],
  es: (name, url) => [
    `¡Hola, ${name}! Para recibir los avisos de CleanFlow en el celular:`,
    `1. Abre tu agenda: ${url}`,
    "2. En iPhone: toca Compartir › “Agregar a inicio” y ábrela siempre desde el ícono CleanFlow.",
    "3. Toca “Cuenta”.",
    "4. Toca “Activar avisos en este dispositivo” y permite las notificaciones.",
    "Cualquier duda, escríbeme.",
  ],
};

/** The WhatsApp text for one cleaner, in her language. Never includes codes. */
export function activationSteps(language, name, url) {
  return (steps[language] || steps.en)(name || "", url).join("\n");
}
