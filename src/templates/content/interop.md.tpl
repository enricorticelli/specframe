# Working alongside other AI-planning tools

*How specframe divides labour with Spec Kit, BMAD, OpenSpec, or any other
spec/plan harness this repository also uses.*

specframe does not read or write anything inside another tool's directory. This
document is the whole of the integration: a division of labour, stated once,
that both tools' instructions can point to.

## The division

An harness like Spec Kit, BMAD or OpenSpec owns the **change**: a spec, a plan,
a set of tasks. Correct the moment it is written, and a fossil the moment the
change merges — nobody goes back to re-read a plan for a feature that shipped
six months ago.

specframe owns the **decision**: the ADR, the rule, the guideline, the runbook,
the glossary entry it produced. Durable for as long as the repository is,
because the reason a choice was made outlives the diff that implemented it.

A spec or a plan is allowed to *answer* a question that outlives the change —
"we're adding persistence, so what's the storage model?" — but the answer does
not belong in the spec. It belongs in an ADR, referenced from the spec, so the
next spec that touches the same question finds it already decided.

## Where the other tool's artifacts live

specframe never reads or writes any of these — named here only so both sets of
instructions agree on what is whose:

| Tool | Owns the change, under |
| --- | --- |
| [GitHub Spec Kit](https://github.com/github/spec-kit) | `.specify/memory/constitution.md`, `.specify/specs/NNN-*/{spec,plan,tasks}.md` |
| [OpenSpec](https://github.com/Fission-AI/OpenSpec) | `openspec/project.md`, `openspec/specs/`, `openspec/changes/` |
| [BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) | `_bmad/`, `_bmad-output/planning-artifacts/`, `docs/stories/` |

## The contract, for an agent driving either tool

- Before drafting a spec or a plan, read `docs/rules/README.md` and the ADRs
  it touches. A plan that contradicts an enforced rule is wrong before it is
  written.
- If the spec answers a question listed as open in `docs/DECISIONS.md`, stop
  and record it with `specframe decide` (or, for a decision the catalog never
  asked about, `specframe adr new`) before building on it. An architectural
  choice made silently inside a spec is exactly the failure this repository is
  structured to prevent — see `AGENTS.md`.
- When the change is archived and the spec or plan file is gone, the decision
  it depended on should not be. If it only exists in the now-archived spec,
  it was never really recorded.

## Filling the other tool's "constitution" slot

Spec Kit's `constitution.md` and OpenSpec's `project.md` are meant to hold the
project's non-negotiable constraints — exactly what `docs/rules/` and
`docs/adr/` already are here. Point at them instead of copying their content:
two copies of the same rule drift, and the one nobody reads first is the one
that goes stale. A short pointer is enough:

> Non-negotiable constraints and architectural decisions for this repository
> are recorded in `docs/rules/` and `docs/adr/` (see `AGENTS.md`). Read them
> before proposing a spec or a plan.

specframe does not write that pointer for you: the file is the other tool's,
and this repository's own contract is passive by design — see above.
