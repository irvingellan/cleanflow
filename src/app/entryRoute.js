export function publicOfferTokenFromPathname(pathname = window.location.pathname) {
  const pathSegments = pathname.split("/").filter(Boolean);

  if (pathSegments[0] !== "offer") {
    return null;
  }

  if (pathSegments.length !== 2) {
    return "";
  }

  try {
    return decodeURIComponent(pathSegments[1]);
  } catch {
    return "";
  }
}

export function isChecklistPreviewPath(pathname = window.location.pathname) {
  return pathname.replace(/\/+$/, "") === "/checklist-preview";
}

export function isCleanerHubPath(pathname = window.location.pathname) {
  const route = pathname.replace(/\/+$/, "");
  return route === "/agenda" || route === "/agenda.html";
}

export function isWeeklyClosePreviewPath(pathname = window.location.pathname) {
  return pathname.replace(/\/+$/, "") === "/weekly-close-preview";
}

export function isManagerLoadDiagnosticsPath(pathname = window.location.pathname) {
  return pathname.replace(/\/+$/, "") === "/diagnostics/load-times";
}

export function publicChecklistTokenFromSearch(
  pathname = window.location.pathname,
  search = window.location.search,
) {
  if (pathname.replace(/\/+$/, "") !== "/checklist") return null;
  return new URLSearchParams(search).get("t") || "";
}

export function publicClientReportTokenFromSearch(
  pathname = window.location.pathname,
  search = window.location.search,
) {
  if (pathname.replace(/\/+$/, "") !== "/client-report") return null;
  return new URLSearchParams(search).get("t") || "";
}

export function publicClientPortalTokenFromSearch(
  pathname = window.location.pathname,
  search = window.location.search,
) {
  if (pathname.replace(/\/+$/, "") !== "/portal") return null;
  return new URLSearchParams(search).get("t") || "";
}
