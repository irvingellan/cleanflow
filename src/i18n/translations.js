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

Object.assign(messages.en, {
  "notifications.currentDeviceTest": "Enable & test notifications",
  "notifications.currentDeviceTesting": "Testing this device…",
  "notifications.currentDevicePermissionBlocked": "Notifications are blocked on this device. Update browser/app and device settings, then check again.",
  "notifications.currentDevicePermissionDefault": "Notification permission was not granted. Tap Enable & test notifications to try again.",
  "notifications.currentDeviceUnsupported": "FCM notifications are not supported here. On iPhone/iPad, open the installed Home Screen app and try again.",
  "notifications.currentDeviceRegistrationFailed": "This device could not register for FCM. Check your connection and try again.",
  "notifications.currentDeviceRejected": "FCM rejected this device registration. Try again later.",
  "notifications.currentDeviceAccepted": "FCM accepted the test. Check whether the notification appeared on this device.",
  "notifications.currentDeviceUnknown": "The FCM result is unknown. The test may still arrive; do not retry immediately.",
  "notifications.currentDeviceCooldown": "Please wait before testing this device again.",
  "notifications.currentDeviceUnauthorized": "Active manager access is required to test notifications. Sign in again or contact your administrator.",
});

Object.assign(messages.pt, {
  "notifications.currentDeviceTest": "Ativar e testar notificações",
  "notifications.currentDeviceTesting": "Testando este dispositivo…",
  "notifications.currentDevicePermissionBlocked": "As notificações estão bloqueadas neste dispositivo. Ajuste as configurações do navegador/app e do dispositivo e verifique novamente.",
  "notifications.currentDevicePermissionDefault": "A permissão de notificações não foi concedida. Toque em Ativar e testar notificações para tentar novamente.",
  "notifications.currentDeviceUnsupported": "As notificações FCM não são compatíveis aqui. No iPhone/iPad, abra o app instalado na Tela de Início e tente novamente.",
  "notifications.currentDeviceRegistrationFailed": "Não foi possível registrar este dispositivo no FCM. Confira a conexão e tente novamente.",
  "notifications.currentDeviceRejected": "O FCM rejeitou o registro deste dispositivo. Tente novamente mais tarde.",
  "notifications.currentDeviceAccepted": "O FCM aceitou o teste. Verifique se a notificação apareceu neste dispositivo.",
  "notifications.currentDeviceUnknown": "O resultado do FCM é desconhecido. O teste ainda pode chegar; não tente novamente imediatamente.",
  "notifications.currentDeviceCooldown": "Aguarde antes de testar este dispositivo novamente.",
  "notifications.currentDeviceUnauthorized": "É necessário acesso de gerente ativo para testar notificações. Entre novamente ou contate o administrador.",
});

Object.assign(messages.es, {
  "notifications.currentDeviceTest": "Activar y probar notificaciones",
  "notifications.currentDeviceTesting": "Probando este dispositivo…",
  "notifications.currentDevicePermissionBlocked": "Las notificaciones están bloqueadas en este dispositivo. Ajusta la configuración del navegador/app y del dispositivo y comprueba de nuevo.",
  "notifications.currentDevicePermissionDefault": "No se concedió el permiso de notificaciones. Toca Activar y probar notificaciones para intentarlo de nuevo.",
  "notifications.currentDeviceUnsupported": "Las notificaciones FCM no son compatibles aquí. En iPhone/iPad, abre la app instalada en la pantalla de inicio e inténtalo de nuevo.",
  "notifications.currentDeviceRegistrationFailed": "No se pudo registrar este dispositivo en FCM. Comprueba la conexión e inténtalo de nuevo.",
  "notifications.currentDeviceRejected": "FCM rechazó el registro de este dispositivo. Inténtalo más tarde.",
  "notifications.currentDeviceAccepted": "FCM aceptó la prueba. Comprueba si la notificación apareció en este dispositivo.",
  "notifications.currentDeviceUnknown": "El resultado de FCM es desconocido. La prueba aún puede llegar; no la repitas inmediatamente.",
  "notifications.currentDeviceCooldown": "Espera antes de volver a probar este dispositivo.",
  "notifications.currentDeviceUnauthorized": "Se requiere acceso de gerente activo para probar notificaciones. Inicia sesión de nuevo o contacta al administrador.",
});

