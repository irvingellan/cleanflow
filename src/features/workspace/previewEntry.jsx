// Separate dev entry: not imported by App, not included in the Hosting build.
if (import.meta.env.DEV && ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname)) {
  import("./OperationsWorkspaceV1.jsx").then(({ mountPreview }) => mountPreview());
} else {
  document.getElementById("root").textContent = "Local development preview only.";
}
