import { escapeHTML } from "../js/utils";

export type IconSize = "sm" | "lg";

export interface IconOptions {
  className?: string;
  size?: IconSize;
}

const modules = import.meta.glob<string>("../icons/*.svg", {
  query: "?raw",
  import: "default",
  eager: true,
});

const REGISTRY: Record<string, string> = Object.create(null);
for (const [path, raw] of Object.entries(modules)) {
  const name = path.slice(path.lastIndexOf("/") + 1, -".svg".length);
  REGISTRY[name] = raw.trim();
}

/** Returns inline SVG markup for a registered icon name. */
export function icon(
  name: string,
  { className = "", size }: IconOptions = {},
): string {
  const raw = REGISTRY[name];
  if (!raw) {
    console.warn(`icon: unknown icon "${name}"`);
    return "";
  }

  const classes = ["icon", size && `icon--${size}`, className].filter(Boolean).join(" ");
  return raw.replace(
    "<svg",
    `<svg class="${escapeHTML(classes)}" aria-hidden="true" focusable="false"`,
  );
}

/** All registered icon names. */
export function iconNames(): string[] {
  return Object.keys(REGISTRY);
}