Object.assign(messages.en, {
  "weeklyClose.preview": "Preview · Read only",
  "environment.openSandbox": "Open Sandbox",
  "environment.backToProduction": "Back to Production",
  "devCenter.environment.emulator": "Emulator · Test data",
  "devCenter.environment.sandbox": "Sandbox · Test data",
  "devCenter.environment.production": "Production · Demo mutations blocked",
  "devCenter.environment.unknown": "Unknown · Mutations blocked",
  "devCenter.mutationsSafeOnly": "Demo mutations require Emulator or the allowlisted Sandbox. Production and unknown projects are blocked.",
  "devCenter.weeklyClose": "Weekly Close",
  "devCenter.weeklyCloseDescription": "Synthetic reconciliation cases: known, missing, paid, outstanding and unknown data. No real billing data.",
  "devCenter.resetAction": "Reset test data to Quick Demo",
  "devCenter.resetConfirmation": "Clear untouched seeded test data and generate Quick Demo? Protected data is preserved; this is not a full database wipe.",
  "weeklyClose.title": "Weekly close",
  "weeklyClose.refresh": "Refresh",
  "weeklyClose.rule": "Monday–Sunday, by scheduled service date. Only completed, non-archived REAL services are included.",
  "weeklyClose.externalPayments": "Invoices and client payments are not tracked in CleanFlow yet. Continue invoicing externally.",
  "weeklyClose.previous": "Previous week",
  "weeklyClose.thisWeek": "This week",
  "weeklyClose.weekStarting": "Week starting",
  "weeklyClose.unknown": "Unknown",
  "weeklyClose.entry": "Weekly close · Preview",
  "weeklyClose.entryDescription": "Read-only reconciliation. Invoices and client payments remain external.",
  "weeklyClose.incomplete": "Incomplete",
  "weeklyClose.pendingService": "{count} service missing data",
  "weeklyClose.pendingServices": "{count} services missing data",
  "weeklyClose.completeData": "All included services have complete reconciliation data for this CleanFlow view.",
  "weeklyClose.loading": "Loading this service week…",
  "weeklyClose.error": "This week could not be verified. Check your connection and refresh.",
  "weeklyClose.completedServiceCount": "Completed services",
  "weeklyClose.clientCharges": "Client charges",
  "weeklyClose.cleanerPayoutTotal": "Cleaner payout quotes",
  "weeklyClose.cleanerPaidTotal": "Cleaner paid — verified",
  "weeklyClose.cleanerOutstandingTotal": "Cleaner outstanding — verified",
  "weeklyClose.grossOperationalMargin": "Gross operational margin",
  "weeklyClose.knownSubtotal": "Known subtotal: {amount}",
  "weeklyClose.marginNote": "Margin = Job client charge minus Job cleaner payout quote. It is not net profit or cash received. Known subtotals exclude unknown amounts; margin subtotals include only services with both prices.",
  "weeklyClose.attentionSummary": "{count} services need attention before this week can be fully reconciled in CleanFlow.",
  "weeklyClose.unknownPayoutSummary": "Payment status is unknown for {count} services; unknown does not mean unpaid.",
  "weeklyClose.excludedSummary": "{count} records excluded from this summary",
  "weeklyClose.empty": "No completed REAL services in this week.",
  "weeklyClose.unnamedClient": "Client unresolved",
  "weeklyClose.services": "{count} services",
  "weeklyClose.needsAttention": "{count} need attention",
  "weeklyClose.unnamedProperty": "Property unresolved",
  "weeklyClose.cleanerNotResolved": "Cleaner unresolved",
  "weeklyClose.serviceDate": "Service date",
  "weeklyClose.clientCharge": "Client charge",
  "weeklyClose.cleanerPayout": "Cleaner payout quote",
  "weeklyClose.payoutStatus": "Payout status",
  "weeklyClose.status.PAID": "Paid",
  "weeklyClose.status.OUTSTANDING": "Outstanding",
  "weeklyClose.status.UNKNOWN": "Unknown",
  "weeklyClose.reason.missing_client_price": "Client price is not set.",
  "weeklyClose.reason.invalid_client_price": "Client price is invalid.",
  "weeklyClose.reason.missing_cleaner_payout": "Cleaner payout is not set.",
  "weeklyClose.reason.invalid_cleaner_payout": "Cleaner payout is invalid.",
  "weeklyClose.reason.missing_client_association": "No Client ID; grouped by the saved name only. Confirm the association.",
  "weeklyClose.reason.missing_client_name": "Client name cannot be resolved.",
  "weeklyClose.reason.client_link_unresolved": "Saved Client ID cannot be resolved; confirm the historical association.",
  "weeklyClose.reason.client_property_link_conflict": "The saved Job Client differs from the Property's current Client; review the historical association.",
  "weeklyClose.reason.missing_cleaner_name": "Cleaner name cannot be fully resolved.",
  "weeklyClose.reason.v2_payout_untracked": "Payment for assignment-based services is not tracked by the legacy payout flow.",
  "weeklyClose.reason.payout_lookup_incomplete": "Payout evidence could not be fully verified.",
  "weeklyClose.reason.payout_status_unknown": "Current records do not prove payment status.",
  "weeklyClose.reason.payout_link_missing": "A payout marker has no matching payment record.",
  "weeklyClose.reason.payout_link_conflict": "Payment links conflict; review the source records.",
  "weeklyClose.reason.payout_batch_allocation_unknown": "A grouped payment exists, but its immutable per-service allocation is not recorded.",
  "weeklyClose.reason.payout_amount_mismatch": "The current Job quote differs from the recorded payment amount.",
  "weeklyClose.reason.payout_evidence_invalid": "The payment record does not prove this service was paid.",
  "weeklyClose.excluded.DEMO": "Demo: {count}",
  "weeklyClose.excluded.UNKNOWN": "Unknown provenance: {count}",
  "weeklyClose.excluded.archived": "Archived: {count}",
  "weeklyClose.excluded.nonCompleted": "Not completed: {count}",
  "weeklyClose.excluded.outsideWeek": "Outside selected week: {count}",
  "weeklyClose.excluded.invalidDate": "Invalid service date: {count}",
  "weeklyClose.excluded.foreignOrganization": "Wrong organization: {count}",
  "weeklyClose.excluded.missingId": "Missing record ID: {count}",
  "weeklyClose.excluded.conflictingDuplicate": "Conflicting duplicate: {count}",
});

