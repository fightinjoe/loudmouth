# /context prompt — v03 (ACCEPTED — current)

- Model: `gemini-3.5-flash-lite` (generateContent, `responseMimeType` not set in the
  hand-test; the service sets `application/json`)
- Date: 2026-09-10
- Prompt: `prompt.txt` (`{{SEED}}`, `{{LANGUAGE}}` substitution)
- Raw responses: `responses/response_<tag>.json`
- Deployed copy: `api/src/context-prompt.txt` must stay byte-identical to `prompt.txt`.

## Changes from v02

- Terseness scoped to options only; labels must be natural questions.
- One-axis rule made concrete: symptom kind AND severity are separate questions.
- Every option must be a valid answer to its question's label.

## Runs — inputs and outputs (baseline for /phrasebook prompt work)

Inputs are `{ seed, language }`; outputs below are the parsed model JSON. Full raw
responses (with usage metadata) are in `responses/`.

| Tag | Seed | Language | Latency | Tokens in/out | Questions |
|---|---|---|---|---|---|
| salsa | salsa dancing in Austin, TX | Spanish | 1.2s | 825/194 | 2 |
| surf | surf vacation in Costa Rica | Spanish | 1.1s | 824/218 | 2 |
| vegan | ordering vegan food | Japanese | 1.1s | 822/215 | 2 |
| directions | asking directions | Czech | 1.3s | 821/205 | 2 |
| sick | feeling sick | Chinese | 1.6s | 821/333 | 3 |

### salsa (Spanish)

- Q: What is your dancing ability? — Complete beginner / Intermediate dancer / Advanced lead/follow
- Q: Who are you going with? — Going solo / With a date or partner / With a group of friends
- Checklist: Ask someone to dance ✔, Accept or decline a dance ✔, Compliment someone's
  dancing ✔, Ask for tips or practice help ✔, Chat between songs ✔, Say goodbye and swap contacts ✘

### surf (Spanish)

- Q: What is your current surfing level? — Beginner needing lessons / Intermediate renting gear / Advanced exploring spots
- Q: Where are you staying? — Surf camp or hostel / Hotel or resort / Vacation rental
- Checklist: Rent a surfboard ✔, Book a surf lesson ✔, Ask about wave conditions ✔,
  Arrange board transport ✘, Report lost equipment ✘, Get local food recommendations ✔

### vegan (Japanese)

- Q: How strict is your diet? — Fully vegan (no dashi, honey, etc.) / Plant-based (meat/fish-free) / Vegetarian (eggs and dairy OK)
- Q: What kind of place are you eating at? — Dedicated vegan restaurant / Standard restaurant or izakaya / Convenience store or supermarket
- Checklist: State my dietary restrictions ✔, Ask about hidden ingredients ✔, Request menu
  item modifications ✔, Order vegan dishes ✔, Check for cross-contamination ✘, Express
  gratitude for the meal ✔

### directions (Czech)

- Q: Who are you asking? — Passerby on the street / Shop clerk or station staff / Police officer / Hotel receptionist
- Q: How do you want to travel? — Walking / Public transit / Driving or taxi
- Checklist: Get someone's attention ✔, Ask for a specific place ✔, Understand distance and
  time ✔, Understand basic directions ✔, Ask to repeat or slow down ✔, Confirm arrival ✘

### sick (Chinese)

- Q: Where are you seeking help? — Pharmacy / Hospital or clinic / Speaking with a hotel receptionist / Talking to a friend or coworker
- Q: What kind of symptoms do you have? — Cold, flu, or fever / Stomach or digestive issues / Pain or injury / Allergic reaction or rash
- Q: How severe is the situation? — Mild discomfort / Moderate, need specific medicine / Severe, urgent medical care needed
- Checklist: Describe my symptoms ✔, Ask about medication ✔, Explain allergies ✔, Ask for
  the doctor or clinic ✔, Discuss payment and insurance ✘, Ask for a sick leave note ✘

## Verdict

Accepted. All v02 regressions fixed: type+severity pairing restored, labels are natural
questions, no checklist-overlap questions, question count varies by seed (2–3), options
terse and valid answers.

Known nit (fold in on the next prompt touch, not worth a rev): salsa checklist item
"Say goodbye and swap contacts" joins two goals with "and".
