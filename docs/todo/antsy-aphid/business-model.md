---
kind: record
status: current
summary: "Brainstorm the business model: who pays, for what, and whether it covers per-phrasebook model cost."
sources: [scripts/cost-report.mjs, api/src/pricing.js]
verified: 2026-11-17
---

# Brainstorm the business model

Part of [Launch: Antsy Aphid](../antsy-aphid.md).

- **What:** brainstorm and compare business models (for example free with limits, one-time purchase, subscription, per-phrasebook credits), checked against the [product principles](../../brief.md#product-principles) (no pressure, no bookkeeping) and against actual cost per phrasebook.
- **Why:** owner request, 2026-11-12. Every phrasebook makes several paid model calls plus an image call, and the free-usage limits in [API protection](api-protection.md) depend on what the model allows anonymous users to do.
- **Done when:** a short comparison of the options with measured cost per phrasebook is recorded, and the chosen direction is logged in [decisions](../../decisions.md).

## Cost to serve

`node scripts/cost-report.mjs [--since 30d]` recomputes everything in this section from production `usage` logs: cost per call by route, `/phrasebook` cost by language, and the per-user model. The defaults of its assumption flags are the owner's estimates below. Costs are provider-reported charges or `api/src/pricing.js` estimates, not invoices.

Owner usage assumptions (2026-11-13): 80% of users are trip-prep (one active month), 20% are ongoing learners (active every month); 5 phrasebooks per active month; 10 phrase breakdowns per phrasebook; 40% of phrasebooks in Japanese or Chinese; 20% of started creations abandoned. Abandoned creations are charged in full, the conservative case: `/phrasebook` starts speculatively before the learner chooses topics ([guided creation](../../design.md#guided-creation)).

Measured 2026-11-13 from 3 production phrasebooks (2 Spanish, 1 Japanese, 6 topics each), 2 `/context`, 2 titles, 1 image and 1 breakdown; a small sample.

| Unit | Cost |
|---|---|
| `/context` | $0.0018 |
| `/phrasebook-title` | $0.0001 |
| `/phrasebook-image` (flat per image) | $0.015 |
| `/phrasebook`, Spanish, 6 topics | $0.019 ($0.0032 per topic) |
| `/phrasebook`, Japanese, 6 topics | $0.042 ($0.0070 per topic) |
| `/phrase-breakdown` | $0.0042 |
| One creation, language mix | $0.045 |
| Per saved phrasebook, abandoned creations included | $0.057 |
| **One phrasebook with 10 breakdowns** | **$0.098** |
| **Active user-month (5 phrasebooks)** | **$0.49** |
| Per acquired user, first year | $1.57 |

- Breakdowns are about 40% of a phrasebook's all-in cost and grow with use after creation; the cover image is 25–40% of creation cost.
- Hosting is not in the logs and is not measured. Estimated from Cloud Run list prices, a creation's 20–30 s of request time costs under $0.001, below 1% of model cost.
- Nothing caps usage yet: a user creating 30 phrasebooks a month costs about $3. Limits belong to [API protection](api-protection.md).
- Model prices can change; `api/src/pricing.js` notes promotional Gemini rates that end 2026-12-31 (not on the default path).

## Options under comparison

Free tier being modeled: static demo phrasebooks only, with breakdowns pre-generated, so a free user costs nothing per use. Owner rationale (2026-11-13): a phrasebook is rich enough that one free creation may satisfy a user and remove the reason to subscribe. Pre-generating one demo costs about $0.85 once (creation plus breakdowns for about 190 phrases).

Paid structures, at $4.99 monthly. The annual and trip-pass prices are placeholders the owner has not set. Fees assume 70% of purchases through iOS in-app purchase at the 15% App Store Small Business Program rate (30% without enrollment) and 30% through Stripe at 2.9% + $0.30. There is no fair-use cap.

| Plan | Price | Blended fee | Net | Model cost | Margin |
|---|---|---|---|---|---|
| Monthly subscription | $4.99 / month | $0.66 | $4.33 | $0.49 per active month | $3.84 per active month |
| Annual subscription | $29.99 / year (placeholder) | $3.50 | $26.49 | $0.49 (trip user) to $5.88 (ongoing) | $20.61–26.00 |
| Trip pass, 30 days | $7.99 (placeholder) | $1.00 | $6.99 | $0.49 | $6.50 |

- Payment fees exceed a month of model cost, so margin depends on price, fees and conversion rather than serving cost.
- A monthly subscriber breaks even at about 44 phrasebooks a month.
- Trip-prep users are 80% of the base, and a monthly subscription is likely to be cancelled after the trip, which makes it equivalent to a one-month purchase at $4.99.

## Open questions

Owner asked on 2026-11-13 to keep these for a later session.

1. What do the annual plan and the trip pass cost, and is a trip pass a fixed 30 days or a set number of phrasebooks?
2. How many demo phrasebooks ship: one per language, or several situations per language?
3. Does a paid plan need its own fair-use cap, or do the anonymous limits from [API protection](api-protection.md) suffice?
4. Should more production phrasebooks be generated (Chinese, Czech, Ukrainian, more Japanese; about $0.03–0.06 each) to firm up per-language cost? The measured sample has no Chinese, Czech or Ukrainian.