Object.assign(messages.pt, {
  "weeklyClose.preview": "Prévia · Somente leitura",
  "environment.openSandbox": "Abrir Sandbox",
  "environment.backToProduction": "Voltar para Produção",
  "devCenter.environment.emulator": "Emulador · Dados de teste",
  "devCenter.environment.sandbox": "Sandbox · Dados de teste",
  "devCenter.environment.production": "Produção · Mutações demo bloqueadas",
  "devCenter.environment.unknown": "Desconhecido · Mutações bloqueadas",
  "devCenter.mutationsSafeOnly": "Mutações demo exigem Emulador ou Sandbox autorizado. Produção e projetos desconhecidos estão bloqueados.",
  "devCenter.weeklyClose": "Fechamento semanal",
  "devCenter.weeklyCloseDescription": "Casos sintéticos de reconciliação: dados conhecidos, ausentes, pagos, pendentes e desconhecidos. Sem dados financeiros reais.",
  "devCenter.resetAction": "Restaurar dados de teste para Quick Demo",
  "devCenter.resetConfirmation": "Limpar dados de teste sem alterações operacionais e gerar Quick Demo? Dados protegidos são preservados; não apaga todo o banco.",
  "weeklyClose.title": "Fechamento semanal",
  "weeklyClose.refresh": "Atualizar",
  "weeklyClose.rule": "Segunda a domingo, pela data agendada. Inclui apenas serviços REAIS concluídos e não arquivados.",
  "weeklyClose.externalPayments": "Faturas e pagamentos de clientes ainda não são registrados no CleanFlow. Continue faturando externamente.",
  "weeklyClose.previous": "Semana anterior",
  "weeklyClose.thisWeek": "Esta semana",
  "weeklyClose.weekStarting": "Semana iniciando em",
  "weeklyClose.unknown": "Desconhecido",
  "weeklyClose.entry": "Fechamento semanal · Prévia",
  "weeklyClose.entryDescription": "Reconciliação somente leitura. Faturas e pagamentos de clientes continuam externos.",
  "weeklyClose.incomplete": "Incompleto",
  "weeklyClose.pendingService": "{count} serviço com dados pendentes",
  "weeklyClose.pendingServices": "{count} serviços com dados pendentes",
  "weeklyClose.completeData": "Todos os serviços incluídos têm dados completos de reconciliação para esta visão do CleanFlow.",
  "weeklyClose.loading": "Carregando os serviços da semana…",
  "weeklyClose.error": "Não foi possível verificar esta semana. Confira a conexão e atualize.",
  "weeklyClose.completedServiceCount": "Serviços concluídos",
  "weeklyClose.clientCharges": "Valores dos clientes",
  "weeklyClose.cleanerPayoutTotal": "Valores previstos para cleaners",
  "weeklyClose.cleanerPaidTotal": "Pago aos cleaners — verificado",
  "weeklyClose.cleanerOutstandingTotal": "Pendente para cleaners — verificado",
  "weeklyClose.grossOperationalMargin": "Margem operacional bruta",
  "weeklyClose.knownSubtotal": "Subtotal conhecido: {amount}",
  "weeklyClose.marginNote": "Margem = valor do cliente menos valor previsto para o cleaner no serviço. Não é lucro líquido nem dinheiro recebido. Subtotais conhecidos excluem valores desconhecidos; a margem inclui apenas serviços com ambos os preços.",
  "weeklyClose.attentionSummary": "{count} serviços precisam de atenção antes que esta semana possa ser totalmente reconciliada no CleanFlow.",
  "weeklyClose.unknownPayoutSummary": "Pagamento desconhecido em {count} serviços; desconhecido não significa não pago.",
  "weeklyClose.excludedSummary": "{count} registros excluídos deste resumo",
  "weeklyClose.empty": "Nenhum serviço REAL concluído nesta semana.",
  "weeklyClose.unnamedClient": "Cliente não identificado",
  "weeklyClose.services": "{count} serviços",
  "weeklyClose.needsAttention": "{count} precisam de atenção",
  "weeklyClose.unnamedProperty": "Propriedade não identificada",
  "weeklyClose.cleanerNotResolved": "Cleaner não identificado",
  "weeklyClose.serviceDate": "Data do serviço",
  "weeklyClose.clientCharge": "Valor do cliente",
  "weeklyClose.cleanerPayout": "Valor previsto do cleaner",
  "weeklyClose.payoutStatus": "Situação do pagamento",
  "weeklyClose.status.PAID": "Pago",
  "weeklyClose.status.OUTSTANDING": "Pendente",
  "weeklyClose.status.UNKNOWN": "Desconhecido",
  "weeklyClose.reason.missing_client_price": "Valor do cliente não definido.",
  "weeklyClose.reason.invalid_client_price": "Valor do cliente inválido.",
  "weeklyClose.reason.missing_cleaner_payout": "Valor do cleaner não definido.",
  "weeklyClose.reason.invalid_cleaner_payout": "Valor do cleaner inválido.",
  "weeklyClose.reason.missing_client_association": "Sem ID de cliente; agrupado apenas pelo nome salvo. Confirme a associação.",
  "weeklyClose.reason.missing_client_name": "Nome do cliente não identificado.",
  "weeklyClose.reason.client_link_unresolved": "ID de cliente salvo não identificado; confirme o vínculo histórico.",
  "weeklyClose.reason.client_property_link_conflict": "O cliente salvo no serviço difere do cliente atual da propriedade; revise o vínculo histórico.",
  "weeklyClose.reason.missing_cleaner_name": "Não foi possível identificar todos os cleaners.",
  "weeklyClose.reason.v2_payout_untracked": "Pagamentos de serviços com Assignments não são registrados no fluxo legado.",
  "weeklyClose.reason.payout_lookup_incomplete": "Evidências de pagamento não verificadas integralmente.",
  "weeklyClose.reason.payout_status_unknown": "Os registros não comprovam a situação do pagamento.",
  "weeklyClose.reason.payout_link_missing": "Marcador de pagamento sem registro correspondente.",
  "weeklyClose.reason.payout_link_conflict": "Vínculos de pagamento conflitantes; revise os registros.",
  "weeklyClose.reason.payout_batch_allocation_unknown": "Existe pagamento agrupado, mas não há distribuição imutável por serviço.",
  "weeklyClose.reason.payout_amount_mismatch": "O valor atual do serviço difere do pagamento registrado.",
  "weeklyClose.reason.payout_evidence_invalid": "O registro não comprova o pagamento deste serviço.",
  "weeklyClose.excluded.DEMO": "Demo: {count}",
  "weeklyClose.excluded.UNKNOWN": "Origem desconhecida: {count}",
  "weeklyClose.excluded.archived": "Arquivados: {count}",
  "weeklyClose.excluded.nonCompleted": "Não concluídos: {count}",
  "weeklyClose.excluded.outsideWeek": "Fora da semana: {count}",
  "weeklyClose.excluded.invalidDate": "Data inválida: {count}",
  "weeklyClose.excluded.foreignOrganization": "Outra organização: {count}",
  "weeklyClose.excluded.missingId": "Sem ID: {count}",
  "weeklyClose.excluded.conflictingDuplicate": "Duplicatas conflitantes: {count}",
});

