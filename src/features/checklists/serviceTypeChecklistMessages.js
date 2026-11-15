const messages = {
  pt: {
    "serviceTypeChecklist.deep-cleaning": "Limpeza pesada",
    "serviceTypeChecklist.deep-cleaning.buildup": "Remova o acúmulo de gordura e sujeira",
    "serviceTypeChecklist.deep-cleaning.bathroom": "Esfregue os rejuntes e remova o calcário do banheiro",
    "serviceTypeChecklist.deep-cleaning.baseboards": "Limpe rodapés e superfícies tocadas com frequência",
    "serviceTypeChecklist.deep-cleaning.behind-appliances": "Limpe atrás e embaixo de eletrodomésticos e móveis acessíveis",
    "serviceTypeChecklist.move-in-out": "Mudança",
    "serviceTypeChecklist.move-in-out.cabinets": "Limpe por dentro de armários e gavetas",
    "serviceTypeChecklist.move-in-out.appliances": "Limpe por dentro dos eletrodomésticos",
    "serviceTypeChecklist.move-in-out.baseboards-walls": "Limpe os rodapés e confira as paredes",
    "serviceTypeChecklist.post-construction": "Pós-obra",
    "serviceTypeChecklist.post-construction.fine-dust": "Remova a poeira fina de superfícies e cantos",
    "serviceTypeChecklist.post-construction.paint-adhesives": "Verifique e remova resíduos de tinta e adesivos",
    "serviceTypeChecklist.post-construction.windows-tracks": "Limpe janelas e trilhos",
    "serviceTypeChecklist.post-construction.drains": "Verifique e limpe os ralos",
    "serviceTypeChecklist.post-construction.filters-vents": "Verifique filtros e respiros acessíveis",
  },
  es: {
    "serviceTypeChecklist.deep-cleaning": "Limpieza profunda",
    "serviceTypeChecklist.deep-cleaning.buildup": "Elimina la grasa y la suciedad acumuladas",
    "serviceTypeChecklist.deep-cleaning.bathroom": "Frota las juntas y elimina la cal del baño",
    "serviceTypeChecklist.deep-cleaning.baseboards": "Limpia los zócalos y las superficies de contacto frecuente",
    "serviceTypeChecklist.deep-cleaning.behind-appliances": "Limpia detrás y debajo de electrodomésticos y muebles accesibles",
    "serviceTypeChecklist.move-in-out": "Mudanza",
    "serviceTypeChecklist.move-in-out.cabinets": "Limpia el interior de armarios y cajones",
    "serviceTypeChecklist.move-in-out.appliances": "Limpia el interior de los electrodomésticos",
    "serviceTypeChecklist.move-in-out.baseboards-walls": "Limpia los zócalos y revisa las paredes",
    "serviceTypeChecklist.post-construction": "Limpieza posobra",
    "serviceTypeChecklist.post-construction.fine-dust": "Elimina el polvo fino de superficies y rincones",
    "serviceTypeChecklist.post-construction.paint-adhesives": "Revisa y elimina los restos de pintura y adhesivos",
    "serviceTypeChecklist.post-construction.windows-tracks": "Limpia las ventanas y sus rieles",
    "serviceTypeChecklist.post-construction.drains": "Revisa y limpia los desagües",
    "serviceTypeChecklist.post-construction.filters-vents": "Revisa los filtros y las rejillas de ventilación accesibles",
  },
};

export function withServiceTypeChecklistMessages(translate, language) {
  const localized = messages[language];
  return (key, replacements) => localized && Object.hasOwn(localized, key)
    ? localized[key]
    : translate(key, replacements);
}

// Property text stays verbatim. Type-template keys use their translation when
// available, with the English label stored in the frozen Run as the fallback.
export function checklistDefinitionText(translate, key, literal) {
  if (literal && (typeof key !== "string" || !key.startsWith("serviceTypeChecklist."))) return literal;
  const translated = translate(key);
  return translated === key && literal ? literal : translated;
}
