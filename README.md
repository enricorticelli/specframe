<div align="center">

# specframe

**Bootstrap a decision-driven, AI-ready repository in one command.**

[![npm version](https://img.shields.io/npm/v/specframe.svg)](https://www.npmjs.com/package/specframe)
[![npm downloads](https://img.shields.io/npm/dm/specframe.svg)](https://www.npmjs.com/package/specframe)
[![node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)
[![dependencies](https://img.shields.io/badge/dependencies-zero-brightgreen.svg)](#)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#contributing)

</div>

---

Every serious repo now ships a `CLAUDE.md`, an `AGENTS.md`, a pile of ADRs, rules, runbooks, a glossary, plus agent-specific prompts, subagents and skills. You write them once, by hand, for every project — and they rot the moment the conventions move on.

**`specframe` scaffolds all of that in seconds, then keeps the agent tooling in sync as it evolves.** It's a zero-dependency CLI that sets up the minimum context a modern repo needs to collaborate with AI coding agents (Claude, Copilot, Codex, Gemini, Continue, Amazon Q) — without ever touching files you've edited.

```bash
npx specframe
```

That's the whole demo. No install, no config, no lock-in. Run it in any repo and answer a few prompts.

---

## Why specframe

- **One source of truth.** `AGENTS.md` + `docs/` are canonical; every agent's native rules file is just a thin pointer back to them. No more keeping five instruction files in sync by hand.
- **Broad agent support out of the box.** Claude, Copilot, Codex get full subagents + slash commands + skills in each tool's *current* convention. Most others (Cursor, Windsurf, Zed, Roo Code, Kiro, Junie, Devin, Jules…) read `AGENTS.md` natively, so they need nothing extra.
- **Safe by design.** Idempotent and re-runnable. **Your files are never overwritten.** A manifest tracks what was generated so updates stay surgical.
- **Updatable.** Scaffold a repo today, run `specframe update` months later, and pick up new prompts, commands and skills — without re-answering anything or clobbering your edits.
- **Zero dependencies.** Nothing to audit, nothing to bloat your toolchain.

---

## Install

```bash
npm install -g specframe
# or run it without installing:
npx specframe
```

Requires Node.js ≥ 18.

## Usage

From the root of a new or existing repository:

```bash
specframe
```

You'll be prompted for a handful of choices:

| Prompt | Options | Default |
| --- | --- | --- |
| Project name | free text | current folder name |
| Package manager | `npm` \| `pnpm` | `npm` |
| Content profile | `empty` \| `universal` | `empty` |
| Agent assistants | csv of `claude`, `copilot`, `codex`, `gemini`, `continue`, `amazonq` \| `none` | `none` |

**Content profiles:**

- **`empty`** — skeletons only: README indexes and a `0000-template.md` per section.
- **`universal`** — pre-populates `docs/rules/` and `docs/guidelines/` with an opinionated baseline (Clean Code, SOLID, testing, security, logging, Git/PR conventions). Edit or remove freely.

Existing files are never overwritten — `specframe` is idempotent and safe to re-run. It records what it generated in `.specframe/manifest.json` (a content hash per file plus your choices), which is what makes `specframe update` possible later.

## What gets scaffolded

```
AGENTS.md                          # canonical contract for AI agents
CLAUDE.md                          # Claude-specific addendum
.github/
  copilot-instructions.md
  pull_request_template.md
docs/
  adr/         README + 0000-template     (architecture decisions)
  rules/       README + 0000-template     (non-negotiable constraints)
  guidelines/  README + 0000-template     (conventions & patterns)
  runbook/     README + 0000-template     (operational procedures)
  glossary/    README + 0000-template     (domain terms, grouped by area)
```

When you select agent assistants, `specframe` also scaffolds subagents, slash commands and skills in the correct path for each tool:

| Artifact | Claude | Copilot | Codex |
| --- | --- | --- | --- |
| Subagents | `.claude/agents/*.md` | `.github/agents/*.agent.md` | `.codex/agents/*.toml` |
| Slash commands | `.claude/commands/*.md` | `.github/prompts/*.prompt.md` | `.agents/skills/` |
| Skills | `.claude/skills/*/SKILL.md` | — | `.agents/skills/*/SKILL.md` |

- **Subagents:** `explorer`, `planner`, `reviewer`
- **Slash commands:** `/specframe-specify`, `/specframe-plan`, `/specframe-review`, `/specframe-bootstrap`
- **Skills** (auto-triggered): `specframe-adr-draft`, `specframe-rule-check`, `specframe-doc-sync`

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

## Contributing

Contributions are very welcome — whether it's a bug report, a new agent target, a docs fix, or a baseline rule you think the `universal` profile should ship.

- 🐛 **Found a bug or have an idea?** [Open an issue](../../issues/new/choose).
- 🔧 **Want to add an agent or template?** PRs are welcome — check the [open issues](../../issues) (especially anything tagged `good first issue`) to get started.
- 💬 **Questions or feedback?** Start a [discussion](../../discussions).

If specframe saves you time, a ⭐ helps others find it.

## License

[MIT](LICENSE)
