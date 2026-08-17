# AGENTS

Project: {{projectName}}
Package manager: {{packageManager}}

This repository is decision-driven. `docs/` is the source of truth for *why* the
code looks the way it does; the code is only the source of truth for *what* it
does. Read the decisions before changing anything.

Minimum reading order:
1. docs/README.md (how the decision log is organised)
2. docs/adr/README.md (recorded decisions) and the relevant ADRs
3. docs/rules/README.md (non-negotiable constraints — treat as hard requirements)
4. docs/guidelines/README.md (active conventions)
5. docs/glossary/README.md (domain terms)
6. docs/runbook/ (only for operational tasks)

Do not change architecture before checking the ADRs.

## Decisions not yet taken

`docs/DECISIONS.md` lists the decisions this repository has **not** made yet,
each with a reserved ADR number.

If a task depends on one of them, say so instead of choosing silently: an
unrecorded decision made by an agent is the exact failure this repository is
structured to prevent. Propose the decision, name the trade-off, and let it be
recorded — then implement it.

## When something new emerges

- A new architectural choice → draft an ADR in `docs/adr/`.
- A constraint with no acceptable exception → draft a rule in `docs/rules/`.
- A new default way of doing something → draft a guideline in `docs/guidelines/`.
- A missing operational procedure → draft a runbook in `docs/runbook/`.
- A term that means something specific here → add it to `docs/glossary/`.

Rules and guidelines that follow from a decision carry a `Source: ADR-NNNN`
line. Keep it: it is what makes a superseded decision traceable to everything
it affected.

Agent roles and commands (if scaffolded): see .claude/, .github/, or .codex/
depending on the tool in use.

In the final summary, list the decision documents you consulted.
