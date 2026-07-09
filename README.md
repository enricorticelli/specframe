<div align="center">

# specframe

**A decision-driven scaffolding for AI-ready repositories.**

[![npm version](https://img.shields.io/npm/v/specframe.svg)](https://www.npmjs.com/package/specframe)
[![npm downloads](https://img.shields.io/npm/dm/specframe.svg)](https://www.npmjs.com/package/specframe)
[![node](https://img.shields.io/npm/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)
[![dependencies](https://img.shields.io/badge/dependencies-zero-brightgreen.svg)](#)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#contributing)

</div>

---

> **The repo is the spec.** `specframe` treats every repository as a living,
> **decision-driven** knowledge base: your architecture decisions, enforced
> rules, conventions, runbooks and glossary *are* the source of truth — and
> every AI agent is pointed straight at them.

Most repos today accumulate context by accident: a `CLAUDE.md` here, an
`AGENTS.md` there, a stray ADR, half a convention someone mentioned in a PR.
The result is drift — agents guess, decisions get lost, and six months in nobody
remembers *why* the code looks the way it does.

`specframe` flips that around. It scaffolds a **decision-first** structure in
seconds, then keeps the agent tooling in sync as it evolves. It's a
zero-dependency CLI that wires up the minimum context a modern repo needs to
collaborate with AI coding agents (Claude, Copilot, Codex, Gemini, Continue,
Amazon Q) — organized around **what you decided and why**, not around a pile of
ad-hoc instruction files.

```bash
npx specframe
```

That's the whole demo. No install, no config, no lock-in. Run it in any repo and answer a few prompts.

---

## Why specframe

- **Decision-driven by design.** The skeleton is built around your decisions: ADRs capture *what* you decided and *why*, rules capture *what is non-negotiable*, guidelines capture *how you usually do it*, runbooks capture *what to do when it breaks*, and the glossary keeps *what things mean here*. Agents don't have to reverse-engineer intent from the code — they read it directly.
- **One source of truth.** `AGENTS.md` + `docs/` are the canonical decision log; every agent's native rules file is just a thin pointer back to them. No more keeping five instruction files in sync by hand.
- **Broad agent support out of the box.** Claude, Copilot, Codex get full subagents + slash commands + skills in each tool's *current* convention. Most others (Cursor, Windsurf, Zed, Roo Code, Kiro, Junie, Devin, Jules…) read `AGENTS.md` natively, so they need nothing extra.
- **Safe by design.** Idempotent and re-runnable. **Your files are never overwritten.** A manifest tracks what was generated so updates stay surgical.
- **Updatable.** Scaffold a repo today, run `specframe update` months later, and pick up new prompts, commands and skills — without re-answering anything or clobbering your edits.
- **Zero dependencies.** Nothing to audit, nothing to bloat your toolchain.

---

## The decision-driven structure

`specframe` doesn't just drop files in your repo — it organizes them as a
coherent **decision record** that humans and agents consult the same way. Every
part answers one question:

| Section | Question it answers | What lives here |
| --- | --- | --- |
| `docs/adr/` | *What did we decide, and why?* | Architecture Decision Records — context, options, trade-offs, consequences. |
| `docs/rules/` | *What is non-negotiable?* | Hard constraints the code must satisfy (security, compliance, invariants). |
| `docs/guidelines/` | *How do we usually build this?* | Conventions & patterns to follow by default. |
| `docs/runbook/` | *What do we do when it breaks?* | Operational procedures, diagnostics, recovery steps. |
| `docs/glossary/` | *What do words mean here?* | Domain terms, grouped by area, so agents speak your language. |
| `AGENTS.md` | *Where do I find all of the above?* | The canonical index every agent reads first. |

This is the heart of the **decision-driven** approach: instead of scattering
context across tool-specific files, you record decisions once, in one place, in
a shape that's easy to find, cite and update. Agents then *read the decisions*
before acting — a planner reads the ADRs and rules before proposing a plan; a
reviewer checks diffs against the enforced rules; a skill auto-drafts a new ADR
the moment an architectural decision is being made.

```
AGENTS.md                          # canonical contract for AI agents
CLAUDE.md                          # Claude-specific addendum
.github/
  copilot-instructions.md
  pull_request_template.md
docs/
  adr/         README + 0000-template     (decisions)
  rules/       README + 0000-template     (non-negotiable constraints)
  guidelines/  README + 0000-template     (conventions & patterns)
  runbook/     README + 0000-template     (operational procedures)
  glossary/    README + 0000-template     (domain terms, grouped by area)
```

## Install

```bash
npm install -g specframe
# or run it without installing:
npx specframe
```

Requires Node.js ≥ 18.

## Usage

From anywhere inside a new or existing repository:

```bash
specframe
```

specframe always scaffolds at the **root of the repository** (the nearest
ancestor with a `.git` directory), even if you invoke it from a deep
subdirectory. If no `.git` is found it falls back to the current directory and
warns — run `git init` first for a real repository.

You'll be prompted for a handful of choices:

| Prompt | Options | Default |
| --- | --- | --- |
| Project name | free text | current folder name |
| Package manager | `npm` \| `pnpm` | `npm` |
| Content profile | `empty` \| `universal` | `empty` |
| Agent assistants | csv of `claude`, `copilot`, `codex`, `gemini`, `continue`, `amazonq` \| `none` | `none` |

**Content profiles:**

- **`empty`** — skeletons only: README indexes and a `0000-template.md` per section. You fill in decisions as you make them.
- **`universal`** — pre-populates `docs/rules/` and `docs/guidelines/` with an opinionated baseline (Clean Code, SOLID, testing, security, logging, Git/PR conventions). Edit or remove freely.

Existing files are never overwritten — `specframe` is idempotent and safe to re-run. It records what it generated in `.specframe/manifest.json` (a content hash per file plus your choices), which is what makes `specframe update` and `specframe uninstall` possible later.

## What gets scaffolded

When you select agent assistants, `specframe` also scaffolds subagents, slash
commands and skills in the correct path for each tool. They are **wired to the
decision log**, not standalone prompts: each one is instructed to read the
relevant ADRs / rules / guidelines before doing its job.

| Artifact | Claude | Copilot | Codex |
| --- | --- | --- | --- |
| Subagents | `.claude/agents/*.md` | `.github/agents/*.agent.md` | `.codex/agents/*.toml` |
| Slash commands | `.claude/commands/*.md` | `.github/prompts/*.prompt.md` | `.agents/skills/` |
| Skills | `.claude/skills/*/SKILL.md` | — | `.agents/skills/*/SKILL.md` |

- **Subagents:** `explorer`, `planner`, `reviewer`
- **Slash commands:** `/specframe-specify`, `/specframe-plan`, `/specframe-review`, `/specframe-bootstrap`
- **Skills** (auto-triggered): `specframe-adr-draft`, `specframe-rule-check`, `specframe-doc-sync`

These keep the decision loop closed: `specframe-adr-draft` turns a conversation
into a recorded decision, `specframe-rule-check` enforces your rules on every
diff, and `specframe-doc-sync` flags when a new convention, term or procedure
has emerged in the code without a matching doc — so the decision log never falls
behind reality.

Paths follow each tool's current convention: Copilot custom agents (`.agent.md`) and prompt files; Codex subagents as TOML and reusable instructions as Agent Skills under `.agents/skills/`. Codex has no project-level prompt files, so its slash-command equivalents are scaffolded as skills.

### Agents that don't read `AGENTS.md`

`AGENTS.md` is always generated and is the cross-tool standard — most agents read it natively and need nothing else. For the few that don't, select them to drop their native rules file, a thin pointer back to `AGENTS.md` + `docs/`:

| Target | File | Owner on update |
| --- | --- | --- |
| `gemini` | `GEMINI.md` | yours (starter you extend) |
| `continue` | `.continue/rules/specframe.md` (always-apply) | managed |
| `amazonq` | `.amazonq/rules/specframe.md` | managed |

These carry no project-specific content of their own — they point every agent at the same canonical source, so there's a single thing to maintain.

## Updating

Upgraded specframe and want a repo you scaffolded months ago to pick up the new agent prompts, commands and skills?

```bash
npm install -g specframe@latest    # or: npx specframe@latest update
specframe update
```

`update` reads the choices saved in `.specframe/manifest.json`, so it never re-prompts. It treats files in two ways:

| File kind | Examples | On update |
| --- | --- | --- |
| **Yours** | `docs/**`, ADRs, `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, PR template | **Never overwritten.** Your months of work are safe. |
| **Managed** | `.claude/**`, `.github/agents/**`, `.github/prompts/**`, `.codex/**`, `.agents/skills/**`, `.continue/rules/specframe.md`, `.amazonq/rules/specframe.md` | Refreshed **only if you didn't edit them** since they were generated. |

If you *did* hand-edit a managed file, `update` won't clobber it: the new version is written alongside as `<file>.specframe-new` so you can diff and merge. Managed files specframe no longer generates are reported as orphans (never deleted).

| Flag | Effect |
| --- | --- |
| `-n`, `--dry-run` | Show what would change without writing anything. |
| `-f`, `--force` | Overwrite managed files even if you edited them (no `.specframe-new`). |

> Repos scaffolded before update-tracking existed have no manifest. In that case `update` asks for your choices once and behaves conservatively — writing `.specframe-new` rather than overwriting.

## Uninstalling

Want to tear down everything specframe created (for example before removing it
from a repo, or to start over)?

```bash
specframe uninstall
```

`uninstall` reads `.specframe/manifest.json` and removes the files specframe
owns, then deletes the manifest itself. As with `update`, it distinguishes two
kinds of files:

| File kind | On uninstall |
| --- | --- |
| **Managed** | `.claude/**`, `.github/agents/**`, `.github/prompts/**`, `.codex/**`, `.agents/skills/**`, `.continue/rules/specframe.md`, `.amazonq/rules/specframe.md` | **Removed.** |
| **Yours** | `docs/**`, ADRs, `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, PR template | **Kept by default** — they may hold months of your own edits. |

Empty scaffolding directories (`.claude/`, `.specframe/`, …) are pruned once the
last file inside them is gone; directories that still contain your own files
are left intact, and the repo root is never deleted.

| Flag | Effect |
| --- | --- |
| `-n`, `--dry-run` | Show what would be removed without deleting anything. |
| `--purge` | Also remove the user-owned starters (`CLAUDE.md`, `AGENTS.md`, `docs/**`, …). Use when you want a completely clean slate. |

If you ran `init` from a subdirectory, `uninstall` still resolves the repo root
the same way and cleans up there.

> Note: even after `uninstall --purge`, the **decisions** you recorded in
> `docs/**` (ADRs, rules, guidelines, runbooks, glossary) are removed too —
> that's your work, so `--purge` is opt-in. A plain `uninstall` leaves them
> untouched, so your decision log survives the tooling.

## Contributing

Contributions are very welcome — whether it's a bug report, a new agent target, a docs fix, or a baseline rule you think the `universal` profile should ship.

- 🐛 **Found a bug or have an idea?** [Open an issue](../../issues/new/choose).
- 🔧 **Want to add an agent or template?** PRs are welcome — check the [open issues](../../issues) (especially anything tagged `good first issue`) to get started.
- 💬 **Questions or feedback?** Start a [discussion](../../discussions).

If specframe saves you time, a ⭐ helps others find it.

## License

[MIT](LICENSE)