Object.assign(messages.es, {
  "weeklyClose.preview": "Vista previa · Solo lectura",
  "environment.openSandbox": "Abrir Sandbox",
  "environment.backToProduction": "Volver a Producción",
  "devCenter.environment.emulator": "Emulador · Datos de prueba",
  "devCenter.environment.sandbox": "Sandbox · Datos de prueba",
  "devCenter.environment.production": "Producción · Mutaciones demo bloqueadas",
  "devCenter.environment.unknown": "Desconocido · Mutaciones bloqueadas",
  "devCenter.mutationsSafeOnly": "Las mutaciones demo requieren Emulador o Sandbox autorizado. Producción y proyectos desconocidos están bloqueados.",
  "devCenter.weeklyClose": "Cierre semanal",
  "devCenter.weeklyCloseDescription": "Casos sintéticos de conciliación: datos conocidos, ausentes, pagados, pendientes y desconocidos. Sin datos financieros reales.",
  "devCenter.resetAction": "Restablecer datos de prueba a Quick Demo",
  "devCenter.resetConfirmation": "¿Limpiar datos de prueba sin cambios operativos y generar Quick Demo? Se conservan los datos protegidos; no borra toda la base.",
  "weeklyClose.title": "Cierre semanal",
  "weeklyClose.refresh": "Actualizar",
  "weeklyClose.rule": "Lunes a domingo, por fecha programada. Solo incluye servicios REALES completados y no archivados.",
  "weeklyClose.externalPayments": "Las facturas y los pagos de clientes aún no se registran en CleanFlow. Continúa facturando externamente.",
  "weeklyClose.previous": "Semana anterior",
  "weeklyClose.thisWeek": "Esta semana",
  "weeklyClose.weekStarting": "Semana que comienza",
  "weeklyClose.unknown": "Desconocido",
  "weeklyClose.entry": "Cierre semanal · Vista previa",
  "weeklyClose.entryDescription": "Conciliación de solo lectura. Las facturas y los pagos de clientes siguen siendo externos.",
  "weeklyClose.incomplete": "Incompleto",
  "weeklyClose.pendingService": "{count} servicio con datos pendientes",
  "weeklyClose.pendingServices": "{count} servicios con datos pendientes",
  "weeklyClose.completeData": "Todos los servicios incluidos tienen datos completos de conciliación para esta vista de CleanFlow.",
  "weeklyClose.loading": "Cargando los servicios de la semana…",
  "weeklyClose.error": "No se pudo verificar esta semana. Comprueba la conexión y actualiza.",
  "weeklyClose.completedServiceCount": "Servicios completados",
  "weeklyClose.clientCharges": "Importes de clientes",
  "weeklyClose.cleanerPayoutTotal": "Importes previstos para cleaners",
  "weeklyClose.cleanerPaidTotal": "Pagado a cleaners — verificado",
  "weeklyClose.cleanerOutstandingTotal": "Pendiente para cleaners — verificado",
  "weeklyClose.grossOperationalMargin": "Margen operativo bruto",
  "weeklyClose.knownSubtotal": "Subtotal conocido: {amount}",
  "weeklyClose.marginNote": "Margen = importe del cliente menos importe previsto para el cleaner del servicio. No es beneficio neto ni dinero recibido. Los subtotales conocidos excluyen importes desconocidos; el margen solo incluye servicios con ambos precios.",
  "weeklyClose.attentionSummary": "{count} servicios necesitan atención antes de que esta semana pueda conciliarse completamente en CleanFlow.",
  "weeklyClose.unknownPayoutSummary": "Pago desconocido en {count} servicios; desconocido no significa no pagado.",
  "weeklyClose.excludedSummary": "{count} registros excluidos del resumen",
  "weeklyClose.empty": "No hay servicios REALES completados esta semana.",
  "weeklyClose.unnamedClient": "Cliente no identificado",
  "weeklyClose.services": "{count} servicios",
  "weeklyClose.needsAttention": "{count} necesitan atención",
  "weeklyClose.unnamedProperty": "Propiedad no identificada",
  "weeklyClose.cleanerNotResolved": "Cleaner no identificado",
  "weeklyClose.serviceDate": "Fecha del servicio",
  "weeklyClose.clientCharge": "Importe del cliente",
  "weeklyClose.cleanerPayout": "Importe previsto del cleaner",
  "weeklyClose.payoutStatus": "Estado del pago",
  "weeklyClose.status.PAID": "Pagado",
  "weeklyClose.status.OUTSTANDING": "Pendiente",
  "weeklyClose.status.UNKNOWN": "Desconocido",
  "weeklyClose.reason.missing_client_price": "Importe del cliente no establecido.",
  "weeklyClose.reason.invalid_client_price": "Importe del cliente inválido.",
  "weeklyClose.reason.missing_cleaner_payout": "Importe del cleaner no establecido.",
  "weeklyClose.reason.invalid_cleaner_payout": "Importe del cleaner inválido.",
  "weeklyClose.reason.missing_client_association": "Sin ID de cliente; agrupado solo por el nombre guardado. Confirma la relación.",
  "weeklyClose.reason.missing_client_name": "No se pudo identificar al cliente.",
  "weeklyClose.reason.client_link_unresolved": "ID de cliente guardado sin resolver; confirma el vínculo histórico.",
  "weeklyClose.reason.client_property_link_conflict": "El cliente guardado del servicio difiere del cliente actual de la propiedad; revisa el vínculo histórico.",
  "weeklyClose.reason.missing_cleaner_name": "No se pudo identificar a todos los cleaners.",
  "weeklyClose.reason.v2_payout_untracked": "El flujo legado no registra pagos de servicios con Assignments.",
  "weeklyClose.reason.payout_lookup_incomplete": "No se pudo verificar toda la evidencia de pago.",
  "weeklyClose.reason.payout_status_unknown": "Los registros no demuestran el estado del pago.",
  "weeklyClose.reason.payout_link_missing": "Marcador de pago sin registro correspondiente.",
  "weeklyClose.reason.payout_link_conflict": "Relaciones de pago en conflicto; revisa los registros.",
  "weeklyClose.reason.payout_batch_allocation_unknown": "Existe un pago agrupado, pero no una distribución inmutable por servicio.",
  "weeklyClose.reason.payout_amount_mismatch": "El importe actual del servicio difiere del pago registrado.",
  "weeklyClose.reason.payout_evidence_invalid": "El registro no demuestra el pago de este servicio.",
  "weeklyClose.excluded.DEMO": "Demo: {count}",
  "weeklyClose.excluded.UNKNOWN": "Origen desconocido: {count}",
  "weeklyClose.excluded.archived": "Archivados: {count}",
  "weeklyClose.excluded.nonCompleted": "No completados: {count}",
  "weeklyClose.excluded.outsideWeek": "Fuera de la semana: {count}",
  "weeklyClose.excluded.invalidDate": "Fecha inválida: {count}",
  "weeklyClose.excluded.foreignOrganization": "Otra organización: {count}",
  "weeklyClose.excluded.missingId": "Sin ID: {count}",
  "weeklyClose.excluded.conflictingDuplicate": "Duplicados en conflicto: {count}",
});

