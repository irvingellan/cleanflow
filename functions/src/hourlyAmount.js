/** Multiply integer cents per hour by minutes and round half-up to a cent. */
export function hourlyAmountCents(rateCents, minutes) {
  if (!Number.isSafeInteger(rateCents) || rateCents < 0 || rateCents > 10_000_000
    || !Number.isSafeInteger(minutes) || minutes < 0
    || !Number.isSafeInteger(rateCents * minutes + 30)) return null;
  return Math.floor((rateCents * minutes + 30) / 60);
}
