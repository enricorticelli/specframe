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
| Agent assistants | csv of `claude`,`copilot`,`codex` \| `none` | `none` |

- **`empty`** writes skeletons only — README indexes and a `0000-template.md` per section.
- **`universal`** pre-populates `docs/rules/` and `docs/guidelines/` with an opinionated baseline (Clean Code, SOLID, testing, security, logging, Git/PR conventions). Edit or remove freely.

Existing files are never overwritten — `specframe` is idempotent and safe to re-run.

## What gets scaffolded

```
AGENTS.md                          # canonical contract for AI agents
CLAUDE.md                          # Claude-specific addendum
.github/
  copilot-instructions.md
  pull_request_template.md
docs/
  adr/         README + 0000-template
  rules/       README + 0000-template     (non-negotiable constraints)
  guidelines/  README + 0000-template     (conventions & patterns)
  runbook/     README + 0000-template     (operational procedures)
  glossary/    README                      (domain terms)
```

When agent assistants are selected, `specframe` also scaffolds subagents, slash commands and skills in the correct path for each tool:

| Artifact | Claude | Copilot | Codex |
| --- | --- | --- | --- |
| Subagents | `.claude/agents/` | `.github/chatmodes/` | `.codex/agents/` |
| Slash commands | `.claude/commands/` | `.github/prompts/` | `.codex/prompts/` |
| Skills | `.claude/skills/` | — | — |

**Subagents**: `explorer`, `planner`, `reviewer`.
**Slash commands**: `/specframe-specify`, `/specframe-plan`, `/specframe-review`, `/specframe-bootstrap`.
**Skills** (Claude only, auto-triggered): `specframe-adr-draft`, `specframe-rule-check`, `specframe-doc-sync`.

## License

MIT
