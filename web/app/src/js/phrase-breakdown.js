const CACHE_PREFIX = "loudmouth.phrase-breakdown.v2:";

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

function normalizedString(value, max) {
  return validString(value, max) ? value.trim() : null;
}

function meaningfulText(value) {
  return /[^\p{P}\p{White_Space}]/u.test(value);
}

function normalizeLearningItem(value, chunkText, language) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.hasOwn(value, "chunkIndex")
    || typeof value.surface !== "string" || value.surface.length > 2000
    || value.surface.trim() !== value.surface || !meaningfulText(value.surface)
    || !chunkText.includes(value.surface)) return null;
  const text = normalizedString(value.text, 2000);
  const meaning = normalizedString(value.meaning, 500);
  if (!text || !meaning) return null;
  const requiresReading = language === "ja" || language === "zh";
  if (requiresReading) {
    const reading = normalizedString(value.reading, 2000);
    return reading ? { surface: value.surface, text, meaning, reading } : null;
  }
  if (Object.hasOwn(value, "reading")) return null;
  return { surface: value.surface, text, meaning };
}

function splitsSurrogate(text, offset) {
  if (offset <= 0 || offset >= text.length) return false;
  const before = text.charCodeAt(offset - 1);
  const after = text.charCodeAt(offset);
  return before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff;
}

export function normalizeBreakdown(value, text, language) {
  if (!value || typeof value !== "object" || Array.isArray(value) || typeof text !== "string"
    || !["ja", "zh", "es", "cs"].includes(language)
    || Object.hasOwn(value, "pattern") || Object.hasOwn(value, "learningItems")
    || !Array.isArray(value.chunks) || value.chunks.length < 1 || value.chunks.length > 32) return null;
  let end = 0;
  const chunks = [];
  for (const chunk of value.chunks) {
    if (!chunk || typeof chunk !== "object" || Array.isArray(chunk)
      || !Number.isInteger(chunk.start) || !Number.isInteger(chunk.end)
      || chunk.start < end || chunk.start < 0 || chunk.end <= chunk.start || chunk.end > text.length
      || splitsSurrogate(text, chunk.start) || splitsSurrogate(text, chunk.end)
      || chunk.text !== text.slice(chunk.start, chunk.end)
      || chunk.text.length > 2000
      || !Array.isArray(chunk.learningItems) || chunk.learningItems.length > 32
      || /[^\p{P}\p{White_Space}]/u.test(text.slice(end, chunk.start))) return null;
    end = chunk.end;
    if (!meaningfulText(chunk.text)) {
      if (chunk.learningItems.length) return null;
      continue;
    }
    const gloss = normalizedString(chunk.gloss, 500);
    const role = normalizedString(chunk.role, 200);
    const explanation = normalizedString(chunk.explanation, 1000);
    if (!gloss || !role || !explanation) return null;
    const learningItems = [];
    for (const item of chunk.learningItems) {
      const normalized = normalizeLearningItem(item, chunk.text, language);
      if (!normalized) return null;
      learningItems.push(normalized);
    }
    chunks.push({
      start: chunk.start,
      end: chunk.end,
      text: chunk.text,
      gloss,
      role,
      explanation,
      learningItems,
    });
  }
  if (!chunks.length || /[^\p{P}\p{White_Space}]/u.test(text.slice(end))) return null;
  return { chunks };
}

function cacheKey(request) {
  return `${CACHE_PREFIX}${JSON.stringify(request)}`;
}

export function readCache(request) {
  try {
    const key = cacheKey(request);
    const cached = sessionStorage.getItem(key);
    if (!cached) return null;
    const value = normalizeBreakdown(JSON.parse(cached), request.text, request.language);
    if (!value) sessionStorage.removeItem(key);
    return value;
  } catch {
    return null;
  }
}

export function writeCache(request, breakdown) {
  try { sessionStorage.setItem(cacheKey(request), JSON.stringify(breakdown)); } catch { /* cache is best-effort */ }
}
