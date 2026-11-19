const messages = {
  en: { refreshFailed: "Could not refresh. The last available snapshot is shown.", loadingReleases: "Loading releases…", updated: "Updated at {time}", refresh: "Refresh", refreshing: "Refreshing…", export: "Export CSV",
    failures: "Recent errors", noFailures: "No recorded errors.", page: "Page load", operation: "Operation",
    releases: "Releases", open: "Open pull requests", merged: "Last 5 merged", unavailable: "Release information is unavailable.",
    none: "None", mobile: "Mobile", desktop: "Desktop" },
  pt: { refreshFailed: "Não foi possível atualizar. A última consulta disponível continua na tela.", loadingReleases: "Carregando versões…", updated: "Atualizado às {time}", refresh: "Atualizar", refreshing: "Atualizando…", export: "Exportar CSV",
    failures: "Erros recentes", noFailures: "Nenhum erro registrado.", page: "Carregamento de página", operation: "Operação",
    releases: "Versões", open: "PRs abertos", merged: "Últimos 5 integrados", unavailable: "Informações de versões indisponíveis.",
    none: "Nenhum", mobile: "Celular", desktop: "Computador" },
  es: { refreshFailed: "No se pudo actualizar. Se muestra la última consulta disponible.", loadingReleases: "Cargando versiones…", updated: "Actualizado a las {time}", refresh: "Actualizar", refreshing: "Actualizando…", export: "Exportar CSV",
    failures: "Errores recientes", noFailures: "Ningún error registrado.", page: "Carga de página", operation: "Operación",
    releases: "Versiones", open: "PR abiertos", merged: "Últimos 5 integrados", unavailable: "Información de versiones no disponible.",
    none: "Ninguno", mobile: "Móvil", desktop: "Computadora" },
};

export const ownerText = (language, key) => (messages[language] ?? messages.en)[key];
