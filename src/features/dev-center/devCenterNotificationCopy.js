const messages = {
  "viewer": ["Conta autenticada", "Signed-in account", "Cuenta autenticada"],
  "current": ["Esta instalação", "This installation", "Esta instalación"],
  "displayMode": ["Modo de abertura", "Launch mode", "Modo de apertura"],
  "standalone": ["App instalado", "Installed app", "App instalada"],
  "tab": ["Aba do navegador", "Browser tab", "Pestaña del navegador"],
  "browser": ["Navegador", "Browser", "Navegador"],
  "workerMissing": ["Worker ausente", "Worker missing", "Worker ausente"],
  "workerMismatch": ["Worker incorreto", "Worker mismatch", "Worker incorrecto"],
  "eligible": ["Elegível pelo servidor", "Server eligible", "Elegible por el servidor"],
  "ineligible": ["Inelegível pelo servidor", "Server ineligible", "No elegible por el servidor"],
  "eligibilityUnknown": ["Elegibilidade desconhecida", "Eligibility unknown", "Elegibilidad desconocida"],
  "registrationState": ["Estado da inscrição", "Registration state", "Estado del registro"],
  "active": ["Ativa", "Active", "Activo"],
  "invalidated": ["Invalidada", "Invalidated", "Invalidado"],
  "signed-out": ["Sessão encerrada", "Signed out", "Sesión cerrada"],
  "superseded": ["Substituída", "Superseded", "Reemplazado"],
  "legacy": ["Inscrição antiga", "Legacy registration", "Registro anterior"],
  "unknown": ["Desconhecido", "Unknown", "Desconocido"],
  "lastTest": ["Último teste registrado nesta instalação", "Latest recorded test for this installation", "Última prueba registrada en esta instalación"],
  "noTest": ["Sem teste para esta instalação na amostra.", "No test for this installation in this sample.", "Sin prueba para esta instalación en esta muestra."],
  "boundedHistory": ["Amostra limitada. A ausência de registro não comprova que não houve tentativa. Os avisos normais da gerente têm resultados agregados.", "Bounded sample. A missing record does not rule out an attempt. Normal manager notifications have aggregate outcomes.", "Muestra limitada. La ausencia de registro no descarta un intento. Los avisos normales de la gerente tienen resultados agregados."],
  "latestInbox": ["Último aviso da sua Caixa de entrada", "Latest notification in your Inbox", "Último aviso de tu bandeja de entrada"],
  "inboxEmpty": ["Nenhum aviso na Caixa de entrada.", "Your Inbox has no notifications.", "Tu bandeja de entrada no tiene avisos."],
  "inboxUnavailable": ["Não foi possível verificar a Caixa de entrada.", "Could not verify your Inbox.", "No se pudo verificar tu bandeja de entrada."],
  "unknownOutcomes": ["Resultado desconhecido", "Unknown outcome", "Resultado desconocido"],
};

export function diagnosticCopy(language, key) {
  return messages[key]?.[{ pt: 0, en: 1, es: 2 }[language] ?? 1] || messages.unknown[1];
}
