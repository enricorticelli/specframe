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
- 🧩 **Complements your harness, doesn't compete with it.** specframe writes no per-feature spec, plan or task file — [Spec Kit](https://github.com/github/spec-kit), [BMAD](https://github.com/bmad-code-org/BMAD-METHOD) and [OpenSpec](https://github.com/Fission-AI/OpenSpec) already do that well. It owns the layer they leave empty: the decision that outlives the change. See [Working alongside a spec/plan harness](#working-alongside-a-specplan-harness).
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
| `docs/DECISIONS.md` | *What haven't we decided yet — or ruled out?* | The open backlog, each entry with a reserved ADR number, plus what's been dismissed as not applicable here. |
| `docs/README.md` | *What goes where?* | The map: when to write a rule vs a guideline vs an ADR. |
| `AGENTS.md` | *Where do I find all of this?* | The canonical index every agent reads first. |

A conformance check reads diffs against enforced rules. A skill records an ADR the moment a decision is being made — with an agent in the loop, not a wizard. The loop stays closed.

`DECISIONS.md` closes the *other* loop. An agent asked to add persistence to a repo that never chose a persistence model will pick one — silently, in a diff. Listing the decision as open turns that into a question instead of an accident.

---

## Quick start

```bash
npx specframe                # run without installing
# or
npm install -g specframe     # then: specframe
```

Requires **Node.js ≥ 18**. specframe always scaffolds at the **repo root** (nearest ancestor with `.git`), even from a deep subdirectory. No `.git`? It warns and falls back to the current folder — run `git init` first for a real repo.

If you only ever ran `npx specframe` — never `npm install -g` — `specframe` isn't on `PATH`, and the scaffolded skills know it: `specframe-decide`, `specframe-record` and `bootstrapper` each carry a note to fall back to `npx --yes specframe <args>` when the plain command isn't found, rather than inventing an ADR by hand.

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

Four things it does deliberately:

