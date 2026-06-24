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
2. Draft a short entry: either append to the `README.md` index or create a `NNNN-<slug>.md` file.
   - For `docs/glossary/`, add the term to the matching domain group file `NNNN-<slug>.md` (create it from `0000-template.md` if the group is new), then link it from the README index. Do not paste full definitions into the README.
3. Cite the file paths or conversation context that motivated the addition.
4. Keep entries short — 3 to 5 lines is usually enough. For glossary terms, write a precise 1–2 sentence definition plus a `path:line` source.

## Do not

- Do not duplicate entries that already exist.
- Do not rewrite entries authored by the user.
- Do not create architectural decisions here — use `specframe-adr-draft` instead.
