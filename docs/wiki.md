---
kind: rules
status: current
summary: How the wiki is organized, page header fields, ledgers, todo lifecycle, launch milestones and release notes, and maintenance operations.
sources: [scripts/check-docs.mjs, scripts/todo.mjs, scripts/lib/frontmatter.mjs]
verified: 2026-11-20
---

# Wiki conventions

`docs/` is the project wiki: the only place for knowledge that is not in code. Agents write and maintain it; the owner reads, reviews and directs it. [`AGENTS.md`](../AGENTS.md) holds the agent rules and points here. `node scripts/check-docs.mjs` enforces everything mechanical on this page.

Three layers, after the [LLM wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f):

- **Sources:** code, prompts, fixtures and the HTML studies in `explorations/`. They are the truth.
- **Wiki:** `docs/`. Pages summarize and link sources; they never compete with them.
- **Schema:** `AGENTS.md` and this page.

## Layout

| Path | Holds |
|---|---|
| `docs/*.md` | Core pages: [brief](brief.md), [design](design.md), [journeys](journeys.md), [API design](api-design.md), [card schema](card-schema.md), [decisions](decisions.md), this page and the generated [index](index.md). |
| `docs/todo/` | Planned work: a milestone ledger, one page per milestone, detail records. |
| `docs/releases.md`, `docs/releases/` | Release notes: one record per completed launch milestone. |
| `docs/api/` | One spec per endpoint, plus API operations. |
| `docs/web/`, `docs/ios/` | Client architecture, development guides and coding rules. |
| `docs/evals/` | Evaluation method, rubric, inputs and the results ledger. |
| `docs/explorations/` | Status ledger and method for the HTML studies in `explorations/`. |
| `docs/skills/` | Skill procedures. Thin shells in `.agents/skills/` point here. |
| `docs/proposals/` | Future-looking designs. Nothing here is implemented. |
| `docs/tooling/` | Workstation, agent-tool and CI setup. |

File and folder names are lowercase kebab-case. Skill pages use the skill name, for example `docs/skills/add_worktree.md`. No Markdown lives outside `docs/` except `AGENTS.md`, `README.md`, skill shells and command aliases.

## Page header

Every page starts with this block:

```yaml
---
kind: spec          # index | brief | spec | guide | rules | ledger | record | proposal | skill
status: current     # current | proposal (docs/proposals/ only) | disabled (docs/skills/ only)
summary: One line for the index.
sources: [api/src/schema/index.ts, web/app/src/js/db.ts]   # optional: code this page describes
verified: 2026-11-12   # date the page was last checked against its sources
statuses: [open, in-progress, blocked, done]                # ledgers only
---
```

