# /plan

Produce an implementation plan from a spec.

## Input

A specification (from /specify) or a described task.

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
