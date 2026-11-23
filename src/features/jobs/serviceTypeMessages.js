import { normalizeServiceType } from "../../../functions/src/serviceTypes.js";

const messages = {
  en: {
    clientMode: "Client pricing method",
    cleanerMode: "Cleaner pay method",
    clientPriceHourly: "Client price per hour",
    cleanerPayoutHourly: "Cleaner pay per hour",
    missingTypeRate: "A price is missing for this service type. Enter it here or leave it unset.",
    legacyTypeRate: "No price is set for this service type. Review the amounts already entered for this service.",
    keepJobPrices: "Check the job prices. Any side without a property rate keeps its agreed amount.",
    typePriceChange: "Saving this service type applies its property prices to this job.",
    paidPrices: "Approved hours or recorded payouts lock prices and service type. You can remove an approval before the cleaner is paid.",
    field: "Service type",
    editDetails: "Edit service details",
    detailsSaved: "Service details saved.",
    detailsUpdateError: "Unable to update service details. Try again.",
    STANDARD: "Standard (guest turnover)",
    DEEP_CLEANING: "Deep cleaning",
    MOVE_IN_OUT: "Move-out / move-in",
    POST_CONSTRUCTION: "Post-construction",
    AIRBNB_TOUCH_UP: "Airbnb touch-up",
  },
  pt: {
    clientMode: "Forma de cobrança do cliente",
    cleanerMode: "Forma de pagamento da profissional",
    clientPriceHourly: "Preço por hora para o cliente",
    cleanerPayoutHourly: "Pagamento por hora da profissional",
    missingTypeRate: "Falta preço para este tipo de serviço. Preencha o valor ou deixe o campo em branco.",
    legacyTypeRate: "Este tipo de serviço está sem preço definido. Confira os valores já preenchidos neste serviço.",
    keepJobPrices: "Confira os preços do serviço. Se faltar uma tarifa do imóvel, o valor combinado para essa parte será mantido.",
    typePriceChange: "Ao salvar este tipo de serviço, os preços do imóvel serão aplicados a este serviço.",
    paidPrices: "Horas aprovadas ou pagamentos registrados bloqueiam os preços e o tipo de serviço. Você pode remover uma aprovação antes de pagar a profissional.",
    field: "Tipo de serviço",
    editDetails: "Editar detalhes do serviço",
    detailsSaved: "Detalhes do serviço salvos.",
    detailsUpdateError: "Não foi possível atualizar os detalhes do serviço. Tente novamente.",
    STANDARD: "Padrão (troca de hóspedes)",
    DEEP_CLEANING: "Limpeza pesada",
    MOVE_IN_OUT: "Mudança (move-out / move-in)",
    POST_CONSTRUCTION: "Pós-obra",
    AIRBNB_TOUCH_UP: "Airbnb touch-up (retoque)",
  },
  es: {
    clientMode: "Forma de cobro al cliente",
    cleanerMode: "Forma de pago al personal de limpieza",
    clientPriceHourly: "Precio por hora para el cliente",
    cleanerPayoutHourly: "Pago por hora al personal de limpieza",
    missingTypeRate: "Falta un precio para este tipo de servicio. Puedes introducirlo o dejarlo en blanco.",
    legacyTypeRate: "Este tipo de servicio no tiene un precio definido. Revisa los importes ya introducidos para este servicio.",
    keepJobPrices: "Revisa los precios del servicio. Si falta una tarifa de la propiedad, se conserva el importe acordado para esa parte.",
    typePriceChange: "Al guardar este tipo de servicio, se aplicarán los precios de la propiedad a este servicio.",
    paidPrices: "Las horas aprobadas o los pagos registrados bloquean los precios y el tipo de servicio. Puedes quitar una aprobación antes de pagar esas horas.",
    field: "Tipo de servicio",
    editDetails: "Editar detalles del servicio",
    detailsSaved: "Detalles del servicio guardados.",
    detailsUpdateError: "No se pudieron actualizar los detalles del servicio. Inténtalo de nuevo.",
    STANDARD: "Estándar (cambio de huéspedes)",
    DEEP_CLEANING: "Limpieza profunda",
    MOVE_IN_OUT: "Mudanza (entrada / salida)",
    POST_CONSTRUCTION: "Limpieza posobra",
    AIRBNB_TOUCH_UP: "Airbnb touch-up (retoque)",
  },
};

export function serviceTypeMessage(language, key) {
  return (messages[language] || messages.en)[key];
}

export function serviceTypeLabel(language, value) {
  return serviceTypeMessage(language, normalizeServiceType(value));
}
