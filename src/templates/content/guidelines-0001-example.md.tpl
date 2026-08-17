# GL-0001: Example — comments explain why, not what

- Status: active
- Source: —

<!-- This is a filled-in example showing the expected level of detail.
     Keep it, adapt it, or delete the file — nothing depends on it. -->

## Scope

All code in this repository, including tests and build scripts.

## Guideline

Prefer code that needs no comment: a clearer name or a small extraction usually
removes the need for one. When a comment is warranted, explain the intent, the
constraint, or the reason an unusual approach was taken. Delete a comment rather
than let it drift out of date.

## Rationale

A comment restating what the code does duplicates a fact that will eventually
diverge from it, and the reader has no way to tell which one is stale. A comment
recording *why* carries information the code genuinely cannot.

## Examples

Prefer:

```
// The provider rate-limits per account, not per API key, so a shared
// bucket is required even though each worker has its own key.
const bucket = sharedRateLimiter(accountId);
```

Avoid:

```
// increment the counter
counter += 1;
```
