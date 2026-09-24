// Matches the API ability enum. Historical setup levels are not inferred.
export const ABILITIES = ["none", "basics", "conversational"] as const;

export type Ability = typeof ABILITIES[number];

export const ABILITY_LABELS = {
  none: "None",
  basics: "Basics",
  conversational: "Conversational",
} as const satisfies Record<Ability, string>;

export const ABILITY_QUESTION = "What is your language ability?";

export function isAbility(value: unknown): value is Ability {
  return value === "none" || value === "basics" || value === "conversational";
}