Object.assign(messages.en, {
  "lifecycle.execution": "Service progress",
  "lifecycle.unknown": "Unknown status",
  "lifecycle.archived": "Archived · historical record",
  "lifecycle.stage.UNASSIGNED": "Unassigned",
  "lifecycle.stage.OFFERED": "Offered",
  "lifecycle.stage.ASSIGNED": "Assigned",
  "lifecycle.stage.IN_PROGRESS": "In progress",
  "lifecycle.stage.COMPLETED": "Completed",
  "lifecycle.position.completed": "Completed stage",
  "lifecycle.position.current": "Current",
  "lifecycle.position.future": "Upcoming",
  "lifecycle.position.skipped": "Not used",
  "lifecycle.position.unknown-past": "History not verified",
  "lifecycle.accessibleStage": "{stage}: {position}",
  "lifecycle.checklistTitle": "Checklist progress",
  "lifecycle.checklist.NONE": "No checklist created",
  "lifecycle.checklist.LOADING": "Loading checklist…",
  "lifecycle.checklist.UNKNOWN": "Checklist status unavailable",
  "lifecycle.checklist.DRAFT": "Draft",
  "lifecycle.checklist.READY_FOR_REVIEW": "Ready for manager review",
  "lifecycle.checklist.ABANDONED": "Abandoned",
  "lifecycle.checklist.SAVED": "Saved checklist",
  "lifecycle.savedItems": "{saved} of {total} items saved",
  "lifecycle.savedProgress": "Saved checklist answers",
  "lifecycle.progressUnknown": "Saved progress unavailable",
  "lifecycle.lastSaved": "Last saved",
  "lifecycle.noSavedTime": "No saved update recorded yet",
  "lifecycle.cleanerLink": "Cleaner link",
  "lifecycle.link.NONE": "No link issued",
  "lifecycle.link.LOADING": "Checking link…",
  "lifecycle.link.UNKNOWN": "Link status unavailable",
  "lifecycle.link.ACTIVE": "Active",
  "lifecycle.link.STALE": "Stale · needs attention",
  "lifecycle.link.REVOKED": "Revoked",
  "lifecycle.link.EXPIRED": "Expired",
  "lifecycle.link.UNAVAILABLE": "Unavailable",
  "lifecycle.attention.staleLink": "The cleaner link is stale. Review its existing link controls below.",
  "lifecycle.linkControls": "View link controls",
  "lifecycle.attention.review": "The checklist is waiting for manager review.",
  "lifecycle.attention.openIssues": "Open issues needing attention: {count}",
  "lifecycle.review": "Review checklist",
  "lifecycle.openChecklist": "Open existing checklist",
  "lifecycle.openIssues": "View issues",
  "lifecycle.financialSnapshot": "Financial snapshot",
  "lifecycle.cleanerSummary": "Assigned cleaner",
  "lifecycle.previewTitle": "Service lifecycle preview",
  "lifecycle.previewDescription": "Synthetic, read-only projections. Real checklist Run and capability reads require Sandbox Functions and billing activation.",
  "lifecycle.scenario": "Synthetic scenario",
  "lifecycle.previewAction": "Preview only · no data is saved. Use real Job Detail for operational actions.",
  "lifecycle.previewEntry": "Service lifecycle · Preview",
});

