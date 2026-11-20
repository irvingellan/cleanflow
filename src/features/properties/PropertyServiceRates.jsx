import { Fragment, useId, useState } from "react";
import { serviceTypes } from "../../../functions/src/serviceTypes.js";
import { useTranslation } from "../../i18n/translations.js";
import { maxCleanersPerJob } from "../jobs/offerSlots.js";
import { serviceTypeLabel, serviceTypeMessage } from "../jobs/serviceTypeMessages.js";
import { resolveJobPricing } from "../pricing/pricingModel.js";
import { formatPricingRate, pricingMessage } from "../pricing/pricingMessages.js";
import { parseRateRow, rateRowDraft } from "./propertyRateForm.js";
import "./propertyServiceRates.css";

const teamSizes = Array.from({ length: maxCleanersPerJob }, (_, index) => index + 1);

export function PropertyServiceRates({ property, drafts = {}, onChange }) {
  const { language, translate } = useTranslation();
  const [editing, setEditing] = useState(null);
  const region = useId();
  const msg = (key, values) => pricingMessage(language, key, values);
  const format = (rate) => formatPricingRate(rate, language, translate);

  return (
    <section className="property-rates" aria-labelledby={region}>
      <h3 id={region}>{msg("title")}</h3>
      {onChange && <p>{msg("defaults")}</p>}
      <table aria-labelledby={region}>
        <thead><tr>
          <th scope="col">{serviceTypeMessage(language, "field")}</th>
          <th scope="col">{msg("client")}</th><th scope="col">{msg("cleaner")}</th>
        </tr></thead>
        <tbody>
          {serviceTypes.map((type) => {
            const original = property?.serviceRates?.[type];
            const draft = drafts[type];
            const parsed = draft ? parseRateRow(draft) : { row: original };
            const rates = { ...property?.serviceRates };
            if (parsed.error || (parsed.row && Object.keys(parsed.row).length)) rates[type] = parsed.row || {};
            else delete rates[type];
            const options = { property: { ...property, serviceRates: rates }, cleanerCount: null };
            const pricing = resolveJobPricing({ serviceType: type }, options);
            const label = serviceTypeLabel(language, type);
            const open = editing === type;
            return (
              <Fragment key={type}>
                <tr>
                  <th scope="row">{label}
                    {onChange && <button className="property-rates__edit" type="button"
                      aria-label={`${msg(open ? "close" : "edit")} · ${label}`} aria-expanded={open}
                      onClick={() => setEditing(open ? null : type)}>{msg(open ? "close" : "edit")}</button>}
                  </th>
                  <td>{format(pricing.client)}</td>
                  <td>{format(pricing.cleaner)}
                    {Object.keys(rates[type]?.cleaner?.byCleanerCount ?? {}).map((count) => (
                      <small key={count}>{msg("teamSummary", { count, value: format(resolveJobPricing(
                        { serviceType: type }, { ...options, cleanerCount: Number(count) },
                      ).cleaner) })}</small>
                    ))}
                  </td>
                </tr>
                {onChange && open && <tr><td colSpan="3" className="property-rates__editor">
                  <RateEditor draft={draft || rateRowDraft(original)} msg={msg}
                    onChange={(value) => onChange(type, value)} />
                </td></tr>}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function RateEditor({ draft, msg, onChange }) {
  const [size, setSize] = useState(() => Object.keys(draft.cleaner.byCleanerCount)[0] || "2");
  function update(side, fields) {
    onChange({ ...draft, [side]: { ...draft[side], ...fields } });
  }
  return (
    <div className="property-rates__fields">
      {["client", "cleaner"].map((side) => (
        <fieldset key={side}>
          <legend>{msg(side)}</legend>
          <label>{msg("mode")}
            <select value={draft[side].mode} onChange={(event) => update(side, { mode: event.target.value })}>
              <option value="FIXED">{msg("fixed")}</option><option value="HOURLY">{msg("hourly")}</option>
            </select>
          </label>
          <label>{msg("amount")}
            <input inputMode="decimal" value={draft[side].amount}
              onChange={(event) => update(side, { amount: event.target.value })} />
          </label>
          {side === "cleaner" && <details>
            <summary>{msg("teamRates")}</summary>
            <label>{msg("teamSize")}
              <select value={size} onChange={(event) => setSize(event.target.value)}>
                {teamSizes.map((count) => <option key={count} value={count}>{count}</option>)}
              </select>
            </label>
            <label>{msg("teamAmount")}
              <input inputMode="decimal" value={draft.cleaner.byCleanerCount[size] ?? ""}
                onChange={(event) => update(side, { byCleanerCount: { ...draft.cleaner.byCleanerCount, [size]: event.target.value } })} />
            </label>
          </details>}
        </fieldset>
      ))}
    </div>
  );
}
