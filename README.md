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
- 🧭 **Three ways in.** A **blank** log with every template and how to fill it, a **guided** pass over 52 architecture decisions where each answer becomes an ADR plus the rules it implies, or a **blueprint** — pick the architecture you already have in mind and walk that same pass with its answers already in place. Skip a section with one key; what you skip stays tracked as open.
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

After the project name, package manager and agent assistants, you pick one of **three ways in**.

### Blank — templates only

Every section index, a `0000-template.md` with field-by-field instructions, one worked example per section, `docs/README.md` explaining what belongs where — and `docs/DECISIONS.md` listing all 42 catalog decisions as open, each with its options and a reserved ADR number.

Nothing decided for you; nothing left to guess about *how* to decide.

### Blueprint — start from a known architecture

Fifty-two questions from a blank map is a lot to ask of someone who already knows they're building microservices. Pick the archetype instead:

```
  1) Layered CRUD application    one deployable, controllers/services/repositories, relational
  2) Modular monolith            enforced module boundaries, domain-shaped tree
  3) Domain-driven hexagonal     ports and adapters around a full domain model
  4) Service-based               coarse services over one shared database
  5) Event-driven microservices  a database each, async messaging, choreographed sagas
  6) Event sourcing and CQRS     the event log is the system of record
  7) Serverless functions        managed runtime per function, previews per change
  8) SPA and API                 client-rendered interface, modular monolith behind it
  9) Server-rendered full-stack  one deployable, rendering mode per route
 10) Content site               generated at build time, no store, no session
```

A blueprint answers the decisions that *are* the architecture — architecture, design, data, and the shape of the interface where it has one — plus the ones its shape forces on you: pick microservices and contract testing, tracing, structured logs and SLOs come with it, because a distributed system without them is a decision too, just an unrecorded one. Everything else is left alone.

Then you walk the guided pass exactly as below, with every blueprint answer showing as `current` and `enter` meaning *keep it*. Nothing is pre-accepted: **a blueprint is a starting position to argue with**, and every pre-answered question is still asked, one at a time, with the alternatives it beat listed under it.

It composes with the presets, because the two answer different questions — the preset is a posture, the blueprint is a shape:

```bash
npx specframe --blueprint microservices              # seed the wizard
npx specframe --blueprint event-sourcing --preset strict --yes
```

Where they overlap, the blueprint wins; `--set` still beats both.

### Guided — answer decisions now

Each answer becomes an **ADR** — including the alternatives you rejected and why — plus the **rules**, **guidelines**, **runbooks** and **glossary terms** it implies, cross-linked both ways. Answer `microservices` and you get the ADR, `R-0090 No service reads another service's database`, a service-boundary guideline, a degradation runbook, and the terms to match.

52 decisions across 9 sections: architecture · design & modelling · data & consistency · code quality · testing · security & compliance · observability · delivery · user interface. Event sourcing, CQRS, TDD, Clean Code, sagas, SLOs, branching, rendering strategy, client state, styling, WCAG — all optional, none assumed.

The interface section is gated on one question: answer *no user interface* and the whole thing retires, so a service repository is never asked where its buttons come from. Answer anything else and rendering, composition, state, styling, accessibility, translation and the performance budget stop being decided per screen, per session, by whoever is typing.

**`enter` takes the recommended option** — the one marked ★, named in the prompt so you can see what you're accepting. Hold enter down and you get the `balanced` preset one visible answer at a time. On a second pass over a question you've already answered, enter *keeps* your answer instead.

**Not answering is the deliberate act:** `s` leaves a question open (or a whole section, at its header) · `a` leaves everything remaining open · `d` takes every recommendation from here at once · `b` back · `?` explain · `q` quit.

**Arrow keys where the terminal has them.** On a real terminal the options are a live list: `↑`/`↓` move, `enter` takes what's under the cursor, `space` marks where several answers are allowed, and every shortcut above is a single key with no `enter` after it. The cursor starts on the option `enter` would take anyway — your existing answer, or the recommendation — so it never changes what `enter` means, only how fast you get there; where there's nothing to accept it starts on no option at all rather than implying one. Typed numbers keep working. Over ssh into a dumb terminal, through a pipe, or with `SPECFRAME_NO_KEYS=1`, the prompts print themselves and read a line instead — same questions, same keys, same answers.

Questions that stop applying are never asked — pick a modular monolith and the cross-service data-ownership questions disappear; say the repository stores nothing and the whole data section goes with it, along with the migrations question a static site has no answer to. Whatever you leave open lands in `docs/DECISIONS.md`, and `specframe decide` picks it up later.

Every answer is echoed with the ADR it will produce and whether it came from the recommendation, each section header shows how much of it is answered, and nothing is written until you've seen the review table — so accepting a default is visible three times over, not silent. Colour is used for hierarchy only, and turns itself off when nobody's watching (`NO_COLOR`, a pipe, `--no-color`; `SPECFRAME_ASCII=1` also drops the box drawing, `SPECFRAME_NO_KEYS=1` the arrow keys).

### Reviewing before you write

Fifty-odd decisions is more than anyone holds in their head, so nothing is written until you've seen the table:

```
┌────┬──────────────────────────────┬────────────────────────┬─────┬──────┐
│  # │ Decision                     │ Choice                 │ Rec │ ADR  │
├────┼──────────────────────────────┼────────────────────────┼─────┼──────┤
│ Architecture                                        5 of 6 answered     │
├─────────────────────────────────────────────────────────────────────────┤
│  1 │ Architecture style           │ Microservices          │     │ 0100 │
│  2 │ Inter-component comm         │ Async messaging        │  *  │ 0110 │
│  3 │ External API style           │ not decided            │     │  —   │
│  4 │ Component structure          │ Domain, leaves only    │  *  │ 0130 │
│  5 │ Shared code placement        │ Shared component       │  *  │ 0140 │
│  6 │ Structural governance        │ Fitness functions      │  *  │ 0150 │
└────┴──────────────────────────────┴────────────────────────┴─────┴──────┘
```

The confirmation screen shows a per-section digest (answered / open / progress); `r` opens the full table above. There, a **row number is an address**: type `12` to change that one answer and come straight back — no second pass through the wizard. `o` walks only what's still open, `f` filters to open, `w` walks every section again. `Rec *` marks an answer that matches the recommendation, which is how you catch a run that accepted every default.

Row numbers follow the catalog, so they're stable; changing an answer that gates others updates the table immediately and says how many questions appeared or disappeared.

### Unattended

```bash
npx specframe --preset balanced --yes    # every recommended option
npx specframe --preset strict --yes      # strict TDD, 80% coverage, 2 reviewers, GDPR
npx specframe --blueprint serverless --yes            # a shape, then the recommendations
npx specframe --blueprint microservices --preset strict --yes
npx specframe --set architecture-style=microservices,event-sourcing=yes
npx specframe --answers ./decisions.json # or another repo's manifest.json
```

| Flag | Effect |
| --- | --- |
| `--preset blank\|balanced\|strict` | The posture. Seeds the wizard; with `--yes`, runs unattended. |
| `--blueprint <id>` | The shape. `crud`, `modular-monolith`, `hexagonal`, `service-based`, `microservices`, `event-sourcing`, `serverless`, `spa-api`, `ssr-fullstack`, `content-site`. Beats `--preset` where they overlap. |
| `--set k=v,...` | Answer directly. Repeatable. Beats `--preset`, `--blueprint` and `--answers`. |
| `--answers FILE` | JSON map, or a saved `.specframe/manifest.json` to replay a setup. |
| `--mode blank\|guided\|blueprint` | Skip the mode question. |
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
  — `specify` and `plan` answer **in the conversation**, on purpose. specframe writes
  no `prd/`, no `specs/`, no per-feature `spec.md`/`plan.md` pair: those are correct
  until the change lands and stale after it. What outlives the change is the ADR,
  rule or guideline the spec implied — which is why the commands hand you back to
  `docs/`, and why there is nothing per-feature to maintain.
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

`decide` shows the same review table, with the decisions already recorded dimmed: they're there for context, but a recorded decision is superseded by editing its ADR, not by re-answering it.

Your documents are never overwritten. The section indexes and `DECISIONS.md` *are* refreshed — describing the set is their job — and a README you've written in is refreshed too, section by section: only the `## Index` table (and, in `DECISIONS.md`, the two decision lists) is replaced, so your own headings and prose around it survive. Restructure one past recognition and specframe stops guessing: the refreshed version lands beside it as `.specframe-new`. An already-recorded decision is never rewritten here: that's what `specframe revise` is for, and it says so when you try.

---

## Reading it back

```bash
specframe review          # every decision this repo has recorded, as a table
specframe review --open   # only what's still open
```

Reads `.specframe/manifest.json` and prints the section digest plus the full decision table — what was decided, which ADR carries it, and which answers merely took the recommendation. It's the one-command answer to "what did we agree on here", without opening thirty ADRs, and it writes nothing.

---

## Changing your mind

```bash
specframe revise                                     # the table, every row editable
specframe revise architecture-style                  # straight to one decision
specframe revise --set architecture-style=microservices   # no prompting
specframe revise --set tdd=strict -n                 # preview first
```

`decide` answers what's open; `revise` changes what's already recorded. It's the one command that rewrites a document specframe wrote and you own, so it's deliberately narrow and loud about it:

- **The ADR keeps its number.** `0100` is *the* architecture-style ADR forever — that's the numbering promise the whole catalog rests on. It gains a `Revised:` header and a **History** section naming what the decision used to be, with the tradeoff that made you leave it, plus a prompt to write down *why* — the one part no tool can fill in.
- **Confirmation is a before/after table.** Decision, from, to, ADR. Nothing is written until you've seen it.
- **Your prose is never clobbered.** A document you edited by hand is kept and the new version lands beside it as `<file>.specframe-new`, exactly like `update` — except an index, where only the generated section is replaced, in place. `--force` if you want the whole file overwritten.
- **Stale documents are reported, never deleted.** Switch off a modular monolith and `R-0110 Modules communicate only through their public surface` is no longer implied by anything — but you may have extended it, so it stays on disk and gets named in the output.
- **It tells you what it opened.** Choosing microservices makes five questions relevant that a monolith had retired; the run says so and points at `specframe decide`.

The ADRs teach the command: every generated ADR ends with the exact `specframe revise <id>` line for its own decision.

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