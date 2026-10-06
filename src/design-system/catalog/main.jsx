import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "../../theme/theme.js";
import { TranslationProvider } from "../../i18n/translations.js";
import { Catalog } from "./Catalog.jsx";
import "../../index.css";

// Separate entry: no App, Firebase client, Auth, services or service worker registration.
const localHarness = import.meta.env.MODE === "e2e" && ["localhost", "127.0.0.1"].includes(location.hostname);
if (import.meta.env.MODE !== "sandbox" && !localHarness) throw new Error("Catalog unavailable outside Sandbox/local QA");
createRoot(document.getElementById("root")).render(<StrictMode><ThemeProvider><TranslationProvider><Catalog /></TranslationProvider></ThemeProvider></StrictMode>);
