/**
 * Validates, parses, and FINISHES the raw string returned by the LLM for
 * /lookup. See docs/API_DESIGN.md "3. Finish [service]".
 *
 * Philosophy:
 *   - Malformed structure (bad JSON, wrong types, invalid cards) → THROW.
 *     The handler maps a throw to 502 "Invalid response from LLM". A truncated
 *     response (the max_tokens trap) fails JSON.parse here → 502.
 *   - Over-production → CLAMP, don't throw. Too many blocks/groups/cards is the
 *     model being generous, not broken; trim to the caps, keep the model's
 *     returned order, drop from the end, and log a warning.
 *   - A group with zero cards after clamping → DROP the group (no other
 *     minimum enforced).
 *   - `context` is service-set, never model-emitted: a block card gets the
 *     input term's parenthetical (if any); a group card gets its group's title.
 *   - An invalid per-card `formality` is STRIPPED (not thrown) — the card
 *     itself may still be well-formed.
 *
 * PIPELINE
 *   raw string
 *     │  strip code fences, JSON.parse            (throw → 502)
 *     ▼
 *   { blocks[] }
 *     │  clamp blocks to MAX_BLOCKS
 *     │  per block: validate card, validate + clamp groups,
 *     │             enforce running group budget, set context
 *     ▼
 *   clamped { blocks[] }   +   warnings[] (for the handler to log)
 */

const { validateCard } = require('./card-validate');
const { MAX_BLOCKS, MAX_GROUPS_TOTAL, MAX_CARDS_PER_GROUP } = require('./lookup-prompt');

// Output-only formality values a /lookup card may carry (docs/API_DESIGN.md
// "formality"). `vulgar` is a valid CARD_SCHEMA value in general but is not a
// valid /lookup output — stripped like any other out-of-range value.
const CARD_FORMALITIES = ['casual', 'polite', 'formal', 'slang'];

function stripInvalidFormality(card, prefix, warnings) {
  if (card.formality !== undefined && !CARD_FORMALITIES.includes(card.formality)) {
    warnings.push(`${prefix}.formality stripped (invalid value "${card.formality}")`);
    delete card.formality;
  }
}

/**
 * @param {string} raw
 * @param {{ context?: string }} [opts]   the input term's parsed parenthetical,
 *   set (per docs/API_DESIGN.md "Card") on every block card's `context`.
 * @returns {{ response: { blocks: object[] }, warnings: string[] }}
 * @throws {Error} on structurally invalid / truncated responses
 */
function validateLookupResponse(raw, { context = '' } = {}) {
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

  let { blocks } = parsed;
  if (!Array.isArray(blocks) || blocks.length === 0) {
    throw new Error('"blocks" must be a non-empty array');
  }

  const warnings = [];

  // Clamp block count — keep the first MAX_BLOCKS, in returned order.
  if (blocks.length > MAX_BLOCKS) {
    warnings.push(`clamped blocks ${blocks.length} → ${MAX_BLOCKS}`);
    blocks = blocks.slice(0, MAX_BLOCKS);
  }

  let groupBudget = MAX_GROUPS_TOTAL; // shared across all blocks

  const validatedBlocks = blocks.map((block, bi) => {
    const prefix = `blocks[${bi}]`;

    if (typeof block !== 'object' || block === null || Array.isArray(block)) {
      throw new Error(`${prefix} must be an object`);
    }

    // Block card (throws on malformed).
    validateCard(block.card, `${prefix}.card`);
    const card = { ...block.card };
    stripInvalidFormality(card, `${prefix}.card`, warnings);

    // Service sets `context` on a block card from the input parenthetical —
    // the model never emits it; overwrite/strip unconditionally.
    if (context) {
      card.context = context;
    } else {
      delete card.context;
    }

    const rawGroups = Array.isArray(block.groups) ? block.groups : [];
    const groups = [];

    for (let gi = 0; gi < rawGroups.length; gi++) {
      if (groupBudget <= 0) {
        warnings.push(`${prefix}: dropped remaining groups (total group budget ${MAX_GROUPS_TOTAL} exhausted)`);
        break;
      }
      const gPrefix = `${prefix}.groups[${gi}]`;
      const kept = validateAndCleanGroup(rawGroups[gi], gPrefix, warnings);
      if (kept) {
        groups.push(kept);
        groupBudget--;
      }
    }

    return { card, groups };
  });

  return {
    response: { blocks: validatedBlocks },
    warnings,
  };
}

/**
 * Validate + clean one group. Returns the cleaned group, or null to signal
 * "drop it". Drops (not throws) on: not an object, missing title, or zero
 * cards after clamping — no other minimum is enforced (docs/API_DESIGN.md
 * "3. Finish"). Throws only on a structurally invalid Card within the kept
 * cards, which indicates a broken response, not a droppable group.
 *
 * Groups are NOT word/phrase-typed — a group may mix words and phrases — so
 * there is no type check here. The service sets each card's `context` to the
 * group `title` (the model does not emit `context`).
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

  // Clamp card count — keep the first MAX_CARDS_PER_GROUP, in returned order.
  if (cards.length > MAX_CARDS_PER_GROUP) {
    warnings.push(`${prefix} clamped cards ${cards.length} → ${MAX_CARDS_PER_GROUP}`);
    cards = cards.slice(0, MAX_CARDS_PER_GROUP);
  }

  if (cards.length === 0) {
    warnings.push(`${prefix} dropped (empty)`);
    return null;
  }

  // Validate each kept card (throws on malformed).
  cards.forEach((card, ci) => validateCard(card, `${prefix}.cards[${ci}]`));

  cards = cards.map((c) => {
    const cleaned = { ...c };
    stripInvalidFormality(cleaned, `${prefix}.cards`, warnings);
    // Service sets `context` on every group card from the group title.
    cleaned.context = title;
    return cleaned;
  });

  return { title, cards };
}

module.exports = { validateLookupResponse };
