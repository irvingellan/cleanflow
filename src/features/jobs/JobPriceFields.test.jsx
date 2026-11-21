import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { TranslationProvider } from "../../i18n/translations.js";
import { JobPriceFields } from "./JobPriceFields.jsx";

function Harness({ initial }) {
  const [values, setValues] = useState(initial);
  return <TranslationProvider>
    <JobPriceFields values={values} onChange={(event) => {
      const { name, value } = event.target;
      setValues((current) => ({ ...current, [name]: value }));
    }} />
    <output data-testid="values">{JSON.stringify(values)}</output>
  </TranslationProvider>;
}

const current = () => JSON.parse(screen.getByTestId("values").textContent);

describe("job price fields", () => {
  it("prefills the standard $45 client and $25 cleaner rates when switching to hourly", () => {
    render(<Harness initial={{ clientMode: "FIXED", clientPrice: "180", cleanerMode: "FIXED", cleanerPayout: "100" }} />);
    const [clientMode, cleanerMode] = screen.getAllByRole("combobox");
    fireEvent.change(clientMode, { target: { value: "HOURLY" } });
    fireEvent.change(cleanerMode, { target: { value: "HOURLY" } });
    expect(current()).toMatchObject({ clientMode: "HOURLY", clientPrice: "45", cleanerMode: "HOURLY", cleanerPayout: "25" });
  });

  it("keeps an edited hourly rate and leaves amounts alone when switching to fixed", () => {
    render(<Harness initial={{ clientMode: "HOURLY", clientPrice: "50", cleanerMode: "FIXED", cleanerPayout: "100" }} />);
    const [clientMode] = screen.getAllByRole("combobox");
    fireEvent.change(clientMode, { target: { value: "FIXED" } });
    expect(current()).toMatchObject({ clientMode: "FIXED", clientPrice: "50", cleanerPayout: "100" });
  });
});
