# specframe context for {{projectName}}

This repository uses **specframe** to keep AI-agent context in one canonical
place. Before reading or writing code, load the authoritative context:

- **AGENTS.md** — the canonical contract for this repo. Start here.
- **docs/rules/** — non-negotiable constraints. Treat these as hard requirements.
- **docs/guidelines/** — conventions and patterns to follow.
- **docs/adr/** — architecture decisions and their rationale.
- **docs/runbook/** — operational procedures.
- **docs/glossary/** — domain terms.

When a rule, convention, or decision is unclear, consult these documents rather
than guessing. If you introduce a new architectural decision, enforce a new
rule, or coin a new term, add or update the matching document under `docs/`.
