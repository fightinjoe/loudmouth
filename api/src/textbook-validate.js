/**
 * Validates, parses, and FINISHES the raw string returned by the LLM for
 * /textbook. See docs/API_DESIGN.md "Catchphrase guided phrasebook generation
 * (/textbook)", "3a/3b. Finish [service]".
 *
 * Two response shapes, mirroring the two call modes (textbook-parse.js):
 *   - validateTextbookQuestionsResponse — call 1: { questions[], checklist[] }
 *   - validateTextbookGenerateResponse  — call 2: { groups[] }
 *
 * Same philosophy as lookup-validate.js:
 *   - Malformed structure (bad JSON, wrong types) → THROW → handler maps to
 *     502 "Invalid response from LLM". Truncated response fails JSON.parse
 *     here → 502.
 *   - Over-production → CLAMP, don't throw; trim to caps, keep the model's
 *     returned order, drop from the end, log a warning.
 *   - Call 2 only: `context` is service-set on every card, never model-
 *     emitted — a card's `context` is set to its group's `title`, identical
 *     mechanism to /lookup's group-card context-setting.
 */

const { validateCard, normalizeJapaneseReadingTokens, coalesceSpacedReadingTokens } = require('./card-validate');
const {
  MAX_QUESTIONS,
  MAX_CHECKLIST_ITEMS,
  MAX_GROUPS_TOTAL,
  MAX_CARDS_PER_GROUP,
  MAX_TITLE_LENGTH,
} = require('./textbook-prompt');

const CARD_FORMALITIES = ['casual', 'polite', 'formal', 'slang'];

function stripInvalidFormality(card, prefix, warnings) {
  if (card.formality !== undefined && !CARD_FORMALITIES.includes(card.formality)) {
    warnings.push(`${prefix}.formality stripped (invalid value "${card.formality}")`);
    delete card.formality;
  }
}

function normalizeReadingTokens(lang, tokens) {
  if (tokens === undefined) return tokens;
  if (lang === 'ja') return normalizeJapaneseReadingTokens(tokens);
  if (lang === 'zh') return tokens;
  return coalesceSpacedReadingTokens(tokens);
}

function normalizeCard(card) {
  const normalized = { ...card };
  if (normalized.reading !== undefined) {
    normalized.reading = normalizeReadingTokens(normalized.lang, normalized.reading);
  }
  if (normalized.example?.reading !== undefined) {
    normalized.example = {
      ...normalized.example,
      reading: normalizeReadingTokens(normalized.lang, normalized.example.reading),
    };
  }
  return normalized;
}

function parseJsonResponse(raw) {
  if (typeof raw !== 'string') {
    throw new Error(`Expected string from LLM, got ${typeof raw}`);
  }
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    // Truncation (max_tokens) lands here — invalid/incomplete JSON.
    throw new Error(`JSON parse failed: ${err.message}. Raw (first 500 chars): ${cleaned.slice(0, 500)}`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Response is not a JSON object');
  }
  return parsed;
}

/**
 * Call 1 — validate + clamp { questions[], checklist[] }.
 *
 * @param {string} raw
 * @returns {{ response: { questions: object[], checklist: object[] }, warnings: string[] }}
 * @throws {Error} on structurally invalid / truncated responses
 */
function validateTextbookQuestionsResponse(raw) {
  const parsed = parseJsonResponse(raw);
  const warnings = [];

  let { questions, checklist } = parsed;
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error('"questions" must be a non-empty array');
  }
  if (!Array.isArray(checklist) || checklist.length === 0) {
    throw new Error('"checklist" must be a non-empty array');
  }

  if (questions.length > MAX_QUESTIONS) {
    warnings.push(`clamped questions ${questions.length} → ${MAX_QUESTIONS}`);
    questions = questions.slice(0, MAX_QUESTIONS);
  }
  if (checklist.length > MAX_CHECKLIST_ITEMS) {
    warnings.push(`clamped checklist ${checklist.length} → ${MAX_CHECKLIST_ITEMS}`);
    checklist = checklist.slice(0, MAX_CHECKLIST_ITEMS);
  }

  const validatedQuestions = questions.map((q, qi) => {
    const prefix = `questions[${qi}]`;
    if (typeof q !== 'object' || q === null || Array.isArray(q)) {
      throw new Error(`${prefix} must be an object`);
    }
    if (typeof q.label !== 'string' || !q.label.trim()) {
      throw new Error(`${prefix}.label must be a non-empty string`);
    }
    if (!Array.isArray(q.options) || q.options.length === 0
      || q.options.some((o) => typeof o !== 'string' || !o.trim())) {
      throw new Error(`${prefix}.options must be a non-empty array of non-empty strings`);
    }
    if (typeof q.default !== 'string' || !q.options.includes(q.default)) {
      throw new Error(`${prefix}.default must be one of ${prefix}.options`);
    }
    return { label: q.label.trim(), options: q.options.map((o) => o.trim()), default: q.default.trim() };
  });

  const validatedChecklist = checklist.map((item, ii) => {
    const prefix = `checklist[${ii}]`;
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new Error(`${prefix} must be an object`);
    }
    if (typeof item.label !== 'string' || !item.label.trim()) {
      throw new Error(`${prefix}.label must be a non-empty string`);
    }
    return { label: item.label.trim(), checked: item.checked === true };
  });

  return {
    response: { questions: validatedQuestions, checklist: validatedChecklist },
    warnings,
  };
}

