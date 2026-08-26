export function preferredLanguageLabel(preferredLanguage, translate) {
  return {
    en: translate("language.english"),
    pt: translate("language.portuguese"),
    es: translate("language.spanish"),
  }[preferredLanguage] || translate("common.notProvided");
}

export function cleanerTeamTypeLabel(teamType, translate) {
  return {
    SOLO: translate("cleaners.teamTypeSolo"),
    COUPLE: translate("cleaners.teamTypeCouple"),
    TEAM: translate("cleaners.teamTypeTeam"),
  }[teamType] || translate("common.notProvided");
}

export function paymentMethodLabel(paymentMethod, translate) {
  return {
    ZELLE: "Zelle",
    VENMO: "Venmo",
    CASH: translate("cleaners.paymentMethodCash"),
    CHECK: translate("cleaners.paymentMethodCheck"),
    OTHER: translate("cleaners.paymentMethodOther"),
  }[paymentMethod] || translate("common.notProvided");
}
