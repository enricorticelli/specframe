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

The same file also lists decisions dismissed as **not applicable here** — every
frontend decision in a backend-only service, say. Treat that the same as a
recorded choice: do not propose an option for it. If a task seems to need one
anyway, say the dismissal looks wrong and why, and let a human decide whether
to restore it — do not silently work around it.

## When something new emerges

- A choice that passes the ADR gate below → draft an ADR in `docs/adr/`.
- A constraint with no acceptable exception → draft a rule in `docs/rules/`.
- A new default way of doing something → draft a guideline in `docs/guidelines/`.
- A missing operational procedure → draft a runbook in `docs/runbook/`.
- A term that means something specific here → add it to `docs/glossary/`.
- **None of the above → write nothing.** Most changes produce no document, and
  that is the intended outcome, not a gap.

### The ADR gate

{{adrGate}}

The long form of this, with the routing table, is in `docs/adr/README.md`.

Rules and guidelines that follow from a decision carry a `Source: ADR-NNNN`
line. Keep it: it is what makes a superseded decision traceable to everything
it affected.

Agent roles and commands (if scaffolded): see .claude/, .github/, or .codex/
depending on the tool in use.

## Using this alongside a spec/plan tool

If this repository also uses Spec Kit, BMAD, OpenSpec, or a similar harness,
see `docs/INTEROP.md` for how the two divide labour: that tool owns the spec
and the plan for one change; this scaffold owns the decision that outlives it.

In the final summary, list the decision documents you consulted.
