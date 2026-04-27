/**
 * Builds the translation prompt sent to every LLM.
 * All providers receive the identical string so results are comparable.
 */
function buildPrompt(text, targetLanguage) {
  return `
---
name: translation-api
description: >
  Structured translation skill that acts as a translation API. Use this skill whenever
  the user wants to translate text to or from another language, look up how to say something
  in a target language, or asks for a translation with structured output. The skill handles
  ambiguous input language, ambiguous word sense, and produces ruby-annotated output for
  Japanese and Chinese. Trigger this skill for any request phrased as a translation task,
  even casually ("how do you say X in Japanese?", "translate this to Spanish", "what's the
  Chinese for X?").
---
 
# Translation API Skill
 
Produce structured translation output from an input string and a target language.
 
## Input
 
- **lang**: The language to translate into (e.g. "Japanese", "Spanish", "French")
- **input**: The text to translate — may be in English or already in the target language
## Output format
 
Respond with a JSON object (or render it clearly in the conversation). Schema:
 
${"```json"}
{
  "translations": [
    {
      "lang": "Two letter abbreviation for the language, e.g. zh (chinese) or ja (japanese)",
      "translation": "The English word of this translation",
      "text": "The target langauge word of this translation",
      "ruby_markup": "<ruby>text<rt>reading</rt></ruby>  (only for Japanese or Chinese, else null)"
    }
  ]
}
${"```"}
 
If the context is conversational (not a programmatic API call), you may present the output as a
nicely formatted response rather than raw JSON, but always include all the fields.
 
---
 
## Rules for when to produce multiple translations
 
### 1. Ambiguous input language
 
If the input string could plausibly be in **either English or the target language** (e.g. it uses
characters or words that exist in both, or is a loanword/cognate), produce **two translations**:
- One assuming the input is **English** → translate into target language
- One assuming the input is **in the target language** → translate into English
If the input language is unambiguous, produce only one translation in that direction.
 
**Romanized loanwords**: When the input is a romanized word borrowed from the target language
(e.g. "kawaii" for Japanese, "schadenfreude" for German), treat each translation as a **dictionary
entry** rather than a directional translation. For the "English input" interpretation, set
\`english_meaning\` to the word itself as used in English (e.g. \`"kawaii"\`). For the "target language"
interpretation, set \`english_meaning\` to a full English gloss (e.g. \`"Cute, adorable, charming"\`).
 
### 2. Ambiguous word sense
 
If the input string is ambiguous in meaning — different parts of speech (noun vs. verb),
polysemous words, or context-dependent senses — produce **one translation per distinct sense**.
 
Examples of ambiguity:
- "switch" → noun (the device) vs. verb (to change)
- "light" → adjective (not heavy), noun (illumination), verb (to ignite)
- "bank" → financial institution vs. river bank
- "crane" → the bird vs. the machine
Use good judgment: only split on senses that would result in **meaningfully different translations**
in the target language. Don't over-split on trivial nuances.
 
Both rules can apply simultaneously (e.g. ambiguous language × ambiguous sense → up to 4 translations).
 
---
 
## Ruby markup rules (Japanese and Chinese only)
 
When \`target_language\` is **Japanese** or **Chinese** (Mandarin, Cantonese, etc.), include a
\`ruby_markup\` field with full HTML5 \`<ruby>\` annotations for all kanji/hanzi:
 
### Japanese
- Annotate every kanji (and kanji compound) with hiragana reading
- Kana-only words do not need ruby
- Example: \`<ruby>日本語<rt>にほんご</rt></ruby>\`
- For mixed strings: \`<ruby>食<rt>た</rt></ruby>べる\`
### Chinese
- Annotate every character with its pinyin (with tone marks)
- Example: \`<ruby>你好<rt>nǐ hǎo</rt></ruby>\`
- Use simplified or traditional characters as appropriate to the dialect/context
For all other languages, set \`ruby_markup\` to \`null\`.
 
---
 
## Examples
 
### Input: "switch" → Japanese
 
Two translations (input is clearly English, but "switch" has noun/verb ambiguity):
 
${"```json"}
{
  "translations": [
    {
      "english_meaning": "A switch (device for toggling or controlling something)",
      "target_language": "Japanese",
      "target_text": "スイッチ",
      "ruby_markup": "スイッチ"
    },
    {
      "english_meaning": "To switch / change / swap",
      "target_language": "Japanese",
      "target_text": "切り替える",
      "ruby_markup": "<ruby>切<rt>き</rt></ruby>り<ruby>替<rt>か</rt></ruby>える"
    }
  ]
}
${"```"}
 
### Input: "kawaii" → Japanese
 
Two translations (romanized loanword — ambiguous whether input is English slang or Japanese):
 
${"```json"}
{
  "translations": [
    {
      "english_meaning": "kawaii",
      "target_language": "Japanese",
      "target_text": "かわいい",
      "ruby_markup": "かわいい"
    },
    {
      "english_meaning": "Cute, adorable, charming",
      "target_language": "Japanese",
      "target_text": "かわいい",
      "ruby_markup": null
    }
  ]
}
${"```"}
 
### Input: "hola" → English (input is unambiguously Spanish)
 
${"```json"}
{
  "translations": [
    {
      "english_meaning": "Hello / Hi",
      "target_language": "English",
      "target_text": "Hello",
      "ruby_markup": null
    }
  ]
}
${"```"}
 
---
 
## Notes
 
- Always include \`english_meaning\` even when translating from English (restate the specific sense being translated).
- \`target_language\` is always the value passed as input to the skill, repeated verbatim in every translation object.
- For \`ruby_markup\`, set to \`null\` for non-CJK languages rather than omitting the key, for consistent schema.
- Prioritise natural, idiomatic translations over literal ones. If a literal and idiomatic form differ substantially, you may include both as separate translations.

Input variables to the API: {
  "lang": "${targetLanguage}",
  "input": "${text.replace(/"/g, '\\"')}"
}

  `;
}

module.exports = { buildPrompt };