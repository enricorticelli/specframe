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

Do not write one for a decision with no alternative, or for something a
guideline already covers. If the choice constrains future code, the ADR is the
right home; if it merely describes today's style, it is a guideline.

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
