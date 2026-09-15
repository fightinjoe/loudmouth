const ABILITIES = Object.freeze(['none', 'basics', 'conversational']);
const DEFAULT_ABILITY = 'basics';
function sanitizeAbility(value) {
  return ABILITIES.includes(value) ? value : undefined;
}
module.exports = { ABILITIES, DEFAULT_ABILITY, sanitizeAbility };
