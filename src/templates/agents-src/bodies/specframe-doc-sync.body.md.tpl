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
4. Allocate the file through the CLI — `specframe doc new <rule|guideline|runbook|glossary> <slug> --title "..."`, the same primitive the `/specframe-add-<section>` commands run. It owns the number, writes the skeleton and adds the index row; doing those three by hand and forgetting one leaves the log inconsistent.
5. Delegate to the `doc-writer` agent to fill it in — pass the file it just created, the decided content, and the citations. For glossary, an existing domain group file is edited in place; only a new area needs `doc new`.

## Do not

- Do not duplicate entries that already exist.
- Do not rewrite entries authored by the user.
- Do not create architectural decisions here — use `specframe-decide` (catalog) or `specframe-record` (project-specific) instead.
- Do not write the file yourself once content is decided — delegate to `doc-writer`.
- Do not pick the number. `specframe doc new` allocates it from the band the catalog promises never to use.
