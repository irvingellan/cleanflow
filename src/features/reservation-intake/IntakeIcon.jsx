// Intake-only visual symbols. Text labels remain the accessible source of meaning.
export function IntakeIcon({ state }) {
  if (state === "ENVIRONMENT") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6M10 3v7l-5 9a1 1 0 0 0 1 2h12a1 1 0 0 0 1-2l-5-9V3M8 15h8" /></svg>;
  if (state === "PROPERTY_REQUIRED") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-7 7-12a7 7 0 0 0-14 0c0 5 7 12 7 12Z" /><circle cx="12" cy="9" r="2" /></svg>;
  if (["PROMOTED", "IGNORED"].includes(state)) return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d={state === "PROMOTED" ? "m7 12 3 3 7-7" : "M7 12h10"} /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 2v6M17 2v6M3 10h18" /><path d={["POSSIBLE_CANCELLED", "SOURCE_DISAPPEARED", "CONFLICT"].includes(state) ? "m9 13 6 6m0-6-6 6" : "m9 14 3-2 3 2m-3-2v6"} /></svg>;
}