- `kind`: `spec` is normative current behavior; `guide` is how to run or develop something; `rules` are conventions to follow; `ledger` is a dated table; `record` is the detail behind one ledger row.
- `sources`: when a listed file changes after `verified`, the checker warns. Re-read the page against the code, fix it, then update `verified`.
- The index is generated from `summary`. Run `node scripts/check-docs.mjs --fix` after adding, renaming or re-summarizing a page.
- The block is YAML. Wrap a value in double quotes when it contains `: ` or ` #`, ends with `:`, or starts with a YAML indicator such as `` ` ``, `[`, `-` or `*`: `summary: "POST /context contract: questions and checklist."`. The checker reports unquoted values and `--fix` quotes them; `scripts/todo.mjs` quotes what it writes. Lists may be flow (`[a, b]`) or block (`key:` followed by indented `- item` lines).

## Writing rules

- **Current state only.** Pages describe what the code does now. Known gaps and limitations are current facts and belong on the page they affect. Planned work goes in `todo/`; designs for the future go in `proposals/`. Do not keep superseded documents; git history is the archive.
- **One owner per fact.** Link to the owning page instead of restating it. Planned release work lives only in `todo/`; what a completed launch shipped lives only in [release notes](releases.md). Values that code owns (model defaults, limits, versions) are cited as `path` plus symbol, not copied.
- **No diaries.** Test runs, evaluation results and session notes become a ledger row with an optional record, never paragraphs inside a spec or guide.
- Paths in backticks are repository-relative, page-relative, or relative to a package root (`api/src`, `web/app`, `web/app/src`, `evals`). The checker verifies they exist.
- **No hard wraps.** Write each paragraph, list item and quote on one line and let the viewer wrap it. Break lines only inside code blocks and tables. `node scripts/check-docs.mjs --fix` joins wrapped lines.

## Ledgers

Decisions, todos, evaluation results and exploration status are ledgers: one table row per entry, readable at a glance, with an optional link to a record holding context, evidence and findings.

```markdown
| Date | Status | Description | Details |
|---|---|---|---|
| 2026-11-12 | open | Enforce valid JSON for English generation | [details](antsy-aphid/valid-json.md) |
```

- **Date:** when the row last changed status. **Status:** one of the page's `statuses`.
- **Records** live in a folder named after the ledger, beside it: `decisions.md` → `decisions/`, `evals/results.md` → `evals/results/`, `todo/backlog.md` → `todo/backlog/`. A record is `kind: record`, starts with the context needed to understand it later, and must be linked from its ledger.
- Newest rows first. On `todo/` pages other than the milestone index, done rows sink to the bottom of their table, newest first, with their description struck through; `node scripts/check-docs.mjs --fix` does both, so a row moves once in its life.
- A ledger page may split its rows into `##` sections, and `###` subsections within them, each with its own table. The [backlog](todo/backlog.md)'s Future work section holds ideas the owner flagged for later, apart from work ready to pick up.

## Todo lifecycle

1. [`todo/index.md`](todo/index.md) lists milestones (`planned`, `active`, `done`), each linking to its page.
2. A milestone page lists its todos (`open`, `in-progress`, `blocked`, `done`). Above its first section, `node scripts/check-docs.mjs --fix` keeps a generated progress table: one row per ledger table with its count per status, and a total.
3. Adding todos, moving them between ledgers and creating milestones: `scripts/todo.mjs`, following [log a todo](skills/ajw_log_todo.md).
4. Finishing a todo: set it to `done` with the date. `/commit_worktree` does this for work in the commit.
5. Finishing a milestone: when every row is `done`, write release notes if it is a launch milestone (below), move decisions worth keeping to [decisions](decisions.md), set the milestone to `done` in the index and remove its link, then delete the milestone page and its record folder. `/finalize_worktree` does this.

## Launch milestones

Each public launch is a milestone. Other milestones and the backlog keep topic names.

- **Name:** an alliterative adjective and insect, one letter further for each launch: Antsy Aphid is the first, the second starts with B (for example Busy Beetle). The page title is `Launch: <Name>` and the slug is the name in kebab-case, for example [`todo/antsy-aphid.md`](todo/antsy-aphid.md). `node scripts/todo.mjs milestone --launch "<Name>"` checks the letter against the index, where finished launches stay listed.
- **Scope:** every row blocks the launch. Work that can ship later goes to the [backlog](todo/backlog.md).
- **Sections:** `## Client` (with `### Web` and `### iOS`), `## API + Server`, `## Launch` and `## Product + legal`, then `## Notes`. The list may change; `scripts/todo.mjs` (`LAUNCH_SECTIONS`) scaffolds the current one. Inside a section, `###` subsections group related work. A subsection's rows are concrete tasks that usually share one record holding the why and the done-when; a task that needs its own context gets its own record. A task that spans areas, such as a privacy policy covering web, iOS and the API, gets one row, in the section that produces it.
- **Notes:** `## Notes` holds dated bullets, newest first, for changes of direction such as the business model, the launch plan or the scope. It has no table.
- **Release notes:** when every row is done, the work becomes release notes: a record `releases/<slug>.md` written from the milestone's rows, records and notes, grouped by section and describing what shipped for learners and operators, plus a row in the [release notes](releases.md) ledger. Then the milestone is retired as in the [todo lifecycle](#todo-lifecycle).

`todo/` is the one part of the wiki that describes work not yet done; everything else is current state.

## Maintenance operations

- **Ingest.** After a change lands, update every page that owns an affected fact, its `verified` date, and the relevant ledgers. A change usually touches a few pages, not one.
- **Query.** Read the [index](index.md) first, then the owning pages. An answer worth keeping becomes a page or a ledger row rather than staying in chat.
- **Lint.** `node scripts/check-docs.mjs` checks headers, hard wraps, links, anchors, backticked paths, ledgers, the index, skill shells, and Markdown outside `docs/`; it warns on stale `verified` dates. Contradictions between pages still need a reading pass.

There is no separate change log: git history, ledgers and each worktree's gitignored `worktree.md` changelog cover it, and a shared append-only file would conflict across parallel worktrees.
