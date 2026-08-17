# specframe-adr-draft

Auto-trigger when an architectural decision is being made and draft a new ADR in `docs/adr/NNNN-<slug>.md`.

## Trigger

Invoke when:
- User proposes switching, adopting, or replacing a framework, library, or protocol.
- Agent is about to introduce a new persistence layer or external integration.
- Discussion touches trade-offs that affect multiple modules.

## Do

1. Read `docs/DECISIONS.md` first. If the decision is listed there it already has a **reserved ADR number** — use that number, and tick the entry off once the ADR is written. Do not allocate a new one.
2. Otherwise read `docs/adr/README.md` and the existing ADRs to find the next free number (steps of 10) and confirm nothing equivalent already exists.
3. Decide the content: Status (`proposed` unless the user confirms adoption), Context, Decision, Consequences, Alternatives considered (with the reason each lost), and any related ADR this one supersedes.
4. Delegate to the `doc-writer` agent to render and write the entry — pass category `adr`, the target file, the decided content, and source citations.
5. If the decision implies a constraint or a default, follow up with the matching rule or guideline, carrying a `Source: ADR-NNNN` line back to this ADR.

## Do not

- Do not invent context. Cite source discussion or file paths.
- Do not mark `accepted` without explicit confirmation.
- Do not write the file yourself once content is decided — delegate to `doc-writer`.
