<div align="center">

# specframe

**Decision-driven scaffolding for AI-ready repos.**

[![npm version](https://img.shields.io/npm/v/specframe.svg)](https://www.npmjs.com/package/specframe)
[![npm downloads](https://img.shields.io/npm/dm/specframe.svg)](https://www.npmjs.com/package/specframe)
[![node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![dependencies](https://img.shields.io/badge/dependencies-zero-brightgreen.svg)](#)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

*Zero install. Zero config. Zero lock-in. Run it in any repo and answer a few prompts.*

</div>

---

## The repo is the spec

Most repos accumulate context by accident — a `CLAUDE.md` here, an `AGENTS.md` there, a stray ADR, half a convention buried in a PR thread. The result is **drift**: agents guess, decisions get lost, and six months in nobody remembers *why* the code looks the way it does.

**specframe flips that around.** It scaffolds a decision-first structure in seconds and keeps every agent's tooling wired to it. Your architecture decisions, rules, conventions, runbooks and glossary *are* the source of truth — and every AI agent (Claude, Copilot, Codex, Gemini, Continue, Amazon Q) is pointed straight at them.

- 🎯 **Decision-driven.** ADRs capture *what & why*, rules capture *what's non-negotiable*, guidelines capture *how you build*, runbooks capture *what to do when it breaks*, the glossary keeps *what words mean here*. Agents read intent instead of reverse-engineering it.
- 🧭 **Two ways in.** A **blank** log with every template and how to fill it, or a **guided** pass over 39 architecture decisions where each answer becomes an ADR plus the rules it implies. Skip a section with one key; what you skip stays tracked as open.
- 🏗️ **Works on existing repos.** `/specframe-bootstrap` reconstructs the log from code you already shipped, citing `path:line` and leaving what it can't prove open.
- 📌 **One source of truth.** `AGENTS.md` + `docs/` are canonical. Every agent's native config is a thin pointer back — no more syncing five instruction files by hand.
- 🤖 **Broad agent support.** Claude, Copilot and Codex get full subagents, slash commands and skills in each tool's *current* convention. Cursor, Windsurf, Zed, Roo Code, Kiro, Junie, Devin, Jules and more read `AGENTS.md` natively — nothing extra needed.
- 🛡️ **Safe by design.** Idempotent and re-runnable. **Your files are never overwritten.** A manifest tracks what was generated, so updates stay surgical.
- 📦 **Zero dependencies.** Nothing to audit, nothing to bloat.

---

## The structure

Every section answers exactly one question — the same way for humans and agents:

| Section | Answers | Contains |
| --- | --- | --- |
| `docs/adr/` | *What did we decide, and why?* | Architecture Decision Records: context, options, trade-offs. |
| `docs/rules/` | *What's non-negotiable?* | Hard constraints (security, compliance, invariants). |
| `docs/guidelines/` | *How do we usually build this?* | Conventions & patterns to follow by default. |
| `docs/runbook/` | *What do we do when it breaks?* | Diagnostics and recovery procedures. |
| `docs/glossary/` | *What do words mean here?* | Domain terms, grouped by area. |
| `docs/DECISIONS.md` | *What haven't we decided yet?* | The open backlog, each entry with a reserved ADR number. |
| `docs/README.md` | *What goes where?* | The map: when to write a rule vs a guideline vs an ADR. |
| `AGENTS.md` | *Where do I find all of this?* | The canonical index every agent reads first. |

A planner reads the ADRs and rules before proposing a plan. A reviewer checks diffs against enforced rules. A skill auto-drafts an ADR the moment a decision is being made. The loop stays closed.

`DECISIONS.md` closes the *other* loop. An agent asked to add persistence to a repo that never chose a persistence model will pick one — silently, in a diff. Listing the decision as open turns that into a question instead of an accident.

---

## Quick start

```bash
npx specframe                # run without installing
# or
npm install -g specframe     # then: specframe
```

Requires **Node.js ≥ 18**. specframe always scaffolds at the **repo root** (nearest ancestor with `.git`), even from a deep subdirectory. No `.git`? It warns and falls back to the current folder — run `git init` first for a real repo.

After the project name, package manager and agent assistants, you pick one of **two modes**.

### Blank — templates only

Every section index, a `0000-template.md` with field-by-field instructions, one worked example per section, `docs/README.md` explaining what belongs where — and `docs/DECISIONS.md` listing all 39 catalog decisions as open, each with its options and a reserved ADR number.

Nothing decided for you; nothing left to guess about *how* to decide.

### Guided — answer decisions now

Each answer becomes an **ADR** — including the alternatives you rejected and why — plus the **rules**, **guidelines**, **runbooks** and **glossary terms** it implies, cross-linked both ways. Answer `microservices` and you get the ADR, `R-0090 No service reads another service's database`, a service-boundary guideline, a degradation runbook, and the terms to match.

39 decisions across 8 sections: architecture · design & modelling · data & consistency · code quality · testing · security & compliance · observability · delivery. Event sourcing, CQRS, TDD, Clean Code, sagas, SLOs, branching — all optional, none assumed.

**Skipping is the fast path:** `enter` skip · `s` skip (a whole section, at its header) · `d` recommended for everything left · `a` skip everything left · `b` back · `?` explain · `q` quit.

Enter never answers anything, so a default can't slip in unnoticed. Questions that stop applying are never asked — pick a modular monolith and the cross-service data-ownership questions disappear. Whatever you skip lands in `docs/DECISIONS.md` as open, and `specframe decide` picks it up later.

### Unattended

```bash
npx specframe --preset balanced --yes    # every recommended option
npx specframe --preset strict --yes      # strict TDD, 80% coverage, 2 reviewers, GDPR
npx specframe --set architecture-style=microservices,event-sourcing=yes
npx specframe --answers ./decisions.json # or another repo's manifest.json
```

| Flag | Effect |
| --- | --- |
| `--preset blank\|balanced\|strict` | Seeds the wizard; with `--yes`, runs unattended. |
| `--set k=v,...` | Answer directly. Repeatable. Beats `--preset` and `--answers`. |
| `--answers FILE` | JSON map, or a saved `.specframe/manifest.json` to replay a setup. |
| `--mode blank\|guided` | Skip the mode question. |
| `-y, --yes` | No prompts; unanswered decisions take their recommended option. |
| `--detected` | These decisions are already implemented — see below. |
| `--name` · `--pm` · `--agents` | Project name, package manager, agent targets. |

A typo in `--set` is reported, never dropped. Off a TTY with none of these, specframe refuses to run rather than hang.

Everything generated is recorded in `.specframe/manifest.json` (a content hash per file plus your choices) — which is what makes `decide`, `update` and `uninstall` possible.

---

## Already-built repos

Most repos that need a decision log already made every one of these decisions years ago — they just never wrote them down. Scaffold blank, then let an agent reconstruct the log from the code:

```bash
npx specframe --mode blank
# then, in Claude / Copilot / Codex:
/specframe-bootstrap
```

The `bootstrapper` agent walks the checklist in `docs/DECISIONS.md`, hunts for evidence of each decision in the code — layout, config, migrations, CI, auth, instrumentation — and records only what it can prove, citing `path:line`. It writes through `specframe decide --detected`, so a reconstructed decision gets **the same canonical ADR, numbering and derived rules** a guided init would have produced. No parallel convention, no invented numbers.

Three things it does deliberately:

- **Leaves the unprovable open.** No evidence means the decision stays in `DECISIONS.md`. A confidently wrong ADR is worse than a visibly missing one.
- **Flags partial adoption.** A decision the code follows in some places and not others is recorded *and* marked — usually the most valuable output of a first scan, since it's the decision the team believes it has made and hasn't.
- **Doesn't pretend.** A `--detected` ADR says it documents an existing implementation, dates itself as *recorded not decided*, and asks you for the original reason — the one thing the code can't tell you.

Documents you already wrote are never touched, and a decision an existing ADR already covers is skipped rather than duplicated. Recording one by hand works the same way:

```bash
specframe decide --set persistence=relational,branching=trunk-based --detected
```

---

## What gets scaffolded

Pick agent assistants and specframe drops subagents, slash commands and skills in each tool's correct path — all **wired to the decision log**, instructed to read the relevant ADRs/rules/guidelines before acting.

| Artifact | Claude | Copilot | Codex |
| --- | --- | --- | --- |
| Subagents | `.claude/agents/*.md` | `.github/agents/*.agent.md` | `.codex/agents/*.toml` |
| Slash commands | `.claude/commands/*.md` | `.github/prompts/*.prompt.md` | `.agents/skills/` |
| Skills | `.claude/skills/*/SKILL.md` | — | `.agents/skills/*/SKILL.md` |

- **Subagents:** `explorer`, `planner`, `reviewer`
- **Commands:** `/specframe-specify`, `/specframe-plan`, `/specframe-review`, `/specframe-bootstrap`
- **Skills** (auto-triggered): `specframe-adr-draft` turns a conversation into a recorded decision · `specframe-rule-check` enforces your rules on every diff · `specframe-doc-sync` flags when a new convention or term appears in code without a matching doc.

**Agents that don't read `AGENTS.md`** get a thin native pointer instead: `GEMINI.md` (yours to extend), `.continue/rules/specframe.md` and `.amazonq/rules/specframe.md` (managed). One canonical source, one thing to maintain.

---

## Deciding later

```bash
specframe decide                              # asks only what's still open
specframe decide --set event-sourcing=yes,cqrs=full
specframe decide --yes -n                     # preview taking every recommendation
```

Nothing already on disk moves. A document's number comes from the catalog, not from the order you answered in, so `R-0090` is `R-0090` whether it was written on day one or a year later.

Your documents are never overwritten. The section indexes and `DECISIONS.md` *are* refreshed — describing the set is their job — but only if you haven't edited them; if you have, the new version lands beside them as `.specframe-new`. An already-recorded decision is never silently rewritten: supersede its ADR instead.

---

## Updating

Upgraded specframe and want an old repo to pick up new prompts, commands and skills?

```bash
npm install -g specframe@latest    # or: npx specframe@latest update
specframe update
```

`update` reads your saved choices, so it **never re-prompts**, and splits files two ways:

| Kind | Examples | On update |
| --- | --- | --- |
| **Yours** | `docs/**`, ADRs, `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, PR template | **Never touched.** |
| **Managed** | `.claude/**`, `.github/agents/**`, `.codex/**`, `.agents/skills/**`, `*/rules/specframe.md` | Refreshed **only if you didn't edit them.** |

Hand-edited a managed file? The new version lands beside it as `<file>.specframe-new` to diff and merge — never a clobber. Files specframe no longer generates are reported as orphans (never deleted).

| Flag | Effect |
| --- | --- |
| `-n`, `--dry-run` | Preview changes without writing. |
| `-f`, `--force` | Overwrite edited managed files (no `.specframe-new`). |

A newer specframe may add decisions to the catalog. `update` never re-prompts for them: they show up in `docs/DECISIONS.md` as open, and `specframe decide` answers them.

> No manifest (repo scaffolded before update-tracking)? `update` asks for your choices once and stays conservative — writing `.specframe-new` rather than overwriting.

> **Upgrading from 0.4.x or earlier.** The `empty` / `universal` content profiles are gone, replaced by the two modes above. A `universal` repo keeps everything it has — `docs/**` is yours and `update` has never touched it — and is treated as blank from here. The baseline `universal` shipped as two long READMEs now lives as individual rules and guidelines, emitted only by the decisions that call for them; `specframe decide` opts back into it.

---

## Uninstalling

```bash
specframe uninstall
```

Removes the files specframe **owns** (managed tooling), then deletes the manifest. Your decision log in `docs/**`, plus `CLAUDE.md` / `AGENTS.md` / `GEMINI.md`, is **kept by default** — it may hold months of your own work. Empty scaffolding dirs are pruned; the repo root is never deleted.

| Flag | Effect |
| --- | --- |
| `-n`, `--dry-run` | Preview removals. |
| `--purge` | Also delete the user-owned starters — a completely clean slate. Opt-in, because that's *your* work. |

---

## Contributing

Contributions are very welcome — bug reports, new agent targets, docs fixes, or a baseline rule the `universal` profile should ship.

- 🐛 **Bug or idea?** [Open an issue](../../issues/new/choose).
- 🔧 **Adding an agent or template?** PRs welcome — check the [`good first issue`](../../issues) label.
- 💬 **Questions?** Start a [discussion](../../discussions).

If specframe saves you time, a ⭐ helps others find it.

## License

[MIT](LICENSE)