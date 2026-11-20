const pullsEndpoint = "https://api.github.com/repos/irvingellan/cleanflow/pulls";
const perPage = 50;

async function readPulls(state, signal, fetcher) {
  const records = new Map();
  for (let page = 1; ; page++) {
    const params = new URLSearchParams({ state, sort: "updated", direction: "desc", per_page: String(perPage), page: String(page) });
    const response = await fetcher(pullsEndpoint + "?" + params, {
      signal, credentials: "omit", referrerPolicy: "no-referrer", redirect: "error",
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) throw new Error("Public release information unavailable");
    const items = await response.json();
    for (const item of items) {
      if (!Number.isSafeInteger(item.number) || typeof item.title !== "string") continue;
      if (state === "closed" && !item.merged_at) continue;
      records.set(item.number, { number: item.number, title: item.title, mergedAt: item.merged_at ?? null });
    }
    if (items.length < perPage) break;
    // Older updates cannot hide a newer merge: a merge is itself an update.
    if (state === "closed" && records.size >= 5) {
      const newest = [...records.values()].sort((a, b) => b.mergedAt.localeCompare(a.mergedAt));
      if (newest[4].mergedAt >= items.at(-1).updated_at) break;
    }
  }
  const rows = [...records.values()];
  return state === "closed" ? rows.sort((a, b) => b.mergedAt.localeCompare(a.mergedAt)).slice(0, 5) : rows;
}

export async function readPlatformReleases(signal, fetcher = fetch) {
  const [open, merged] = await Promise.all(["open", "closed"].map(state => readPulls(state, signal, fetcher)));
  return { open, merged };
}
