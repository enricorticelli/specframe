# R-0001: Example — no secrets in the repository

- Status: enforced
- Source: —

<!-- This is a filled-in example showing the expected level of detail.
     Keep it, adapt it, or delete the file — nothing depends on it. -->

## Rule

Never commit credentials, tokens, private keys, or customer data to this
repository, including in tests, fixtures, and example configuration.

## Why

A committed secret is compromised permanently. Deleting the file does not help:
git history keeps it readable to anyone who has ever cloned the repository, so
the only real remedy is rotating the secret everywhere it was trusted — which is
expensive, easy to do incompletely, and impossible for a customer's data.

## Enforcement

A secret scanner runs as a pre-commit hook and again as a blocking CI check on
every branch. A hit fails the build; suppressing one requires a comment naming
why the match is a false positive.
