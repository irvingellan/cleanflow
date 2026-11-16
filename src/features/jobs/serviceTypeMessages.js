import { normalizeServiceType } from "../../../functions/src/serviceTypes.js";

const messages = {
  en: {
    field: "Service type",
    editDetails: "Edit service details",
    detailsSaved: "Service details saved.",
    detailsUpdateError: "Unable to update service details. Try again.",
    STANDARD: "Standard (guest turnover)",
    DEEP_CLEANING: "Deep cleaning",
    MOVE_IN_OUT: "Move-out / move-in",
    POST_CONSTRUCTION: "Post-construction",
  },
  pt: {
    field: "Tipo de serviço",
    editDetails: "Editar detalhes do serviço",
    detailsSaved: "Detalhes do serviço salvos.",
    detailsUpdateError: "Não foi possível atualizar os detalhes do serviço. Tente novamente.",
    STANDARD: "Padrão (troca de hóspedes)",
    DEEP_CLEANING: "Limpeza pesada",
    MOVE_IN_OUT: "Mudança (move-out / move-in)",
    POST_CONSTRUCTION: "Pós-obra",
  },
  es: {
    field: "Tipo de servicio",
    editDetails: "Editar detalles del servicio",
    detailsSaved: "Detalles del servicio guardados.",
    detailsUpdateError: "No se pudieron actualizar los detalles del servicio. Inténtalo de nuevo.",
    STANDARD: "Estándar (cambio de huéspedes)",
    DEEP_CLEANING: "Limpieza profunda",
    MOVE_IN_OUT: "Mudanza (entrada / salida)",
    POST_CONSTRUCTION: "Limpieza posobra",
  },
};

export function serviceTypeMessage(language, key) {
  return (messages[language] || messages.en)[key];
}

export function serviceTypeLabel(language, value) {
  return serviceTypeMessage(language, normalizeServiceType(value));
}
