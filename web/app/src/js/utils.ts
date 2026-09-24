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
