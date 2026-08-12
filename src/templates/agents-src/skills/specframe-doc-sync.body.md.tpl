# specframe-doc-sync

Auto-trigger when a new convention, term, or procedure emerges in code or discussion that is missing from the project docs.

## Trigger

Invoke when:
- A new naming pattern, module layout, or code convention appears.
- An unfamiliar domain term shows up in code or conversation.
- A new operational procedure (deploy step, credential rotation, recovery) is discussed.

## Do

1. Identify the target doc:
   - code convention → `docs/guidelines/`
   - domain term → `docs/glossary/`
   - operational procedure → `docs/runbook/`
   - non-negotiable constraint → `docs/rules/`
2. Check the existing README index and entries for that category to confirm nothing equivalent already exists.
3. Decide the content — a short entry (3 to 5 lines; for glossary a precise 1–2 sentence definition) plus the `path:line` or conversation context that motivated it.
4. Delegate to the `doc-writer` agent to render and write it — pass the category, the target file (new `NNNN-<slug>.md`, or the README index line), the decided content, and citations. For glossary, tell it which domain group file to use, creating it from `0000-template.md` if the group is new.

## Do not

- Do not duplicate entries that already exist.
- Do not rewrite entries authored by the user.
- Do not create architectural decisions here — use `specframe-adr-draft` instead.
- Do not write the file yourself once content is decided — delegate to `doc-writer`.
