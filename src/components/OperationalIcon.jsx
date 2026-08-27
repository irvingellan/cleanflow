export function OperationalIcon({ name }) {
  const symbols = {
    calendar: "📅",
    assignment: "⏰",
    clock: "🧹",
    "check-circle": "✅",
    alert: "⚠️",
    "user-check": "👤",
    mail: "📩",
    key: "🚪",
    package: "📦",
    wrench: "🛠️",
    sparkle: "🧹",
  };

  return (
    <span className="operational-icon" aria-hidden="true">
      {symbols[name] || symbols.alert}
    </span>
  );
}
