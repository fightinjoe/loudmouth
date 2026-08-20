/**
 * Validates, parses, and CLAMPS the raw string returned by the LLM for /lookup.
 * See docs/API_DESIGN.md §6.
 *
 * Philosophy:
 *   - Malformed structure (bad JSON, wrong types, invalid cards) → THROW.
 *     The handler maps a throw to 502 "Invalid response from LLM". A truncated
 *     response (the max_tokens trap, §2.F) fails JSON.parse here → 502.
 *   - Over-production → CLAMP, don't throw. Too many blocks/groups/cards is the
 *     model being generous, not broken; trim to the caps and log.
 *   - Thin groups → DROP the group, keep the rest. A group under 3 cards is
 *     dropped rather than shipped (groups are NOT word/phrase-typed — a group
 *     may mix words and phrases; only the count floor gates it).
 *
 * PIPELINE
 *   raw string
 *     │  strip code fences, JSON.parse            (throw → 502)
 *     ▼
 *   { seed, blocks[] }
 *     │  clamp blocks to MAX_BLOCKS
 *     │  per block: validate primary Card, validate + filter groups,
 *     │             enforce running group budget
 *     ▼
 *   clamped LookupResponse   +   warnings[] (for the handler to log)
 */

const { validateCard } = require('./card-validate');
const {
  MAX_BLOCKS,
  MAX_GROUPS_TOTAL,
  MAX_CARDS_PER_GROUP,
  MIN_CARDS_PER_GROUP,
} = require('./lookup-prompt');

/**
 * @param {string} raw
 * @returns {{ response: object, warnings: string[] }}
 * @throws {Error} on structurally invalid / truncated responses
 */
function validateLookupResponse(raw) {
  if (typeof raw !== 'string') {
    throw new Error(`Expected string from LLM, got ${typeof raw}`);
  }

  let cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

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

  if (typeof parsed.seed !== 'string' || !parsed.seed.trim()) {
    throw new Error('"seed" must be a non-empty string');
  }

  let { blocks } = parsed;
  if (!Array.isArray(blocks) || blocks.length === 0) {
    throw new Error('"blocks" must be a non-empty array');
  }

  const warnings = [];

  // Clamp block count.
  if (blocks.length > MAX_BLOCKS) {
    warnings.push(`clamped blocks ${blocks.length} → ${MAX_BLOCKS}`);
    blocks = blocks.slice(0, MAX_BLOCKS);
  }

  let groupBudget = MAX_GROUPS_TOTAL; // shared across all blocks (§2.B)

  const validatedBlocks = blocks.map((block, bi) => {
    const prefix = `blocks[${bi}]`;

    if (typeof block !== 'object' || block === null || Array.isArray(block)) {
      throw new Error(`${prefix} must be an object`);
    }

    // Primary card (throws on malformed). There is no block-level `sense` field —
    // blocks are distinguished by order (§G1); any meaning label lives on
    // `primary.definition`.
    validateCard(block.primary, `${prefix}.primary`);

    // A primary never carries a group context (§5). The model shouldn't emit
    // one, but strip it defensively if present.
    if (block.primary.context !== undefined) {
      delete block.primary.context;
    }

    const rawGroups = Array.isArray(block.groups) ? block.groups : [];
    const groups = [];

    for (let gi = 0; gi < rawGroups.length; gi++) {
      if (groupBudget <= 0) {
        warnings.push(`${prefix}: dropped remaining groups (total group budget ${MAX_GROUPS_TOTAL} exhausted)`);
        break;
      }
      const gPrefix = `${prefix}.groups[${gi}]`;
      const group = rawGroups[gi];
      const kept = validateAndCleanGroup(group, gPrefix, warnings);
      if (kept) {
        groups.push(kept);
        groupBudget--;
      }
    }

    return { primary: block.primary, groups };
  });

  return {
    response: { seed: parsed.seed, blocks: validatedBlocks },
    warnings,
  };
}

/**
 * Validate one group. Returns the cleaned group, or null to signal "drop it".
 * Drops (not throws) on: not an object, missing title, or fewer than
 * MIN_CARDS_PER_GROUP valid cards. Throws only on a structurally invalid Card
 * (which indicates a broken response, not a droppable group).
 *
 * Groups are NOT word/phrase-typed — a group may mix words and phrases (§G2), so
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
  if (!Array.isArray(group.cards) || group.cards.length === 0) {
    warnings.push(`${prefix} dropped (no cards)`);
    return null;
  }

  const title = group.title.trim();
  let cards = group.cards;

  // Clamp card count.
  if (cards.length > MAX_CARDS_PER_GROUP) {
    warnings.push(`${prefix} clamped cards ${cards.length} → ${MAX_CARDS_PER_GROUP}`);
    cards = cards.slice(0, MAX_CARDS_PER_GROUP);
  }

  // Validate each card (throws on malformed).
  cards.forEach((card, ci) => validateCard(card, `${prefix}.cards[${ci}]`));

  // Service sets `context` on every group card from the group title. The model
  // does not emit `context`; overwrite unconditionally so the title is the single
  // source of truth.
  cards = cards.map((c) => ({ ...c, context: title }));

  if (cards.length < MIN_CARDS_PER_GROUP) {
    warnings.push(`${prefix} dropped (${cards.length} < ${MIN_CARDS_PER_GROUP} cards)`);
    return null;
  }

  return { title, cards };
}

module.exports = { validateLookupResponse };
