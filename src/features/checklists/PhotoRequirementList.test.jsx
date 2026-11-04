// FB06 (Gabi pilot feedback 2026-11-04): explicit photo requirements, no invented minimum.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PhotoRequirementList } from "./ChecklistPhotoGallery.jsx";
import { translateInLanguage } from "../../i18n/translations.js";

const t = (key, params) => translateInLanguage("pt", key, params);
const requirements = [{ id: "beds", label: "Embaixo das camas" }, { id: "kitchen", label: "Cozinha limpa", hint: "Pia e fogão" }, { id: "towels", label: "Toalhas dobradas" }];

describe("PhotoRequirementList", () => {
  it("renders nothing without a provided list (current pilot Runs)", () => {
    const { container } = render(<PhotoRequirementList requirements={null} saved={[]} translate={t} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows which requirements still miss a photo and counts linked photos", () => {
    render(<PhotoRequirementList requirements={requirements} saved={[{ photoRequirementId: "beds" }, { photoRequirementId: "beds" }, { photoRequirementId: "kitchen" }, { requirementId: "living-belongings" }]} example translate={t} />);
    expect(screen.getByText("2 de 3 feitas")).toBeInTheDocument();
    expect(document.querySelector('[data-requirement="beds"]')).toHaveTextContent("2 foto(s)");
    expect(document.querySelector('[data-requirement="towels"]')).toHaveTextContent("Faltando");
    expect(screen.getByText("Exemplo — lista não publicada")).toBeInTheDocument();
  });
});
