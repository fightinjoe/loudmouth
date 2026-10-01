/** Uses getRandomValues so IDs also work on HTTP development hostnames. */
export function uuid(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Encodes an untrusted value for HTML text or a quoted attribute. */
export function escapeHTML(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);
}

export function relativeTime(isoString: string | null | undefined): string {
  if (!isoString) return "";
  const difference = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(difference / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export function stripHashParam(parameter: string): void {
  const raw = window.location.hash.slice(1) || "deck";
  const [route, queryString] = raw.split("?");
  const parameters = new URLSearchParams(queryString || "");
  parameters.delete(parameter);
  const remaining = parameters.toString();
  window.location.hash = remaining ? `${route}?${remaining}` : route;
}
