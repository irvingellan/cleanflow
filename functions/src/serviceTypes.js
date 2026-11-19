export const defaultServiceType = "STANDARD";

export const serviceTypes = Object.freeze([
  defaultServiceType,
  "AIRBNB_TOUCH_UP",
  "DEEP_CLEANING",
  "MOVE_IN_OUT",
  "POST_CONSTRUCTION",
]);

export function isServiceType(value) {
  return serviceTypes.includes(value);
}

export function normalizeServiceType(value) {
  return isServiceType(value) ? value : defaultServiceType;
}
