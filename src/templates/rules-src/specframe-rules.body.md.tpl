# specframe context for {{projectName}}

This repository uses **specframe** to keep AI-agent context in one canonical
place. Before reading or writing code, load the authoritative context:

- **AGENTS.md** — the canonical contract for this repo. Start here.
- **docs/README.md** — how the decision log is organised and what goes where.
- **docs/rules/** — non-negotiable constraints. Treat these as hard requirements.
- **docs/guidelines/** — conventions and patterns to follow.
- **docs/adr/** — architecture decisions and their rationale.
- **docs/runbook/** — operational procedures.
- **docs/glossary/** — domain terms.
- **docs/DECISIONS.md** — decisions this repository has *not* made yet, and
  decisions dismissed as not applicable here.

When a rule, convention, or decision is unclear, consult these documents rather
than guessing. If you introduce a new architectural decision, enforce a new
rule, or coin a new term, add or update the matching document under `docs/`.

If a task depends on a decision listed as open in `docs/DECISIONS.md`, raise it
rather than choosing quietly: that choice belongs in an ADR, not in a diff. A
decision listed as dismissed is a closed question, not an open one — do not
propose an option for it; say if the dismissal looks wrong instead.

If this repository also uses a spec/plan harness (Spec Kit, BMAD, OpenSpec, or
similar), see `docs/INTEROP.md` for how the two divide labour.
