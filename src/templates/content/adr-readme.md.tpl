# Architecture Decision Records

*What did we decide, and why?*

An ADR records one choice between real alternatives, at the moment it was made,
with the reasoning still attached. Its value is not the decision — that is
visible in the code — but the alternatives that were rejected and the reason
they were.

## When to write one

Write an ADR when **all** of these hold:

- there was more than one credible option;
- reversing the choice later would be expensive;
- someone reading the code in six months would ask "why is it like this?".

If any one of the three fails, there is no ADR. Where it goes instead:

| What it is | Where it goes |
| --- | --- |
| A default with room for judgement | a guideline |
| A constraint with no acceptable exception, and something checks it | a rule |
| A procedure with steps and a way to verify it worked | a runbook |
| A term that means something specific here | the glossary |
| One credible option only — the obvious way, or the only way | nowhere |
| Cheaply reversible inside the module it lives in | nowhere |

**Nowhere is a legitimate outcome, and the most common one.** Naming, file
layout, which helper to call, how a function is structured, a library used in one
place and swappable in an afternoon: those are code, not decisions. An ADR for
one of them costs more than it records — it dilutes the sections that matter
until an ADR stops meaning anything, which is worse than the gap it was meant to
fill.

If the choice constrains future code, the ADR is the right home; if it merely
describes today's style, it is a guideline.

## Conventions

- **Filename**: `NNNN-slug.md`, numbered in steps of 10.
- **Status**: `proposed` · `accepted` · `superseded` · `deprecated`.
- **Never edit a decision after it is accepted.** Write a new ADR that
  supersedes it, and set the old one's status with a link forward. The record of
  what you believed at the time is the whole point.
- Generated rules and guidelines link back with a `Source: ADR-NNNN` line. When
  an ADR is superseded, revisit everything that cites it.

Start from [`0000-template.md`](./0000-template.md).
Decisions not yet taken are listed in [`../DECISIONS.md`](../DECISIONS.md).

## Index

{{index}}

## Decisions outside the catalog

Decisions this repository has recorded that specframe's own catalog never asks
about — a project-specific choice like which payment provider to use. Recorded
with `specframe adr new <slug> --title "..."`, not by hand: that command
reserves a number the catalog will never allocate, so the two can never
collide.

{{localAdrIndex}}
