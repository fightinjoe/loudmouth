// Inline-SVG icon registry.
//
// Icons are authored as individual SVG files under `src/icons/` (exported from
// the Figma "Icons" component set — Material Symbols — plus a few app-only
// utility glyphs). They are inlined at build time via Vite's `?raw` glob so the
// markup renders directly in the DOM: this is required for the SVGs to paint at
// all (an external `<use href="file.svg">` reference renders nothing in
// browsers without a fragment id) and lets every icon inherit `currentColor`
// and size from CSS.
//
// All source SVGs are normalized to a square viewBox with the glyph centred,
// fill="currentColor", and no hardcoded width/height — sizing is CSS-driven via
// the `.icon` class (see styles/components.css).

const modules = import.meta.glob("../icons/*.svg", {
  query: "?raw",
  import: "default",
  eager: true,
});

const REGISTRY = Object.create(null);
for (const [path, raw] of Object.entries(modules)) {
  const name = path.slice(path.lastIndexOf("/") + 1, -".svg".length);
  REGISTRY[name] = raw.trim();
}

/**
 * Returns an inline SVG string for the named icon, ready to interpolate into an
 * HTML template. Names are the kebab-case file stems in `src/icons/`.
 *
 * @param {string} name - icon name (e.g. "search", "book-selected")
 * @param {{ className?: string, size?: "sm" | "lg" }} [opts]
 * @returns {string} inline `<svg>` markup (empty string for unknown names)
 */
export function icon(name, { className = "", size } = {}) {
  const raw = REGISTRY[name];
  if (!raw) {
    console.warn(`icon: unknown icon "${name}"`);
    return "";
  }
  const cls = ["icon", size && `icon--${size}`, className].filter(Boolean).join(" ");
  return raw.replace("<svg", `<svg class="${cls}" aria-hidden="true" focusable="false"`);
}

/** All registered icon names — handy for tests and tooling. */
export function iconNames() {
  return Object.keys(REGISTRY);
}
