import { Icon } from "../../components/Icon.jsx";

// The Cleaner Hub draws from the product's single stroke icon family.
export function HubIcon({ name, size = 18, className = "", label }) {
  return <Icon name={name} size={size} className={`mw-icon ${className}`.trim()} label={label} />;
}
