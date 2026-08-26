export function formatIssueCategory(category, translate = null) {
  const key = {
    ACCESS: "issueCategory.access",
    SUPPLIES: "issueCategory.supplies",
    BROKEN_ITEM: "issueCategory.brokenItem",
    HEAVY_CLEANING: "issueCategory.heavyCleaning",
    OTHER: "issueCategory.other",
  }[category];

  return key && translate ? translate(key) : category || "Not provided";
}

export function issueIconName(category) {
  return {
    ACCESS: "key",
    SUPPLIES: "package",
    BROKEN_ITEM: "wrench",
    HEAVY_CLEANING: "sparkle",
    OTHER: "alert",
  }[category] || "alert";
}
