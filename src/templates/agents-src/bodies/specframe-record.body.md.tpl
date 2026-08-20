# specframe-record

Auto-trigger when a decision needs an ADR but is **not** one of the questions the specframe catalog already asks — a project-specific choice like which payment provider to integrate, or which third-party service to depend on. For anything the catalog already covers, use `specframe-decide` instead: it carries the reserved number, the pre-written alternatives, and the derived rules.

{{cliFallback}}

## Trigger

Invoke when:
- The user proposes adopting, switching, or replacing a library, provider, or protocol, and `specframe review --json` does not list it.
- The decision affects more than one module and would need re-justifying if reversed.

## Do

1. Confirm it is really outside the catalog: run `specframe review --json` (or `specframe explain <candidate-id> --json` if you have a guess at the id) first. If it *is* a catalog decision, stop and hand off to `specframe-decide`.
2. Decide the content with the user: Status (`proposed` unless they confirm adoption), Decision, Consequences, Alternatives considered — with the reason each lost.
3. Allocate the file and the number: `specframe adr new <slug> --title "<title>"`. Never pick a number yourself — this command reserves one outside the catalog's range so it can never collide with a decision a future specframe version adds.
4. Delegate to `doc-writer` to fill in Context, Decision, Consequences and Alternatives in the file `specframe adr new` created.
5. If the decision implies a constraint or a default, follow up with a matching rule or guideline in `docs/rules/` or `docs/guidelines/`, carrying a `Source: ADR-NNNN` line back to this ADR.

## Do not

- Do not invent a number. `specframe adr new` is the only thing that allocates one.
- Do not invent context — cite the source discussion or file paths.
- Do not mark `accepted` without explicit confirmation.
- Do not use this for a decision the catalog already asks — that duplicates a reserved ADR under a different number.