- **Leaves the unprovable open.** No evidence means the decision stays in `DECISIONS.md`. A confidently wrong ADR is worse than a visibly missing one.
- **Flags partial adoption.** A decision the code follows in some places and not others is recorded *and* marked — usually the most valuable output of a first scan, since it's the decision the team believes it has made and hasn't.
- **Doesn't pretend.** A `--detected` ADR says it documents an existing implementation, dates itself as *recorded not decided*, and asks you for the original reason — the one thing the code can't tell you.
- **Proposes dismissals for what plainly doesn't apply.** A backend-only service has no frontend decisions to make, ever — the bootstrapper hands you a `specframe dismiss --group frontend --reason "..."` with the evidence of absence, rather than leaving nine questions open forever or, worse, deciding them itself. See [Decisions that don't apply](#decisions-that-dont-apply).

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

Everything shipped here is **decision-shaped**, on purpose. specframe writes no `prd/`,
no `specs/`, no per-feature `spec.md`/`plan.md`/`tasks.md` — those belong to a spec/plan
harness ([Spec Kit](https://github.com/github/spec-kit), [BMAD](https://github.com/bmad-code-org/BMAD-METHOD),
[OpenSpec](https://github.com/Fission-AI/OpenSpec), or similar), which already does that
well and is correct only until the change lands. See
[Working alongside a spec/plan harness](#working-alongside-a-specplan-harness).

- **Subagents:** `bootstrapper` (reconstructs the log from an existing codebase), `doc-writer` (mechanical: renders a decided entry to disk), `conformance` (reviews diffs against ADRs/rules/guidelines).
- **Commands:**
  - `/specframe-decide` — register a decision, catalog or project-specific, with an agent in the loop: it reads `specframe review`/`specframe explain` for the state and the tradeoffs, looks for evidence in the repo, then writes through the CLI.
  - `/specframe-conform` — review current changes against ADRs, rules and guidelines.
  - `/specframe-bootstrap` — populate the log from a codebase you already shipped.
- **Skills** (auto-triggered): `specframe-decide` turns a conversation into a recorded catalog decision · `specframe-record` does the same for a decision the catalog never asked about (see [Decisions outside the catalog](#decisions-outside-the-catalog)) · `specframe-conform` enforces your rules on every diff · `specframe-doc-sync` flags when a new convention or term appears in code without a matching doc.

`specframe-decide` is shipped as both a command and a skill from the same definition — invoke it explicitly, or let it trigger itself the moment a decision needs making.

**Agents that don't read `AGENTS.md`** get a thin native pointer instead: `GEMINI.md` (yours to extend), `.continue/rules/specframe.md` and `.amazonq/rules/specframe.md` (managed). One canonical source, one thing to maintain.

### Changing assistants later

Onboarding asks once; the answer ages. `specframe agents` changes which harnesses
this repo ships files for — including the first one, if none was picked at init,
and none at all.

```bash
specframe agents                        # what's configured here, and what can be added
specframe agents add codex,gemini       # write their native files
specframe agents remove codex           # drop a harness's files
specframe agents remove --all           # drop every one
specframe agents set claude,gemini      # make it exactly this list
specframe agents set none               # …or no harness at all
```

Any subcommand with no ids, on a terminal, opens a picker instead.

Nothing outside the harness's own files — no doc, no ADR, not `AGENTS.md` — is ever
touched, so the decision log survives every one of these unchanged, and a repo with
no harness is a supported position: `AGENTS.md` is generated regardless and covers
most tools.

| | Adding | Removing |
| --- | --- | --- |
| A harness already in the recorded list | left alone (`specframe update` refreshes it) | — |
| A file specframe wrote and you never edited | written | removed |
| A file you'd written at that path, or edited | kept, new version beside it as `<file>.specframe-new` | kept and reported (`--force` removes it) |
| A file that's yours to own (`GEMINI.md`) | kept | kept (`--purge` removes it) |

---

## Running it again

In a repo specframe already scaffolded, bare `specframe` opens a menu of what
applies *there* — built from the repo's own state, so it never offers revising a
decision in a repo that has recorded none, or an assistant already configured.

```
── specframe ───────────────────────────────────────────────────────────────────
  specframe 0.8.0 is installed here, in guided mode. 12 recorded, 40 open.
  Run `specframe init --force` to re-run onboarding from scratch instead.

  1) Record decisions still open (40)
  2) Review what is recorded here
  3) Change a decision already recorded (12)
  4) Add an AI assistant (4 available)
  5) Remove an AI assistant (claude, codex)
  6) Refresh generated files
  7) Remove what specframe created
```

One action per run — each of these is a session of its own. Off a terminal
(CI, a pipe, an agent) it prints the commands that apply instead, so nothing
that used to be scriptable stops being.

---

## Deciding later

```bash
specframe decide                              # asks only what's still open
specframe decide --set event-sourcing=yes,cqrs=full
specframe decide --yes -n                     # preview taking every recommendation
```

Nothing already on disk moves. A document's number comes from the catalog, not from the order you answered in, so `R-0090` is `R-0090` whether it was written on day one or a year later.

`decide` shows the same review table, with the decisions already recorded dimmed: they're there for context, but a recorded decision is superseded by editing its ADR, not by re-answering it.

Your documents are never overwritten. The section indexes and `DECISIONS.md` *are* refreshed — describing the set is their job — and a README you've written in is refreshed too, section by section: only the `## Index` table (and, in `DECISIONS.md`, the three decision lists) is replaced, so your own headings and prose around it survive. Restructure one past recognition and specframe stops guessing: the refreshed version lands beside it as `.specframe-new`. An already-recorded decision is never rewritten here: that's what `specframe revise` is for, and it says so when you try.

### Deciding with an agent, not a wizard

The wizard is one way in; the `specframe-decide` command/skill is another, and it is the one meant for the moment a decision actually comes up — mid-conversation, while an agent is planning a change, rather than a dedicated terminal session:

```bash
specframe review --json                       # the state of every decision, as data
specframe explain event-sourcing --json       # one decision's full brief: context,
                                               # every option, its tradeoff, what it emits
specframe decide --set event-sourcing=yes --dry-run --json   # preview as data, not console lines
```

An agent reads `review --json` to find what's open, `explain <id> --json` for the brief the interactive wizard's `?` shows, looks for evidence of each option in the repository it's actually working in — something no terminal wizard can do — and then writes through `specframe decide` like anything else. `specframe explain <id>` without `--json` prints the same brief for a human to read.

---

## Reading it back

```bash
specframe review          # every decision this repo has recorded, as a table
specframe review --open   # only what's still open
specframe review --json   # the same, as data — what specframe-decide reads
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

## Decisions that don't apply

Not every catalog decision belongs to every repository — every frontend decision in a backend-only service, event sourcing in a plain CRUD app. Left open, those sit in `docs/DECISIONS.md` forever as phantom work, and the progress bar in `specframe review` can never reach 100%. Dismiss them instead of leaving them open:

```bash
specframe dismiss ui-surface --reason "backend-only service, no UI here"
specframe dismiss --group frontend --reason "no UI in this repo"   # a whole section at once
specframe restore ui-surface                                       # back in the backlog if that changes
```

- **It only applies to a decision still open.** An already-decided one is changed with `revise` instead — dismissing exists to get an *unanswered* question out of the backlog, not to un-record a choice.
- **No ADR is written.** A dismissal is a claim about this repository's shape, not a decision with alternatives weighed — the record lives in `docs/DECISIONS.md`'s third section, under "Decisions that do not apply", and in the manifest.
- **The reason is optional, but worth giving.** Left out, it renders as "not applicable to this repository"; in six months, that reads very differently from an actual reason.
- **`--group` is the ergonomic core.** Gates don't cascade into a dismissal — it deliberately records nothing about *why* the group applies or not, only that it doesn't — so `--group frontend` lets one reason cover every open, relevant decision in a section in one call, which is what makes the catalog's 52 questions tractable for a repository that only needs a third of them.
- **An agent proposes, never decides.** The bootstrapper's evidence-of-absence bucket hands you a copy-pasteable `specframe dismiss` command; it never runs one itself.

---

## Decisions outside the catalog

Not every decision worth an ADR is one the catalog asks about — which payment provider to integrate is real, durable, and entirely specific to your project. `specframe decide` only knows the catalog's 52 questions, so it isn't the tool for this one:

```bash
specframe adr new payments-provider --title "Payment provider"
specframe adr new payments-provider --title "Payment provider" --dry-run --json
```

Writes `docs/adr/9000-payments-provider.md` — empty Context/Decision/Consequences/Alternatives sections for you or an agent to fill in — and lists it under docs/adr/README.md's **Decisions outside the catalog** section. The number comes from a band (`9000` and up, in steps of 10) the catalog itself promises never to allocate, derived from what's already on disk rather than from the manifest, so it can never collide with a decision a future specframe version adds to the catalog. The `specframe-record` skill is the agent-driven version of this same command.

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

> **Upgrading from 0.7.x or earlier.** specframe no longer ships the harness-shaped assets a dedicated spec/plan tool already does better: the `explorer` and `planner` subagents, `/specframe-specify`, `/specframe-plan`, and the `specframe-adr-draft`/`specframe-rule-check` skills are gone — see [Working alongside a spec/plan harness](#working-alongside-a-specplan-harness) for why. `reviewer` is renamed `conformance`, `/specframe-review` is renamed `/specframe-conform`, and `specframe-adr-draft`/`specframe-rule-check` become `specframe-decide`/`specframe-conform`. Run `update`: an asset you never touched is removed outright; one you hand-edited is left in place and reported, never deleted. `docs/INTEROP.md` is added as a new user-owned file. Nothing under `docs/**` moves.

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

## Working alongside a spec/plan harness

specframe is not an alternative to [GitHub Spec Kit](https://github.com/github/spec-kit), [BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD), [OpenSpec](https://github.com/Fission-AI/OpenSpec), or any tool like them — it's built to sit next to one. The division is by lifecycle, not by feature:

| | Owns | Correct until | Lives in |
| --- | --- | --- | --- |
| A spec/plan harness | The **change** — a spec, a plan, a set of tasks | The change merges | `.specify/`, `openspec/`, `_bmad/`, or similar |
| specframe | The **decision** — the ADR, the rule, the guideline it produced | As long as the repository does | `docs/`, `AGENTS.md` |

A plan is allowed to *answer* a question that outlives the change — "we're adding persistence, so what's the storage model?" — but the answer belongs in an ADR referenced from the plan, not buried in it: a spec file is a fossil the moment its change lands, and nobody re-reads last quarter's plan to find out why the schema looks the way it does.

specframe never reads or writes another tool's directory — no detection, no generated pointer files, nothing to keep in sync. The whole integration is `docs/INTEROP.md`, scaffolded into every new repo (and added to existing ones on `update`): it names where each tool's artifacts live, and gives an agent driving either one the same instruction — check `docs/rules/` and `docs/DECISIONS.md` before writing a spec or a plan, and record a decision with `specframe decide` or `specframe adr new` before building on it. If the other tool has its own "constitution" slot (Spec Kit's `constitution.md`, OpenSpec's `project.md`), point it at `docs/rules/` and `docs/adr/` rather than duplicating them — two copies of the same rule is how one of them goes stale.

---

## Contributing

Contributions are very welcome — bug reports, new agent targets, docs fixes, or a baseline rule the `universal` profile should ship.

- 🐛 **Bug or idea?** [Open an issue](../../issues/new/choose).
- 🔧 **Adding an agent or template?** PRs welcome — check the [`good first issue`](../../issues) label.
- 💬 **Questions?** Start a [discussion](../../discussions).

If specframe saves you time, a ⭐ helps others find it.

## License

[MIT](LICENSE)