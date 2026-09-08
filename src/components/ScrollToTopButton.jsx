import { useEffect, useState } from "react";
import { useTranslation } from "../i18n/translations.js";

export function ScrollToTopButton({ threshold = 400 }) {
  const { translate } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    function updateVisibility() {
      setIsVisible(window.scrollY > threshold);
    }
    updateVisibility();
    window.addEventListener("scroll", updateVisibility, { passive: true });
    return () => window.removeEventListener("scroll", updateVisibility);
  }, [threshold]);

  if (!isVisible) return null;

  return (
    <button
      className="scroll-to-top-button"
      type="button"
      aria-label={translate("jobs.scrollToTop")}
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
    >
      ↑
    </button>
  );
}
