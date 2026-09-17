const CACHE_PREFIX = "loudmouth.phrase-breakdown.v1:";

export function cardRequest(card) {
  const request = {
    language: String(card?.lang ?? ""),
    text: String(card?.text ?? ""),
    translation: String(card?.translation ?? ""),
  };
  if (typeof card?.context === "string") request.context = card.context;
  return request;
}

function validString(value, max) {
  return typeof value === "string" && value.length <= max && value.trim().length > 0;
}

function splitsSurrogate(text, offset) {
  if (offset <= 0 || offset >= text.length) return false;
  const before = text.charCodeAt(offset - 1);
  const after = text.charCodeAt(offset);
  return before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff;
}

export function normalizeBreakdown(value, text) {
  if (!value || !Array.isArray(value.chunks) || value.chunks.length < 1 || value.chunks.length > 32) return null;
  let end = 0;
  const chunks = [];
  for (const chunk of value.chunks) {
    if (!chunk || !Number.isInteger(chunk.start) || !Number.isInteger(chunk.end)
      || chunk.start < end || chunk.start < 0 || chunk.end <= chunk.start || chunk.end > text.length
      || splitsSurrogate(text, chunk.start) || splitsSurrogate(text, chunk.end)
      || chunk.text !== text.slice(chunk.start, chunk.end)
      || !validString(chunk.text, 2000) || !validString(chunk.gloss, 500)
      || !validString(chunk.role, 200) || !validString(chunk.explanation, 1000)
      || /[^\p{P}\p{White_Space}]/u.test(text.slice(end, chunk.start))) return null;
    chunks.push({
      start: chunk.start,
      end: chunk.end,
      text: chunk.text,
      gloss: chunk.gloss,
      role: chunk.role,
      explanation: chunk.explanation,
    });
    end = chunk.end;
  }
  if (/[^\p{P}\p{White_Space}]/u.test(text.slice(end))) return null;

  let pattern;
  if (value.pattern != null) {
    const source = value.pattern;
    if (!source || !validString(source.formula, 500) || !validString(source.explanation, 1000)
      || Object.hasOwn(source, "noteTitle") !== Object.hasOwn(source, "note")
      || Object.hasOwn(source, "example") !== Object.hasOwn(source, "exampleTranslation")
      || (Object.hasOwn(source, "noteTitle") && !validString(source.noteTitle, 200))
      || (Object.hasOwn(source, "note") && !validString(source.note, 1000))
      || (Object.hasOwn(source, "example") && !validString(source.example, 2000))
      || (Object.hasOwn(source, "exampleTranslation") && !validString(source.exampleTranslation, 2000))) return null;
    pattern = {
      formula: source.formula,
      explanation: source.explanation,
      ...(source.noteTitle != null ? { noteTitle: source.noteTitle } : {}),
      ...(source.note != null ? { note: source.note } : {}),
      ...(source.example != null ? { example: source.example } : {}),
      ...(source.exampleTranslation != null ? { exampleTranslation: source.exampleTranslation } : {}),
    };
  }
  return { chunks, ...(pattern ? { pattern } : {}) };
}

function cacheKey(request) {
  return `${CACHE_PREFIX}${JSON.stringify(request)}`;
}

export function readCache(request) {
  try {
    const key = cacheKey(request);
    const cached = sessionStorage.getItem(key);
    if (!cached) return null;
    const value = normalizeBreakdown(JSON.parse(cached), request.text);
    if (!value) sessionStorage.removeItem(key);
    return value;
  } catch {
    return null;
  }
}

export function writeCache(request, breakdown) {
  try { sessionStorage.setItem(cacheKey(request), JSON.stringify(breakdown)); } catch { /* cache is best-effort */ }
}
