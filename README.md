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
| `AGENTS.md` | *Where do I find all of this?* | The canonical index every agent reads first. |

A planner reads the ADRs and rules before proposing a plan. A reviewer checks diffs against enforced rules. A skill auto-drafts an ADR the moment a decision is being made. The loop stays closed.

---

## Quick start

```bash
npx specframe                # run without installing
# or
npm install -g specframe     # then: specframe
```

Requires **Node.js ≥ 18**. specframe always scaffolds at the **repo root** (nearest ancestor with `.git`), even from a deep subdirectory. No `.git`? It warns and falls back to the current folder — run `git init` first for a real repo.

You'll answer a few prompts:

| Prompt | Options | Default |
| --- | --- | --- |
| Project name | free text | current folder |
| Package manager | `npm` \| `pnpm` | `npm` |
| Content profile | `empty` \| `universal` | `empty` |
| Agent assistants | `claude`, `copilot`, `codex`, `gemini`, `continue`, `amazonq` \| `none` | `none` |

**Content profiles**
- **`empty`** — skeletons only: README indexes + a `0000-template.md` per section. Fill in decisions as you make them.
- **`universal`** — an opinionated baseline in `docs/rules/` and `docs/guidelines/` (Clean Code, SOLID, testing, security, logging, Git/PR conventions). Edit or delete freely.

Everything specframe generates is recorded in `.specframe/manifest.json` (a content hash per file plus your choices) — which is what makes `update` and `uninstall` possible later.

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

> No manifest (repo scaffolded before update-tracking)? `update` asks for your choices once and stays conservative — writing `.specframe-new` rather than overwriting.

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