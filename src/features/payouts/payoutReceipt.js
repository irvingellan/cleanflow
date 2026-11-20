export function payoutTimestamp(value) {
  try {
    let milliseconds;
    if (value instanceof Date) milliseconds = value.getTime();
    else if (typeof value?.toMillis === "function") milliseconds = value.toMillis();
    else if (Number.isFinite(value?.seconds)) milliseconds = value.seconds * 1000;
    else if (typeof value === "string" && value.trim()) milliseconds = Date.parse(value);
    return Number.isFinite(milliseconds) && milliseconds > 0 ? milliseconds : null;
  } catch {
    return null;
  }
}

/** An authenticated manager receipt proves only its explicitly allocated amount for this Job. */
export function recordedShareCents(payout, jobId) {
  if (!Array.isArray(payout?.jobIds) || payout.jobIds.filter(id => id === jobId).length !== 1
    || typeof payout.amount !== "number" || payout.amount < 0) return null;
  const amount = Math.round(payout.amount * 100);
  if (!Number.isSafeInteger(amount) || Math.abs(amount - payout.amount * 100) > 0.000001) return null;
  const lines = payout.jobAmountsCents;
  if (lines == null) return payout.jobIds.length === 1 ? amount : null;
  if (typeof lines !== "object" || Array.isArray(lines) || Object.keys(lines).length !== payout.jobIds.length
    || new Set(payout.jobIds).size !== payout.jobIds.length) return null;
  let sum = 0;
  for (const id of payout.jobIds) {
    if (typeof id !== "string" || !id.trim() || !Object.hasOwn(lines, id) || !Number.isSafeInteger(lines[id]) || lines[id] <= 0) return null;
    sum += lines[id];
  }
  return Number.isSafeInteger(sum) && sum === amount && Object.hasOwn(lines, jobId) ? lines[jobId] : null;
}
