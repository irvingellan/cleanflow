import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";

const themeStorageKey = "cleanflow-manager-theme";
const ThemeContext = createContext(null);

function storedThemePreference() {
  try {
    const theme = window.localStorage.getItem(themeStorageKey);
    return theme === "light" || theme === "dark" ? theme : null;
  } catch {
    return null;
  }
}

function systemTheme() {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function initialThemeState() {
  const storedTheme = storedThemePreference();

  return {
    theme: storedTheme || systemTheme(),
    isExplicit: Boolean(storedTheme),
  };
}

export function ThemeProvider({ children }) {
  const [themeState, setThemeState] = useState(initialThemeState);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = themeState.theme;

    return () => {
      delete document.documentElement.dataset.theme;
    };
  }, [themeState.theme]);

  useEffect(() => {
    if (themeState.isExplicit || !window.matchMedia) {
      return undefined;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const updateThemeFromSystem = (event) => {
      setThemeState({ theme: event.matches ? "dark" : "light", isExplicit: false });
    };

    mediaQuery.addEventListener("change", updateThemeFromSystem);
    return () => mediaQuery.removeEventListener("change", updateThemeFromSystem);
  }, [themeState.isExplicit]);

  function setTheme(theme) {
    setThemeState({ theme, isExplicit: true });

    try {
      window.localStorage.setItem(themeStorageKey, theme);
    } catch {
      // The selected theme still applies for the current session when storage is unavailable.
    }
  }

  return createElement(
    ThemeContext.Provider,
    {
      value: {
        theme: themeState.theme,
        setTheme,
      },
    },
    children,
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider.");
  }

  return context;
}
