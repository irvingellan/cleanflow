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
  "you": ["você", "you", "tú"],
  "thisBrowser": ["este navegador", "this browser", "este navegador"],
  "installedApp": ["app instalado", "installed app", "app instalada"],
  "oldDevices": ["Aparelhos antigos ou desativados ({count})", "Old or inactive devices ({count})", "Dispositivos antiguos o inactivos ({count})"],
  // Cleaner push: plain language for the server codes.
  "cleaner.NEW_OFFER": ["Nova oferta", "New offer", "Nueva oferta"],
  "cleaner.ASSIGNED": ["Serviço atribuído", "Service assigned", "Servicio asignado"],
  "cleaner.UNASSIGNED": ["Removida do serviço", "Removed from service", "Retirada del servicio"],
  "cleaner.CANCELLED": ["Serviço cancelado", "Service cancelled", "Servicio cancelado"],
  "cleaner.RESCHEDULED": ["Serviço remarcado", "Service rescheduled", "Servicio reprogramado"],
  "cleaner.PILOT_TEST": ["Teste da cleaner", "Cleaner test", "Prueba de la cleaner"],
  "cleaner.FCM_ACCEPTED": ["Enviado ao celular", "Sent to the phone", "Enviado al celular"],
  "cleaner.PARTIAL": ["Enviado a parte dos aparelhos", "Sent to some devices", "Enviado a algunos dispositivos"],
  "cleaner.FAILED": ["Falhou", "Failed", "Falló"],
  "cleaner.RECIPIENT_INELIGIBLE": ["Não enviado: a cleaner não tem acesso ativo ao app. O aviso ficou só registrado.", "Not sent: the cleaner has no active app access. The notice was only recorded.", "No enviado: la cleaner no tiene acceso activo a la app. El aviso solo quedó registrado."],
  "cleaner.NO_ACTIVE_DEVICES": ["Não enviado: a cleaner não ativou avisos no celular. Ficou na caixa de entrada do app.", "Not sent: the cleaner has not turned on phone notices. It stayed in the app inbox.", "No enviado: la cleaner no activó avisos en el celular. Quedó en la bandeja de la app."],
  "cleaner.STALE_EVENT": ["Não enviado: o serviço mudou antes do envio.", "Not sent: the service changed before sending.", "No enviado: el servicio cambió antes del envío."],
  "cleaner.PENDING": ["Na fila", "Queued", "En cola"],
  "cleaner.SENDING": ["Enviando", "Sending", "Enviando"],
};

/** Plain-language label for a cleaner push code; unknown codes stay visible as-is. */
export function cleanerPushCopy(language, code) {
  const entry = messages[`cleaner.${code}`];
  return entry ? entry[{ pt: 0, en: 1, es: 2 }[language] ?? 1] : code;
}

export function diagnosticCopy(language, key) {
  return messages[key]?.[{ pt: 0, en: 1, es: 2 }[language] ?? 1] || messages.unknown[1];
}
