import { Icon } from "./Icon.jsx";

// Operational state glyphs, drawn from the shared stroke family (no emoji).
const operationalIcons = {
  calendar: "calendar",
  assignment: "userX",
  clock: "clock",
  "check-circle": "checkCircle",
  alert: "alert",
  "user-check": "userCheck",
  mail: "send",
  key: "key",
  package: "package",
  wrench: "wrench",
  sparkle: "broom",
};

export function OperationalIcon({ name, size = 18 }) {
  return (
    <span className="operational-icon" aria-hidden="true">
      <Icon name={operationalIcons[name] || "alert"} size={size} />
    </span>
  );
}
