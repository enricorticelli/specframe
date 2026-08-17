# Guidelines

*How do we usually build this?*

A guideline is the default way to do something here. It carries judgement: a
reviewer can accept a deviation when there is a reason, and the reason is worth
hearing. That is exactly what separates it from a [rule](../rules/README.md).

## When to write one

Write a guideline when:

- the same feedback has come up in review more than twice;
- there is a default worth agreeing on, but exceptions are legitimate;
- a newcomer or an agent would otherwise have to infer the convention from
  reading existing code — and would infer it wrong.

## Conventions

- **Filename**: `NNNN-slug.md`, numbered in steps of 10.
- **Identifier**: `GL-NNNN`, matching the filename.
- **Status**: `active` · `deprecated`. Deprecate rather than delete, so code
  written under the old convention still explains itself.
- Show, do not only tell: a *prefer* and an *avoid* example is worth more than
  another paragraph, and is what an agent will actually pattern-match on.
- Guidelines that follow from an architectural choice carry a
  `Source: ADR-NNNN` line.
- If a guideline hardens into something with no acceptable exception, promote it
  to a rule and deprecate it here.

Start from [`0000-template.md`](./0000-template.md).

## Index

{{index}}
