# /specframe-bootstrap

Reconstruct the decision log from a codebase that already exists — the decisions were made and implemented long ago, this writes them down with their evidence.

## When to use

Run after `specframe init` on a repository that already has code. Also useful to catch up `docs/` when undocumented decisions have accumulated.

## What it does

Delegates the scan to the `bootstrapper` agent, which runs isolated so the codebase scan doesn't fill this conversation's context. It uses `docs/DECISIONS.md` as its checklist, looks for evidence of each open decision in the code, records the ones it can prove via `specframe decide --detected`, and cites `path:line` for each. The canonical procedure lives in the `bootstrapper` agent definition — do not duplicate it here.

## Steps

1. Invoke the `bootstrapper` agent.
2. Relay its report as-is: decisions recorded with their evidence, decisions left open and why, existing documents it skipped, and open TODOs.

## Rules

- Surface every TODO and every decision left open — do not silently resolve them.
- A decision the agent could not evidence stays open. Do not fill it in with a sensible default: an unverified decision recorded as fact is worse than a visibly open one.
- If the agent reports a **partial** decision — followed in some places, not others — surface it prominently. That is a real inconsistency in the codebase, not a documentation gap.
