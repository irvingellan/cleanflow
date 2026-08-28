import { StateCard } from "../../components/UiPrimitives.jsx";
import { useTranslation } from "../../i18n/translations.js";

export function ClientDirectory({ clients, isLoading, hasError, onCreate, onSelect }) {
  const { translate } = useTranslation();

  if (isLoading) {
    return <StateCard message={translate("clients.loading")} status="status" />;
  }

  if (hasError) {
    return <StateCard message={translate("clients.error")} status="alert" isError />;
  }

  const sortedClients = [...clients].sort((firstClient, secondClient) =>
    (firstClient.name || "").localeCompare(secondClient.name || ""),
  );

  return (
    <section aria-labelledby="clients-title">
      <div className="directory-heading">
        <div>
          <p className="eyebrow">{translate("navigation.clients")}</p>
          <h2 id="clients-title" className="list-title">
            {translate("clients.title")}
          </h2>
        </div>
        <button className="button button--primary" type="button" onClick={onCreate}>
          {translate("clients.new")}
        </button>
      </div>

      {sortedClients.length === 0 ? (
        <StateCard message={translate("clients.empty")} />
      ) : (
        <div className="client-directory">
          {sortedClients.map((client) => {
            const clientName = client.name || translate("common.notProvided");

            return (
              <button
                key={client.id}
                className="client-card"
                type="button"
                aria-label={translate("clients.view", { client: clientName })}
                onClick={() => onSelect(client)}
              >
                <strong>{clientName}</strong>
                <span className="status-badge">
                  {client.active === false
                    ? translate("common.inactive")
                    : translate("common.active")}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
