# RB-0001: Example — restore service after a failed deploy

- Source: —

<!-- This is a filled-in example showing the expected level of detail.
     Replace the commands with the real ones, or delete the file. -->

## When to use

A deploy has completed and error rate or latency has not returned to baseline
within five minutes, or health checks are failing.

## Prerequisites

- Deploy permission for the affected environment.
- The commit SHA of the previous known-good release.
- Access to the deployment logs and the health dashboard.

## Steps

1. Record the SHA currently deployed: `<your command to read the live version>`.
2. Announce the rollback in the incident channel before changing anything.
3. Redeploy the previous known-good SHA: `<your deploy command> <sha>`.
4. Watch health checks and error rate for five minutes.
5. If the release included a schema migration, stop and follow the migration
   recovery runbook first — rolling back code under a migrated schema can fail
   in a worse way than the original problem.

## Verification

Health checks green, error rate back to its pre-deploy baseline, and one smoke
request through the primary user path succeeds.

## Rollback

Rolling forward again is the only way back from step 3. Do not re-deploy the
failing release to "check": reproduce it in staging instead.
