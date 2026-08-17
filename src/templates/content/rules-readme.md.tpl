# Rules

*What is non-negotiable?*

A rule is a constraint with no acceptable exception, and something that can
check it. If a reviewer could reasonably wave a violation through, it is not a
rule — it is a [guideline](../guidelines/README.md).

## When to write one

Write a rule when **all** of these hold:

- it can be stated as one imperative sentence;
- a violation is always wrong, not usually wrong;
- you can name what checks it — CI, a linter, a permission, code review.

A rule with no enforcement is a wish. Write the enforcement down even when it is
"code review": naming it is what makes it someone's job.

## Conventions

- **Filename**: `NNNN-slug.md`, numbered in steps of 10.
- **Identifier**: `R-NNNN`, matching the filename. Cite it in review comments.
- **Status**: `enforced` (checked and blocking) · `advisory` (agreed, not yet
  automated). Advisory is a staging area, not a permanent home.
- Rules that exist because of an architectural choice carry a
  `Source: ADR-NNNN` line. When that ADR is superseded, revisit the rule.
- **One constraint per rule.** A rule covering three things cannot be relaxed
  one third at a time.

Start from [`0000-template.md`](./0000-template.md).

## Index

{{index}}