Object.assign(messages.pt, {
  "lifecycle.execution": "Progresso do serviço",
  "lifecycle.unknown": "Status desconhecido",
  "lifecycle.archived": "Arquivado · registro histórico",
  "lifecycle.stage.UNASSIGNED": "Sem cleaner",
  "lifecycle.stage.OFFERED": "Oferecido",
  "lifecycle.stage.ASSIGNED": "Atribuído",
  "lifecycle.stage.IN_PROGRESS": "Em andamento",
  "lifecycle.stage.COMPLETED": "Concluído",
  "lifecycle.position.completed": "Etapa comprovada",
  "lifecycle.position.current": "Atual",
  "lifecycle.position.future": "Próxima",
  "lifecycle.position.skipped": "Não usado",
  "lifecycle.position.unknown-past": "Histórico não verificado",
  "lifecycle.accessibleStage": "{stage}: {position}",
  "lifecycle.checklistTitle": "Progresso do checklist",
  "lifecycle.checklist.NONE": "Nenhum checklist criado",
  "lifecycle.checklist.LOADING": "Carregando checklist…",
  "lifecycle.checklist.UNKNOWN": "Status do checklist indisponível",
  "lifecycle.checklist.DRAFT": "Rascunho",
  "lifecycle.checklist.READY_FOR_REVIEW": "Pronto para revisão do manager",
  "lifecycle.checklist.ABANDONED": "Abandonado",
  "lifecycle.checklist.SAVED": "Checklist salvo",
  "lifecycle.savedItems": "{saved} de {total} itens salvos",
  "lifecycle.savedProgress": "Respostas salvas do checklist",
  "lifecycle.progressUnknown": "Progresso salvo indisponível",
  "lifecycle.lastSaved": "Salvo pela última vez",
  "lifecycle.noSavedTime": "Nenhuma atualização salva registrada ainda",
  "lifecycle.cleanerLink": "Link da cleaner",
  "lifecycle.link.NONE": "Nenhum link emitido",
  "lifecycle.link.LOADING": "Verificando link…",
  "lifecycle.link.UNKNOWN": "Status do link indisponível",
  "lifecycle.link.ACTIVE": "Ativo",
  "lifecycle.link.STALE": "Desatualizado · precisa de atenção",
  "lifecycle.link.REVOKED": "Revogado",
  "lifecycle.link.EXPIRED": "Expirado",
  "lifecycle.link.UNAVAILABLE": "Indisponível",
  "lifecycle.attention.staleLink": "O link da cleaner está desatualizado. Confira os controles do link abaixo.",
  "lifecycle.linkControls": "Ver controles do link",
  "lifecycle.attention.review": "O checklist está aguardando revisão do manager.",
  "lifecycle.attention.openIssues": "Ocorrências abertas que precisam de atenção: {count}",
  "lifecycle.review": "Revisar checklist",
  "lifecycle.openChecklist": "Abrir checklist existente",
  "lifecycle.openIssues": "Ver ocorrências",
  "lifecycle.financialSnapshot": "Resumo financeiro",
  "lifecycle.cleanerSummary": "Cleaner atribuída",
  "lifecycle.previewTitle": "Prévia do progresso do serviço",
  "lifecycle.previewDescription": "Projeções sintéticas, somente leitura. A leitura de Runs e capabilities reais exige Functions no Sandbox e ativação de billing.",
  "lifecycle.scenario": "Cenário sintético",
  "lifecycle.previewAction": "Somente prévia · nenhum dado é salvo. Use o Job Detail real para ações operacionais.",
  "lifecycle.previewEntry": "Progresso do serviço · Prévia",
});

