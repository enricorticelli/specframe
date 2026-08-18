# /specframe-plan

Produce an implementation plan from a spec.

## Input

A specification (from /specframe-specify) or a described task.

## Before planning

Read:
1. docs/adr/README.md and relevant ADRs.
2. docs/rules/README.md (enforced constraints).
3. docs/guidelines/README.md (active conventions).

## Output

- **Context**: why the change is needed.
- **Approach**: one recommended path.
- **Files**: paths to modify or create.
- **Steps**: ordered actions.
- **Verification**: how to test end-to-end.
- **Out of scope**: explicit exclusions.

Reuse existing utilities. Flag conflicts with rules or ADRs.

## Where it goes

Nowhere. The plan is this conversation's answer, not a file — it is consumed by
carrying it out, and stops being true the moment the work starts. Do not create a
`plans/`, `prd/` or `docs/plans/` directory, and do not write the plan to disk
unless the user asks for one at a path they name.

Two things in a plan are durable, and both have a home already:

- A step that settles an architectural question is an ADR, not a bullet. If
  `docs/DECISIONS.md` lists that question, it has a reserved number — record the
  decision before building on it, rather than picking silently.
- A constraint or convention the plan relies on belongs in `docs/rules/` or
  `docs/guidelines/`, with a `Source: ADR-NNNN` line.
