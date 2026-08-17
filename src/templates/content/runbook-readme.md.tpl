# Runbooks

*What do we do when it breaks?*

A runbook is a procedure someone can follow under pressure, at 3am, without
having written it. That is the bar: not "documented", but *executable by
somebody else*.

## When to write one

Write a runbook when:

- a procedure has been performed twice, or once and badly;
- it has prerequisites that are not obvious;
- getting it wrong is expensive, and the person doing it may not be you.

## Conventions

- **Filename**: `NNNN-slug.md`, numbered in steps of 10.
- **Identifier**: `RB-NNNN`, matching the filename.
- **Steps are commands or checks**, not descriptions. Paste the actual command,
  with the real flags.
- **Verification is mandatory.** A procedure with no way to confirm success is
  a procedure that will be reported as done when it is not.
- **Rollback is mandatory** for anything that changes state. If there is no way
  back, say so explicitly — that is the most important line in the document.
- Assume the reader is tired and under time pressure. Short numbered steps, one
  action each, no prose between them.

Start from [`0000-template.md`](./0000-template.md).

## Index

{{index}}