Object.assign(messages.es, {
  "lifecycle.execution": "Progreso del servicio",
  "lifecycle.unknown": "Estado desconocido",
  "lifecycle.archived": "Archivado · registro histórico",
  "lifecycle.stage.UNASSIGNED": "Sin asignar",
  "lifecycle.stage.OFFERED": "Ofrecido",
  "lifecycle.stage.ASSIGNED": "Asignado",
  "lifecycle.stage.IN_PROGRESS": "En curso",
  "lifecycle.stage.COMPLETED": "Completado",
  "lifecycle.position.completed": "Etapa comprobada",
  "lifecycle.position.current": "Actual",
  "lifecycle.position.future": "Próxima",
  "lifecycle.position.skipped": "No utilizado",
  "lifecycle.position.unknown-past": "Historial no verificado",
  "lifecycle.accessibleStage": "{stage}: {position}",
  "lifecycle.checklistTitle": "Progreso del checklist",
  "lifecycle.checklist.NONE": "No se ha creado un checklist",
  "lifecycle.checklist.LOADING": "Cargando checklist…",
  "lifecycle.checklist.UNKNOWN": "Estado del checklist no disponible",
  "lifecycle.checklist.DRAFT": "Borrador",
  "lifecycle.checklist.READY_FOR_REVIEW": "Listo para revisión del manager",
  "lifecycle.checklist.ABANDONED": "Abandonado",
  "lifecycle.checklist.SAVED": "Checklist guardado",
  "lifecycle.savedItems": "{saved} de {total} elementos guardados",
  "lifecycle.savedProgress": "Respuestas guardadas del checklist",
  "lifecycle.progressUnknown": "Progreso guardado no disponible",
  "lifecycle.lastSaved": "Guardado por última vez",
  "lifecycle.noSavedTime": "Aún no se ha registrado una actualización guardada",
  "lifecycle.cleanerLink": "Enlace del cleaner",
  "lifecycle.link.NONE": "No se ha emitido un enlace",
  "lifecycle.link.LOADING": "Comprobando enlace…",
  "lifecycle.link.UNKNOWN": "Estado del enlace no disponible",
  "lifecycle.link.ACTIVE": "Activo",
  "lifecycle.link.STALE": "Desactualizado · necesita atención",
  "lifecycle.link.REVOKED": "Revocado",
  "lifecycle.link.EXPIRED": "Caducado",
  "lifecycle.link.UNAVAILABLE": "No disponible",
  "lifecycle.attention.staleLink": "El enlace del cleaner está desactualizado. Revisa los controles del enlace abajo.",
  "lifecycle.linkControls": "Ver controles del enlace",
  "lifecycle.attention.review": "El checklist está esperando revisión del manager.",
  "lifecycle.attention.openIssues": "Incidencias abiertas que necesitan atención: {count}",
  "lifecycle.review": "Revisar checklist",
  "lifecycle.openChecklist": "Abrir checklist existente",
  "lifecycle.openIssues": "Ver incidencias",
  "lifecycle.financialSnapshot": "Resumen financiero",
  "lifecycle.cleanerSummary": "Cleaner asignado",
  "lifecycle.previewTitle": "Vista previa del progreso del servicio",
  "lifecycle.previewDescription": "Proyecciones sintéticas, de solo lectura. La lectura de Runs y capabilities reales requiere Functions en Sandbox y activación de billing.",
  "lifecycle.scenario": "Escenario sintético",
  "lifecycle.previewAction": "Solo vista previa · no se guarda ningún dato. Usa el Job Detail real para acciones operativas.",
  "lifecycle.previewEntry": "Progreso del servicio · Vista previa",
});

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

