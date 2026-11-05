import { StateCard } from "../../components/UiPrimitives.jsx";
import { DataProvenanceBadge } from "../../components/DataProvenanceBadge.jsx";
import { ScrollToTopButton } from "../../components/ScrollToTopButton.jsx";
import { Icon } from "../../components/Icon.jsx";
import { useTranslation } from "../../i18n/translations.js";

export function ClientDirectory({ clients, isLoading, hasError, onCreate, onSelect, canManageExcluded, showExcluded, onToggleExcluded }) {
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
      <header className="cf-page-header directory-heading">
        <div className="cf-page-header__text">
          <h2 id="clients-title" className="list-title">
            {translate("clients.title")}
          </h2>
        </div>
        <div className="cf-page-header__actions">
          {canManageExcluded && <button className="button button--small" type="button" onClick={onToggleExcluded}>{translate(showExcluded ? "archive.hideExcluded" : "archive.showExcluded")}</button>}
          <button className="button button--primary" type="button" onClick={onCreate}>
            <Icon name="plus" size={18} />
            {translate("clients.new")}
          </button>
        </div>
      </header>

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
                <span className="directory-row__meta">
                  {client.archivedAt && <span className="record-archive-badge">{translate("archive.excluded")}</span>}
                  <span className="status-badge">
                    {client.active === false
                      ? translate("common.inactive")
                      : translate("common.active")}
                  </span>
                  <DataProvenanceBadge record={client} />
                </span>
              </button>
            );
          })}
        </div>
      )}
      <ScrollToTopButton />
    </section>
  );
}
