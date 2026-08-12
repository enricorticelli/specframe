# specframe-adr-draft

Auto-trigger when an architectural decision is being made and draft a new ADR in `docs/adr/NNNN-<slug>.md`.

## Trigger

Invoke when:
- User proposes switching, adopting, or replacing a framework, library, or protocol.
- Agent is about to introduce a new persistence layer or external integration.
- Discussion touches trade-offs that affect multiple modules.

## Do

1. Read `docs/adr/README.md` and existing ADRs to find the next free number and confirm nothing equivalent already exists.
2. Decide the content: Status (`proposed` unless the user confirms adoption), Context, Decision, Consequences, and any related ADR this one supersedes.
3. Delegate to the `doc-writer` agent to render and write the entry — pass category `adr`, the target file, the decided content, and source citations.

## Do not

- Do not invent context. Cite source discussion or file paths.
- Do not mark `accepted` without explicit confirmation.
- Do not write the file yourself once content is decided — delegate to `doc-writer`.