Object.assign(messages.en, {
  "checklists.draftNotSubmitted": "Draft saved — not submitted yet.",
  "checklists.draftPending": "Draft changes are not confirmed saved yet. Check the save status above before sending.",
  "checklists.completionIncomplete": "Checklist incomplete",
  "checklists.completionReady": "Ready to send for review",
  "checklists.completionSaving": "Saving your answers…",
  "checklists.completionPhotosFailed": "{count} photo(s) were not saved",
  "checklists.completionPhotosFailedHelp": "Try them again or discard them. Then you can send the checklist.",
  "checklists.completionPhotosSending": "Sending photos… keep this page open",
  "checklists.goToPhotos": "Go to the photos",
  "checklists.photosSectionTitle": "Photos",
  "checklists.photosAtEnd": "Add the photos at the end of the checklist",
  "checklists.completionReadyHelp": "Your draft is saved. Send it below; your manager will review it next.",
  "checklists.goToSendStep": "Go to the send step",
  "checklists.submissionReceipt": "Checklist submitted. No further action is needed from you here; manager review is next, not service completion.",
  "checklists.submissionPending": "Waiting for server confirmation. Do not send again while this request is in progress.",
});
Object.assign(messages.pt, {
  "checklists.draftNotSubmitted": "Rascunho salvo — ainda não enviado.",
  "checklists.draftPending": "As alterações ainda não têm salvamento confirmado. Confira o estado acima antes de enviar.",
  "checklists.completionIncomplete": "Checklist incompleto",
  "checklists.completionReady": "Pronto para enviar para revisão",
  "checklists.completionSaving": "Salvando suas respostas…",
  "checklists.completionPhotosFailed": "{count} foto(s) não foram salvas",
  "checklists.completionPhotosFailedHelp": "Tente de novo ou descarte essas fotos. Depois você pode enviar o checklist.",
  "checklists.completionPhotosSending": "Enviando fotos… mantenha esta página aberta",
  "checklists.goToPhotos": "Ir para as fotos",
  "checklists.photosSectionTitle": "Fotos",
  "checklists.photosAtEnd": "Adicione as fotos no final do checklist",
  "checklists.completionReadyHelp": "Seu rascunho está salvo. Envie abaixo; a gerente fará a revisão em seguida.",
  "checklists.goToSendStep": "Ir à etapa de envio",
  "checklists.submissionReceipt": "Checklist enviado. Nenhuma outra ação é necessária aqui; o próximo passo é a revisão da gerente, não a conclusão do serviço.",
  "checklists.submissionPending": "Aguardando confirmação do servidor. Não envie novamente enquanto esta solicitação estiver em andamento.",
});
Object.assign(messages.es, {
  "checklists.draftNotSubmitted": "Borrador guardado — todavía no enviado.",
  "checklists.draftPending": "Los cambios aún no tienen guardado confirmado. Revisa el estado de arriba antes de enviar.",
  "checklists.completionIncomplete": "Checklist incompleto",
  "checklists.completionReady": "Listo para enviar a revisión",
  "checklists.completionSaving": "Guardando tus respuestas…",
  "checklists.completionPhotosFailed": "{count} foto(s) no se guardaron",
  "checklists.completionPhotosFailedHelp": "Reinténtalas o descártalas. Luego puedes enviar el checklist.",
  "checklists.completionPhotosSending": "Enviando fotos… mantén esta página abierta",
  "checklists.goToPhotos": "Ir a las fotos",
  "checklists.photosSectionTitle": "Fotos",
  "checklists.photosAtEnd": "Agrega las fotos al final del checklist",
  "checklists.completionReadyHelp": "Tu borrador está guardado. Envíalo abajo; la gerente lo revisará después.",
  "checklists.goToSendStep": "Ir al paso de envío",
  "checklists.submissionReceipt": "Checklist enviado. No necesitas otra acción aquí; sigue la revisión de la gerente, no la finalización del servicio.",
  "checklists.submissionPending": "Esperando confirmación del servidor. No vuelvas a enviar mientras esta solicitud esté en curso.",
});

export function useTranslation() {
  const translation = useContext(TranslationContext);
  if (!translation) throw new Error("useTranslation must be used within TranslationProvider");
  return translation;
}

// Definitive UI shell and workspace copy.
Object.assign(messages.en, {
  "shell.more": "More", "shell.close": "Close", "shell.inboxShort": "Inbox", "shell.accountMenu": "Account: {name}",
  "shell.appearance": "Appearance", "shell.notifications": "Notifications on this device", "shell.themeLight": "Light", "shell.themeDark": "Dark",
});
Object.assign(messages.pt, {
  "shell.more": "Mais", "shell.close": "Fechar", "shell.inboxShort": "Avisos", "shell.accountMenu": "Conta: {name}",
  "shell.appearance": "Aparência", "shell.notifications": "Notificações neste aparelho", "shell.themeLight": "Claro", "shell.themeDark": "Escuro",
});
Object.assign(messages.es, {
  "shell.more": "Más", "shell.close": "Cerrar", "shell.inboxShort": "Avisos", "shell.accountMenu": "Cuenta: {name}",
  "shell.appearance": "Apariencia", "shell.notifications": "Notificaciones en este dispositivo", "shell.themeLight": "Claro", "shell.themeDark": "Oscuro",
});
Object.assign(messages.en, {
  "home.noticesTitle": "Ready for your review", "home.noticesSubtitle": "From the latest notifications loaded on this device.",
  "home.openInbox": "Open inbox", "home.notice.checklist": "Checklist submitted",
});
Object.assign(messages.pt, {
  "home.noticesTitle": "Prontos para você revisar", "home.noticesSubtitle": "Dos avisos mais recentes carregados neste aparelho.",
  "home.openInbox": "Abrir avisos", "home.notice.checklist": "Checklist enviado",
});
Object.assign(messages.es, {
  "home.noticesTitle": "Listos para tu revisión", "home.noticesSubtitle": "De los avisos más recientes cargados en este dispositivo.",
  "home.openInbox": "Abrir avisos", "home.notice.checklist": "Checklist enviado",
});
