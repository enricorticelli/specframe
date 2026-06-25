# specframe

[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) [![node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)

> Bootstrap a decision-driven, AI-ready repository in seconds.

`specframe` is a zero-dependency CLI that scaffolds the minimum set of context files a modern repo needs to collaborate with AI coding agents (Claude, Copilot, Codex): ADRs, rules, guidelines, runbooks, a glossary, agent prompts, slash commands, and skills.

---

## Install

```bash
npm install -g specframe
# or, no install:
npx specframe
```

## Usage

From the root of a new or existing repository:

```bash
specframe
```

You will be prompted for five choices:

| Prompt | Options | Default |
| --- | --- | --- |
| Project name | free text | current folder name |
| Package manager | `npm` \| `pnpm` | `npm` |
| Content profile | `empty` \| `universal` | `empty` |
| Agent assistants | csv of `claude`,`copilot`,`codex`,`gemini`,`continue`,`amazonq` \| `none` | `none` |

- **`empty`** writes skeletons only — README indexes and a `0000-template.md` per section.
- **`universal`** pre-populates `docs/rules/` and `docs/guidelines/` with an opinionated baseline (Clean Code, SOLID, testing, security, logging, Git/PR conventions). Edit or remove freely.

Existing files are never overwritten — `specframe` is idempotent and safe to re-run.

`init` records what it generated in `.specframe/manifest.json` (a content hash per file plus your choices), which is what makes `specframe update` possible later.

## Updating

When you upgrade specframe and want a repo you scaffolded months ago to pick up the new agent prompts, commands and skills:

```bash
npm install -g specframe@latest   # or: npx specframe@latest update
specframe update
```

`update` reads the choices saved in `.specframe/manifest.json`, so it never re-prompts. It treats files in two ways:

| File kind | Examples | On update |
| --- | --- | --- |
| **Yours** | `docs/**`, ADRs, `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, PR template | **Never overwritten.** Your months of work are safe. |
| **Managed** (specframe's artifacts) | `.claude/**`, `.github/agents/**`, `.github/prompts/**`, `.codex/**`, `.agents/skills/**`, `.continue/rules/specframe.md`, `.amazonq/rules/specframe.md` | Refreshed **only if you didn't edit them** since they were generated. |

If you *did* hand-edit a managed file, update won't clobber it: the new version is written next to it as `<file>.specframe-new` so you can diff and merge. Managed files specframe no longer generates are reported as orphans (not deleted).

Options:

| Flag | Effect |
| --- | --- |
| `-n`, `--dry-run` | Show what would change without writing anything. |
| `-f`, `--force` | Overwrite managed files even if you edited them (no `.specframe-new`). |

Repos scaffolded before update tracking existed have no manifest; `update` falls back to asking your choices once and behaves conservatively (writes `.specframe-new` rather than overwriting).

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

When agent assistants are selected, `specframe` also scaffolds subagents, slash commands and skills in the correct path for each tool:

| Artifact | Claude | Copilot | Codex |
| --- | --- | --- | --- |
| Subagents | `.claude/agents/*.md` | `.github/agents/*.agent.md` | `.codex/agents/*.toml` |
| Slash commands | `.claude/commands/*.md` | `.github/prompts/*.prompt.md` | `.agents/skills/` |
| Skills | `.claude/skills/*/SKILL.md` | — | `.agents/skills/*/SKILL.md` |

**Subagents**: `explorer`, `planner`, `reviewer`.
**Slash commands**: `/specframe-specify`, `/specframe-plan`, `/specframe-review`, `/specframe-bootstrap`.
**Skills** (auto-triggered): `specframe-adr-draft`, `specframe-rule-check`, `specframe-doc-sync`.

Paths follow each tool's current convention: Copilot custom agents (`.agent.md`) and prompt files; Codex subagents as TOML and reusable instructions as Agent Skills under `.agents/skills/`. Codex has no project-level prompt files, so its slash-command equivalents are scaffolded as skills.

### Other agents (native rules files)

`AGENTS.md` (always generated) is the cross-tool standard and is read natively by most agents — Cursor, Windsurf, Zed, Roo Code, Kiro, Junie, Devin, Codex, Jules and others need nothing extra. For the agents that do **not** read `AGENTS.md` on their own, select them to also drop their native rules file — a thin pointer back to `AGENTS.md` + `docs/`:

| Target | File | Owner on update |
| --- | --- | --- |
| `gemini` | `GEMINI.md` | yours (starter you extend) |
| `continue` | `.continue/rules/specframe.md` (always-apply) | managed |
| `amazonq` | `.amazonq/rules/specframe.md` | managed |

These carry no project-specific content of their own: they point every agent at the same canonical `AGENTS.md` and `docs/`, so there is a single source of truth to maintain.

## License

MIT
