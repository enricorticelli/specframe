# /specframe-specify

Draft a short specification from a request or idea.

## Input

A problem statement, feature idea, or user request.

## Output

A spec with:

- **Problem**: what is broken or missing.
- **Goal**: the outcome that indicates success.
- **Requirements**: bullet list, must-have only.
- **Out of scope**: explicit exclusions.
- **Acceptance criteria**: testable conditions.
- **Open questions**: unresolved decisions.

Keep the spec short. No implementation details.

## Where it goes

Nowhere. The spec is this conversation's answer, not a file. It is scaffolding for
one change: correct until the change lands, and misleading afterwards. Do not
create a `specs/`, `prd/` or `docs/specs/` directory, and do not write the spec to
disk even if one already exists — nothing in this repository reads it back, and a
per-feature document nobody maintains is the failure specframe exists to avoid.

What outlives the change is the decision inside the spec:

- An architectural choice belongs in an ADR. Check `docs/DECISIONS.md` first — if
  the question is listed there it already has a reserved number. The
  `specframe-adr-draft` skill writes the entry; say so if it is not installed.
- A requirement that turns out to be a constraint with no exception belongs in
  `docs/rules/`; a convention belongs in `docs/guidelines/`; a term the team now
  uses precisely belongs in `docs/glossary/`.

Write the spec to a file only when the user asks for one, at the path they name.
