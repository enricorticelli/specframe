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

**specframe flips that around.** It scaffolds a decision-first structure in seconds and wires every agent's tooling to it: your decisions, rules, conventions, runbooks and glossary *are* the source of truth.

- 🎯 **Decision-driven.** ADRs capture *what & why*, rules *what's non-negotiable*, guidelines *how you build*. Agents read intent instead of reverse-engineering it.
- 🧭 **Three ways in.** A **blank** log with every template; a **guided** pass where each answer becomes an ADR plus the rules it implies; or a **blueprint** — the architecture you already have in mind, walked as that same pass. Skip a section with one key; what you skip stays tracked as open.
- 🏗️ **Works on existing repos.** `/specframe-bootstrap` reconstructs the log from code you already shipped, citing `path:line` and leaving what it can't prove open.

- 📌 **One source of truth.** `AGENTS.md` + `docs/` are canonical; every agent's native config points back at them. Claude, Copilot and Codex get subagents, commands and skills in each tool's *current* convention; Cursor, Windsurf, Zed, Roo Code, Kiro, Junie, Devin and Jules read `AGENTS.md` natively.
- 🧩 **Complements your spec/plan harness** rather than competing with it: specframe owns the layer Spec Kit, BMAD and OpenSpec leave empty — [the decision that outlives the change](#working-alongside-a-specplan-harness).
- 🛡️ **Safe by design.** Idempotent, re-runnable, zero dependencies, and it **never overwrites your files**: a manifest tracks what was generated, so updates stay surgical.

---

## The structure

Every section answers exactly one question, the same way for humans and agents:

| Section | Answers | Contains |
| --- | --- | --- |
| `docs/adr/` | *What did we decide, and why?* | Architecture Decision Records: context, options, trade-offs. |
| `docs/rules/` | *What's non-negotiable?* | Hard constraints: security, compliance, invariants. |
| `docs/guidelines/` | *How do we usually build this?* | Conventions and patterns to follow by default. |
| `docs/runbook/` | *What do we do when it breaks?* | Diagnostics and recovery procedures. |
| `docs/glossary/` | *What do words mean here?* | Domain terms, grouped by area. |
| `docs/DECISIONS.md` | *What haven't we decided — or ruled out?* | The open backlog, each with a reserved ADR number, plus what's dismissed as not applicable. |
| `docs/README.md` | *What goes where?* | When to write a rule vs a guideline vs an ADR. |
| `AGENTS.md` | *Where do I find all of this?* | The canonical index every agent reads first. |

`DECISIONS.md` closes the loop the others leave open: an agent asked to add persistence to a repo that never chose a persistence model will pick one, silently, in a diff. Listing that decision as open makes it a question instead of an accident.

---

## Quick start

```bash
npx specframe                # run without installing
# or
npm install -g specframe     # then: specframe
```

Requires **Node.js ≥ 18**. specframe always scaffolds at the **repo root** (nearest ancestor with `.git`), even from a deep subdirectory; with no `.git` it warns and falls back to the current folder. Ran it only through `npx`? The scaffolded skills fall back to `npx --yes specframe` rather than writing an ADR by hand.

After the project name, package manager and agent assistants, you pick one of **three ways in**.

### Blank — templates only

Every section index, a `0000-template.md` with field-by-field instructions, a worked example per section, `docs/README.md` explaining what belongs where, and `docs/DECISIONS.md` listing the whole catalog as open — each entry with its options and a reserved ADR number. Nothing decided for you, nothing to guess about *how*.

### Blueprint — start from a known architecture

Fifty-two questions from a blank map is a lot for someone who already knows they're building microservices — pick the archetype instead:

```
  1) Layered CRUD application    one deployable, controllers/services/repositories
  2) Modular monolith            enforced module boundaries, domain-shaped tree
  3) Domain-driven hexagonal     ports and adapters around a domain model
  4) Service-based               coarse services over one shared database
  5) Event-driven microservices  a database each, async messaging, sagas
  6) Event sourcing and CQRS     the event log is the system of record
  7) Serverless functions        managed runtime per function
  8) SPA and API                 client-rendered interface, monolith behind it
  9) Server-rendered full-stack  one deployable, rendering mode per route
 10) Content site               generated at build time, no store, no session
```

A blueprint answers the decisions that *are* the architecture — architecture, design, data, the interface's shape where it has one — plus the ones it forces on you: pick microservices and contract testing, tracing, structured logs and SLOs come with it, because a distributed system without them is an unrecorded decision too. The rest is left alone.

You then walk the guided pass below, every blueprint answer showing as `current` and `enter` meaning *keep it*: **a blueprint is a starting position to argue with**, so every pre-answered question is still asked, with the alternatives it beat under it. `npx specframe --blueprint microservices` seeds the wizard, and it composes with the presets — the preset is a posture, the blueprint a shape, and the blueprint wins where they overlap.

### Guided — answer decisions now

Each answer becomes an **ADR** — including the alternatives you rejected and why — plus the **rules**, **guidelines**, **runbooks** and **glossary terms** it implies, cross-linked both ways. Answer `microservices` and you get the ADR, `R-0090 No service reads another service's database`, a service-boundary guideline, a degradation runbook and the matching terms.

52 decisions across 9 sections: architecture · design & modelling · data & consistency · code quality · testing · security & compliance · observability · delivery · user interface. Event sourcing, CQRS, TDD, Clean Code, sagas, SLOs, branching, rendering, styling, WCAG — all optional, none assumed. Questions that stop applying are never asked: say the repo stores nothing and the data section goes, answer *no user interface* and the interface section retires. What you leave open lands in `docs/DECISIONS.md` for `specframe decide`.

**`enter` takes the recommended option** — marked ★ and named in the prompt, so you see what you're accepting. Hold it down and you get the `balanced` preset one visible answer at a time; on a second pass it *keeps* the answer you gave.

**Not answering is the deliberate act:** `s` leaves a question open (or a whole section, at its header) · `a` leaves everything remaining open · `d` takes every recommendation from here at once · `b` back · `?` explain · `q` quit.

**Arrow keys where the terminal has them.** `↑`/`↓` move, `enter` takes what's under the cursor, `space` marks where several answers are allowed, and every shortcut above is one key. The cursor starts on the option `enter` would take anyway, so it changes how fast you get there, never what `enter` means. Typed numbers keep working, and over ssh into a dumb terminal, through a pipe or with `SPECFRAME_NO_KEYS=1` the prompts print themselves and read a line. Colour is hierarchy only and turns itself off when nobody's watching (`NO_COLOR`, `--no-color`, a pipe; `SPECFRAME_ASCII=1` drops the box drawing too).

### Reviewing before you write

Every answer is echoed with the ADR it will produce and whether it took the recommendation, and nothing is written until you've seen the table — so an accepted default is visible three times over, not silent:

```
┌────┬──────────────────────────────┬────────────────────────┬─────┬──────┐
│  # │ Decision                     │ Choice                 │ Rec │ ADR  │
├────┼──────────────────────────────┼────────────────────────┼─────┼──────┤
│ Architecture                                        5 of 6 answered     │
├─────────────────────────────────────────────────────────────────────────┤
│  1 │ Architecture style           │ Microservices          │     │ 0100 │
│  2 │ Inter-component comm         │ Async messaging        │  *  │ 0110 │
│  3 │ External API style           │ not decided            │     │  —   │
│ …                                                                       │
└────┴──────────────────────────────┴────────────────────────┴─────┴──────┘
```

The confirmation screen shows a per-section digest (answered / open / progress); `r` opens the full table, where a **row number is an address**: type `12` to change that answer and come straight back. `o` walks what's still open, `f` filters to it, `w` walks every section again, and `Rec *` marks an answer matching the recommendation — which is how you catch a run that took every default. Row numbers follow the catalog, so they're stable, and changing an answer that gates others updates the table at once.

### Unattended

```bash
npx specframe --preset balanced --yes    # every recommended option
npx specframe --preset strict --yes      # strict TDD, 80% coverage, 2 reviewers, GDPR
npx specframe --blueprint microservices --preset strict --yes    # shape, then posture
npx specframe --set architecture-style=microservices,event-sourcing=yes
npx specframe --answers ./decisions.json # or another repo's manifest.json
```

| Flag | Effect |
| --- | --- |
| `--preset blank\|balanced\|strict` | The posture. Seeds the wizard; with `--yes`, runs unattended. |
| `--blueprint <id>` | The shape: `crud`, `modular-monolith`, `hexagonal`, `service-based`, `microservices`, `event-sourcing`, `serverless`, `spa-api`, `ssr-fullstack`, `content-site`. Beats `--preset` where they overlap. |
| `--set k=v,...` | Answer directly. Repeatable. Beats all of the above. |
| `--answers FILE` | JSON map, or a saved `.specframe/manifest.json` to replay a setup. |
| `--mode blank\|guided\|blueprint` | Skip the mode question. |
| `-y, --yes` | No prompts; unanswered decisions take their recommended option. |
| `--detected` | These decisions are already implemented — see below. |
| `--name` · `--pm` · `--agents` | Project name, package manager, agent targets. |

A typo in `--set` is reported, never dropped, and off a TTY with none of these specframe refuses to run rather than hang. Everything generated is recorded in `.specframe/manifest.json` — a content hash per file plus your choices — which is what makes `decide`, `update` and `uninstall` work.

---

## Already-built repos

Most repos that need a decision log made these decisions years ago and never wrote them down. Scaffold blank, then have an agent reconstruct it from code:

```bash
npx specframe --mode blank
# then, in Claude / Copilot / Codex:
/specframe-bootstrap
```

The `bootstrapper` agent walks the checklist in `docs/DECISIONS.md`, hunts for evidence of each decision in the code — layout, config, migrations, CI, auth, instrumentation — and records only what it can prove, citing `path:line`. It writes through `specframe decide --detected`, so a reconstructed decision gets **the same ADR, numbering and derived rules** a guided init would have produced. Four things it does deliberately:

- **Leaves the unprovable open.** A confidently wrong ADR is worse than a visibly missing one.
- **Flags partial adoption.** A decision the code follows in some places and not others is recorded *and* marked — usually the most valuable output of a first scan: the decision the team believes it has made and hasn't.
- **Doesn't pretend.** A `--detected` ADR says it documents an existing implementation, dates itself *recorded not decided*, and asks you for the original reason — the one thing code can't tell you.
- **Proposes dismissals for what plainly doesn't apply.** A backend-only service has no frontend decisions, so it hands you a `specframe dismiss --group frontend` with the evidence of absence — it never runs one itself.

Documents you already wrote are never touched, and a decision an existing ADR covers is skipped, not duplicated. By hand works the same way:

```bash
specframe decide --set persistence=relational,branching=trunk-based --detected
```

---

## What gets scaffolded

Pick agent assistants and specframe drops subagents, slash commands and skills in each tool's correct path — all **wired to the decision log**, told to read the relevant ADRs, rules and guidelines first.

| Artifact | Claude | Copilot | Codex |
| --- | --- | --- | --- |
| Subagents | `.claude/agents/*.md` | `.github/agents/*.agent.md` | `.codex/agents/*.toml` |
| Slash commands | `.claude/commands/*.md` | `.github/prompts/*.prompt.md` | `.agents/skills/` |
| Skills | `.claude/skills/*/SKILL.md` | — | `.agents/skills/*/SKILL.md` |

- **Subagents:** `bootstrapper` (reconstructs the log from an existing codebase), `doc-writer` (renders a decided entry to disk), `conformance` (reviews diffs against ADRs, rules and guidelines).
- **Commands:** `/specframe-decide` registers a decision, catalog or project-specific, with an agent in the loop — it reads `specframe review`/`explain` for the state and the tradeoffs, looks for evidence in the repo, then writes through the CLI · `/specframe-conform` reviews current changes · `/specframe-bootstrap` populates the log from shipped code.
- **Skills** (auto-triggered): `specframe-decide` turns a conversation into a recorded catalog decision · `specframe-record` does the same for one the catalog never asked about · `specframe-conform` enforces your rules on every diff · `specframe-doc-sync` flags a convention or term appearing in code with no matching doc.

`specframe-decide` is one definition shipped as both a command and a skill: invoke it, or let it trigger itself the moment a decision needs making. All of it is **decision-shaped** on purpose — no `prd/`, no `specs/`, no per-feature `spec.md`/`plan.md`/`tasks.md`.

**Agents that don't read `AGENTS.md`** get a thin native pointer: `GEMINI.md` (yours to extend), `.continue/rules/specframe.md`, `.amazonq/rules/specframe.md` (managed).

### Changing assistants later

Onboarding asks once and the answer ages. `specframe agents` changes which harnesses this repo ships files for — including the first, and none at all:

```bash
specframe agents                        # what's configured, and what can be added
specframe agents add codex,gemini       # write their native files
specframe agents remove codex           # drop a harness's files (--all drops every one)
specframe agents set claude,gemini      # make it exactly this list
specframe agents set none               # …or no harness at all
```

With no ids, on a terminal, each opens a picker; a harness already configured is left alone (`update` refreshes its files). Nothing outside the harness's own files — no doc, no ADR, not `AGENTS.md` — is touched, so the decision log survives all of this and a repo with no harness is a supported position.

| | Adding | Removing |
| --- | --- | --- |
| A file specframe wrote and you never edited | written | removed |
| A file you'd written at that path, or edited | kept, new version beside it as `<file>.specframe-new` | kept and reported (`--force` removes it) |
| A file that's yours to own (`GEMINI.md`) | kept | kept (`--purge` removes it) |

---

## Running it again

In a repo specframe already scaffolded, bare `specframe` opens a menu built from that repo's own state — so it never offers revising a decision in a repo that recorded none, or an assistant already configured.

```
── specframe ───────────────────────────────────────────────────────────────────
  specframe 0.8.0 is installed here, in guided mode. 12 recorded, 40 open.

  1) Record decisions still open (40)      5) Remove an AI assistant (claude, codex)
  2) Review what is recorded here          6) Refresh generated files
  3) Change a decision already recorded    7) Remove what specframe created
  4) Add an AI assistant (4 available)
```

One action per run, each a session of its own; `init --force` re-runs onboarding from scratch. Off a terminal (CI, a pipe, an agent) it prints the commands that apply instead, so nothing scriptable stops being.

---

## Deciding later

```bash
specframe decide                              # asks only what's still open
specframe decide --set event-sourcing=yes,cqrs=full
specframe decide --yes -n                     # preview taking every recommendation
```

Nothing on disk moves, and a document's number comes from the catalog rather than the order you answered in: `R-0090` is `R-0090` whether written on day one or a year later. `decide` shows the same review table with recorded decisions dimmed — they're context, superseded by editing their ADR or by `specframe revise`, never by re-answering them here.

Your documents are never overwritten. The one thing rewritten is the generated part of an index — the `## Index` table, `DECISIONS.md`'s three decision lists — refreshed in place, so your prose around it survives.

### Deciding with an agent, not a wizard

The `specframe-decide` command/skill is the way in for the moment a decision actually comes up — mid-conversation, while an agent plans a change:

```bash
specframe review --json                       # the state of every decision, as data
specframe explain event-sourcing --json       # one decision's brief: context, every
                                               # option, its tradeoff, what it emits
specframe decide --set event-sourcing=yes --dry-run --json   # preview as data
```

It reads `review --json` for what's open and `explain <id> --json` for the brief the wizard's `?` shows, looks for evidence of each option in the repository it's working in — something no terminal wizard can do — then writes through `specframe decide`.

---

## Reading it back

```bash
specframe review          # the section digest plus every decision, as a table
specframe review --open   # only what's still open
specframe review --json   # the same, as data — what specframe-decide reads
```

What was decided, which ADR carries it, which answers merely took the recommendation: "what did we agree on here" without opening thirty ADRs. Writes nothing.

---

## Changing your mind

```bash
specframe revise                                     # the table, every row editable
specframe revise architecture-style                  # straight to one decision
specframe revise --set architecture-style=microservices -n   # no prompting; -n previews
```

`decide` answers what's open; `revise` changes what's recorded. It's the one command that rewrites a document specframe wrote and you own, so it's narrow and loud about it — confirmation is a before/after table (decision, from, to, ADR) and nothing is written until you've seen it:

- **The ADR keeps its number.** `0100` is *the* architecture-style ADR forever — the numbering promise the catalog rests on. It gains a `Revised:` header and a **History** section naming what the decision used to be and the tradeoff that made you leave it, plus a prompt for *why* — the one part no tool can fill in.
- **Your prose is never clobbered.** A document you edited is kept and the new version lands beside it as `<file>.specframe-new` — except an index, where only the generated section is replaced in place. `--force` overwrites the whole file.
- **Stale documents are reported, never deleted.** Switch off a modular monolith and `R-0110 Modules communicate only through their public surface` is implied by nothing — but you may have extended it, so it stays and is named.
- **It tells you what it opened.** Choosing microservices makes five questions relevant that a monolith had retired, and points at `specframe decide`.

Every generated ADR ends with the `specframe revise <id>` line for its own decision.

---

## Decisions that don't apply

Not every catalog decision belongs to every repository — every frontend decision in a backend-only service, event sourcing in a plain CRUD app. Left open they sit in `docs/DECISIONS.md` as phantom work and `specframe review`'s progress bar never reaches 100%. Dismiss them:

```bash
specframe dismiss ui-surface --reason "backend-only service, no UI here"
specframe dismiss --group frontend --reason "no UI in this repo"   # a whole section at once
specframe restore ui-surface                                       # back in the backlog if that changes
```

- **It only applies to a decision still open.** An already-decided one is changed with `revise`: dismissing gets an *unanswered* question out of the backlog, it doesn't un-record a choice.
- **No ADR is written.** A dismissal is a claim about this repository's shape, not a decision with alternatives weighed, so it is recorded in `docs/DECISIONS.md`'s third section and the manifest.
- **The reason is optional, but worth giving.** Left out it renders as "not applicable to this repository", which in six months reads very differently from a real reason. `--group` lets one reason cover a whole section at once — which is what makes a large catalog tractable for a repo that needs a third of it.

---

## Decisions outside the catalog

Not every decision worth an ADR is one the catalog asks about — the payment provider you integrate is real, durable and entirely yours:

```bash
specframe adr new payments-provider --title "Payment provider"
specframe adr new payments-provider --title "Payment provider" --dry-run --json
```

Writes `docs/adr/9000-payments-provider.md` — empty Context/Decision/Consequences/Alternatives sections for you or an agent to fill in — and lists it under docs/adr/README.md's **Decisions outside the catalog** section. The number comes from a band (`9000` up, in tens) the catalog promises never to allocate, derived from disk rather than the manifest, so it can never collide with a decision a future version adds. `specframe-record` is the agent-driven version.

---

## Updating

To make an old repo pick up new prompts, commands and skills:

```bash
npm install -g specframe@latest    # or: npx specframe@latest update
specframe update
```

`update` reads your saved choices, so it **never re-prompts**. It splits files two ways:

| Kind | Examples | On update |
| --- | --- | --- |
| **Yours** | `docs/**`, ADRs, `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, PR template | **Never touched.** |
| **Managed** | `.claude/**`, `.github/agents/**`, `.codex/**`, `.agents/skills/**`, `*/rules/specframe.md` | Refreshed **only if you didn't edit them.** |

Hand-edited a managed file? The new version lands beside it as `<file>.specframe-new` to diff and merge — never a clobber. Files specframe no longer generates are reported as orphans, never deleted. Decisions a newer catalog adds show up in `docs/DECISIONS.md` as open, for `specframe decide` to answer.

| Flag | Effect |
| --- | --- |
| `-n`, `--dry-run` | Preview changes without writing. |
| `-f`, `--force` | Overwrite edited managed files (no `.specframe-new`). |

> No manifest (scaffolded before update-tracking)? `update` asks for your choices once, then stays conservative.

> **From 0.4.x or earlier.** The `empty` / `universal` content profiles are gone, replaced by the modes above. A `universal` repo keeps everything it has and counts as blank from here; the baseline it shipped as two long READMEs now lives as individual rules and guidelines, emitted by the decisions that call for them.

> **From 0.7.x or earlier.** The harness-shaped assets a spec/plan tool does better are gone (`explorer`, `planner`, `/specframe-specify`, `/specframe-plan`); `reviewer` becomes `conformance`, `/specframe-review` becomes `/specframe-conform`, `specframe-adr-draft`/`specframe-rule-check` become `specframe-decide`/`specframe-conform`. On `update` an asset you never touched is removed outright, one you hand-edited is reported, `docs/INTEROP.md` is added, and nothing under `docs/**` moves.

---

## Uninstalling

```bash
specframe uninstall
```

Removes the files specframe **owns**, then the manifest. Your decision log in `docs/**`, plus `CLAUDE.md` / `AGENTS.md` / `GEMINI.md`, is **kept by default** — it may hold months of your work. Empty scaffolding dirs are pruned, the repo root never.

| Flag | Effect |
| --- | --- |
| `-n`, `--dry-run` | Preview removals. |
| `--purge` | Also delete the user-owned starters — a clean slate. Opt-in, because that's *your* work. |

---

## Working alongside a spec/plan harness

specframe is not an alternative to [Spec Kit](https://github.com/github/spec-kit), [BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD), [OpenSpec](https://github.com/Fission-AI/OpenSpec) or anything like them — it sits next to one. The division is by lifecycle, not by feature:

| | Owns | Correct until | Lives in |
| --- | --- | --- | --- |
| A spec/plan harness | The **change** — a spec, a plan, a set of tasks | The change merges | `.specify/`, `openspec/`, `_bmad/`, or similar |
| specframe | The **decision** — the ADR, the rule, the guideline it produced | As long as the repository does | `docs/`, `AGENTS.md` |

A plan may *answer* a question that outlives the change — "we're adding persistence, so what's the storage model?" — but the answer belongs in an ADR the plan references, not buried in it: a spec file is a fossil the moment its change lands, and nobody re-reads last quarter's plan to learn why the schema looks the way it does.

specframe never reads or writes another tool's directory — no detection, no pointer files, nothing to keep in sync. The whole integration is `docs/INTEROP.md`, scaffolded into every new repo and added on `update`: it names where each tool's artifacts live and gives an agent driving either the same instruction — check `docs/rules/` and `docs/DECISIONS.md` before writing a spec or a plan, and record the decision before building on it. If the other tool has a "constitution" slot (Spec Kit's `constitution.md`, OpenSpec's `project.md`), point it at `docs/rules/` and `docs/adr/` instead of copying them: two copies of one rule is how one goes stale.

---

## Contributing

Bug reports, new agent targets, docs fixes, a new rule or guideline — all welcome.

- 🐛 [Open an issue](../../issues/new/choose); questions go in a [discussion](../../discussions).
- 🔧 PRs welcome — see the [`good first issue`](../../issues) label.

If specframe saves you time, a ⭐ helps others find it.

## License

[MIT](LICENSE)
