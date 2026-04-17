# specframe-adr-draft

Auto-trigger when an architectural decision is being made and draft a new ADR in `docs/adr/NNNN-<slug>.md`.

## Trigger

Invoke when:
- User proposes switching, adopting, or replacing a framework, library, or protocol.
- Agent is about to introduce a new persistence layer or external integration.
- Discussion touches trade-offs that affect multiple modules.

## Do

1. Read `docs/adr/README.md` and existing ADRs to find the next free number.
2. Draft a new ADR using `docs/adr/0000-template.md` sections: Status, Date, Context, Decision, Consequences.
3. Status: `proposed` unless the user confirms adoption.
4. Reference related ADRs if this decision supersedes one.

## Do not

- Do not invent context. Cite source discussion or file paths.
- Do not mark `accepted` without explicit confirmation.