/**
 * Call 2 — validate + clamp { groups[] }, setting card.context from each
 * group's title (service-set, never model-emitted — same rule as /lookup).
 *
 * @param {string} raw
 * @returns {{ response: { groups: object[] }, warnings: string[] }}
 * @throws {Error} on structurally invalid / truncated responses
 */
function validateTextbookGenerateResponse(raw) {
  const parsed = parseJsonResponse(raw);
  const warnings = [];

  let { groups } = parsed;
  if (!Array.isArray(groups) || groups.length === 0) {
    throw new Error('"groups" must be a non-empty array');
  }

  if (groups.length > MAX_GROUPS_TOTAL) {
    warnings.push(`clamped groups ${groups.length} → ${MAX_GROUPS_TOTAL}`);
    groups = groups.slice(0, MAX_GROUPS_TOTAL);
  }

  // Optional top-level phrasebook title (added by the "name the phrasebook"
  // prompt step). Non-critical: a missing/blank title is NOT a 502 — the
  // client falls back to the raw topic — so absence is silent, only a
  // present-but-oversized/wrong-typed value warns.
  let title;
  if (parsed.title !== undefined) {
    if (typeof parsed.title !== 'string' || !parsed.title.trim()) {
      warnings.push('ignored non-string/empty title');
    } else {
      title = parsed.title.trim();
      if (title.length > MAX_TITLE_LENGTH) {
        warnings.push(`clamped title ${title.length} → ${MAX_TITLE_LENGTH}`);
        title = title.slice(0, MAX_TITLE_LENGTH).trim();
      }
    }
  }

  const validatedGroups = [];
  for (let gi = 0; gi < groups.length; gi++) {
    const prefix = `groups[${gi}]`;
    const kept = validateAndCleanGroup(groups[gi], prefix, warnings);
    if (kept) validatedGroups.push(kept);
  }

  return {
    response: { ...(title ? { title } : {}), groups: validatedGroups },
    warnings,
  };
}

/**
 * Validate + clean one group. Returns the cleaned group, or null to signal
 * "drop it" — same drop-not-throw posture as lookup-validate.js's group
 * handling (not an object / missing title / zero cards after clamping).
 */
function validateAndCleanGroup(group, prefix, warnings) {
  if (typeof group !== 'object' || group === null || Array.isArray(group)) {
    warnings.push(`${prefix} dropped (not an object)`);
    return null;
  }
  if (typeof group.title !== 'string' || !group.title.trim()) {
    warnings.push(`${prefix} dropped (title must be a non-empty string)`);
    return null;
  }
  if (!Array.isArray(group.cards)) {
    warnings.push(`${prefix} dropped (cards must be an array)`);
    return null;
  }

  const title = group.title.trim();
  let cards = group.cards;

  if (cards.length > MAX_CARDS_PER_GROUP) {
    warnings.push(`${prefix} clamped cards ${cards.length} → ${MAX_CARDS_PER_GROUP}`);
    cards = cards.slice(0, MAX_CARDS_PER_GROUP);
  }

  if (cards.length === 0) {
    warnings.push(`${prefix} dropped (empty)`);
    return null;
  }

  cards.forEach((card, ci) => validateCard(card, `${prefix}.cards[${ci}]`));

  cards = cards.map((c) => {
    const cleaned = normalizeCard(c);
    stripInvalidFormality(cleaned, `${prefix}.cards`, warnings);
    // Service sets `context` on every card from the group title — same
    // mechanism as /lookup's group-card context-setting.
    cleaned.context = title;
    return cleaned;
  });

  return { title, cards };
}

module.exports = { validateTextbookQuestionsResponse, validateTextbookGenerateResponse };
