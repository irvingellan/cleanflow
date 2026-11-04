import type { Command, Locale, World } from "../engine/types.ts";
import type { Preconditions } from "../engine/world.ts";

export type Localized = Record<Locale, string>;

export function L(pt: string, en: string, es: string): Localized {
  return { pt, en, es };
}

/** Canonical-map status. "LAB" marks adversarial failure tests (not a product item). */
export type ProductStatus = "PUBLISHED" | "IN_APP" | "PENDING" | "DISCUSS" | "NO_PUSH" | "LAB";

export type ScenarioLabel = "manager" | "cleaner" | "offer" | "checklist" | "access" | "push" | "offline" | "reminder";

export interface ScenarioCheck {
  id: string;
  text: Localized;
  test: (w: World) => boolean;
}

export interface ScriptStep {
  command: Command;
  /** true when this step is an explicit "simulate display/click" — never implied. */
  explicit?: boolean;
}

export interface Scenario {
  id: string;
  group: "manager" | "cleaner" | "failure";
  name: Localized;
  event: Localized;
  expectedResult: Localized;
  /** What exists in the real product today, per the canonical map. */
  reality: Localized;
  realProductStatus: ProductStatus[];
  /** true unless every notification behavior shown is already published. */
  proposal: boolean;
  labels: ScenarioLabel[];
  preconditions: Preconditions;
  preconditionText: Localized[];
  script: ScriptStep[];
  expectedRecipients: string[];
  checks: ScenarioCheck[];
  /** Extra phone to show next to Gabi / Ana / Bia. */
  extraDevice?: string;
  gabiView?: Localized;
}
