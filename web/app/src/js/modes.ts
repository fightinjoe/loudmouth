export const MODES = {
  STUDY: "study",
  REVIEW: "review",
  REVERSE: "reverse",
} as const;

export type Mode = typeof MODES[keyof typeof MODES];

export const DEFAULT_MODE: Mode = MODES.STUDY;

export const MODE_LABELS = {
  [MODES.STUDY]: "Study",
  [MODES.REVIEW]: "Review",
  [MODES.REVERSE]: "Reverse",
} as const satisfies Record<Mode, string>;
