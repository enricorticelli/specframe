// Runbook registry — operational procedures specframe can emit.
//
// Rendered by render.js into the shape declared by docs/runbook/0000-template.md.
// `number` is permanent and lands in the filename. See rules.js for the
// numbering contract.
//
// Steps are deliberately written as prompts to fill in ("replace with your
// command"): a runbook nobody has adapted to the real environment is worse than
// none, so the generated version says what to do and leaves the exact command
// to the repository that owns it.
export const RUNBOOKS = {
  'deploy-and-rollback': {
    number: '0010',
    title: 'Deploy and roll back a release',
    when: 'Promoting a release to production, or reverting one that is misbehaving.',
    prerequisites: [
      'Deploy permission for the target environment.',
      'The release passed all CI gates on the default branch.',
      'Access to the deployment logs and health dashboard.',
    ],
    steps: [
      'Confirm the commit you intend to ship: record its SHA before starting.',
      'Verify the previous release is healthy, so a rollback target is known good.',
      'Run the deploy command for the target environment (replace with yours).',
      'Watch health checks and error rate for the first few minutes.',
      'To roll back: redeploy the previously recorded SHA — do not revert forward under pressure.',
    ],
    verification: 'Health checks green, error rate back to baseline, a smoke request through the primary user path succeeds.',
    rollback: 'Redeploy the last known good SHA. If the release included a schema migration, follow `database-migration-failure` before rolling back the code.',
  },

  'rotate-credentials': {
    number: '0020',
    title: 'Rotate a credential',
    when: 'A secret expired, leaked, or is on its scheduled rotation.',
    prerequisites: [
      'Write access to the secret store.',
      'The list of consumers that read this credential.',
      'A maintenance window, if the credential cannot be dual-issued.',
    ],
    steps: [
      'Identify every consumer of the credential before changing anything.',
      'Issue the new credential without revoking the old one, so both are valid.',
      'Update the secret store, then restart or refresh consumers one at a time.',
      'Confirm each consumer is authenticating with the new credential.',
      'Revoke the old credential and record the rotation date.',
    ],
    verification: 'No authentication errors after the old credential is revoked; the secret store shows the new version as active.',
    rollback: 'Re-enable the old credential (it is still valid until step 5) and restore the previous value in the store.',
  },

  'service-degradation': {
    number: '0030',
    title: 'Diagnose a degraded or unavailable service',
    when: 'A service is failing, slow, or reporting elevated errors.',
    prerequisites: [
      'Read access to logs, metrics, and traces for the affected service.',
      'The service\'s dependency list and its owner.',
    ],
    steps: [
      'Establish the blast radius: which callers are affected, and since when.',
      'Check whether the service is failing itself or propagating a dependency failure — follow the trace, not the alert.',
      'Look for a recent deploy or configuration change as the first suspect.',
      'If a dependency is at fault, confirm the caller degrades gracefully (timeout, fallback, shed load) rather than queueing indefinitely.',
      'Mitigate first (roll back, scale, disable the failing path), then diagnose the root cause.',
    ],
    verification: 'Error rate and latency return to baseline for every affected caller, not just the service itself.',
    rollback: 'Roll back the most recent change to this service; if that does not help, escalate to the owner of the failing dependency.',
  },

  'rebuild-projections': {
    number: '0040',
    title: 'Rebuild a projection from the event log',
    when: 'A read model is inconsistent, a projection has a bug, or a new projection needs backfilling.',
    prerequisites: [
      'Read access to the event store and write access to the projection store.',
      'The projection\'s current checkpoint or position.',
      'An estimate of replay duration, from the event count.',
    ],
    steps: [
      'Stop the projection worker so it cannot write while you rebuild.',
      'Build into a new store or table rather than truncating the live one.',
      'Replay from the beginning of the stream, recording the position reached.',
      'Compare the rebuilt projection against the live one on a sample before switching.',
      'Point readers at the rebuilt store, then restart the worker from the recorded position.',
    ],
    verification: 'The rebuilt projection matches on the sampled entities and its checkpoint has caught up to the head of the stream.',
    rollback: 'Point readers back at the original store — it was never truncated — and restart the worker from its old checkpoint.',
  },

  'replay-failed-messages': {
    number: '0050',
    title: 'Replay messages from the dead-letter queue',
    when: 'Messages failed processing and accumulated in a dead-letter queue.',
    prerequisites: [
      'Read and write access to both the dead-letter and the primary queue.',
      'Confirmation that the bug which caused the failures is deployed and fixed.',
    ],
    steps: [
      'Inspect a sample first: understand why they failed before moving any of them.',
      'Confirm the consumer is idempotent — replay will redeliver messages that may have partially succeeded.',
      'Verify the fix is live in the consumer that will handle the replay.',
      'Replay in small batches, watching the failure rate between batches.',
      'Stop immediately if messages return to the dead-letter queue, and re-diagnose.',
    ],
    verification: 'The dead-letter queue drains without refilling, and the downstream state reflects the replayed messages exactly once.',
    rollback: 'Pause the replay. Messages not yet moved stay in the dead-letter queue, which is durable — there is no data to recover.',
  },

  'database-migration-failure': {
    number: '0060',
    title: 'Recover from a failed schema migration',
    when: 'A migration failed partway, or a deploy must be rolled back after a migration applied.',
    prerequisites: [
      'Database administrative access and a verified recent backup.',
      'The migration file and the schema version the environment reports.',
    ],
    steps: [
      'Stop deploys to the environment before touching the schema.',
      'Determine what actually applied: compare the reported schema version with the live schema.',
      'Prefer rolling forward with a corrective migration over hand-editing the schema.',
      'If the code must be rolled back, confirm the old version tolerates the new schema — this is why migrations are additive first.',
      'Reconcile the migration bookkeeping table so the next deploy starts from a known state.',
    ],
    verification: 'Schema version matches the live schema, the application starts cleanly, and applying migrations from scratch on a fresh database succeeds in CI.',
    rollback: 'Restore from backup only as a last resort, and only after recording the writes that would be lost.',
  },

  'incident-response': {
    number: '0070',
    title: 'Respond to an incident against an SLO',
    when: 'An alert fires, or an objective is at risk of exhausting its error budget.',
    prerequisites: [
      'On-call rotation and escalation path.',
      'The affected objective, its target, and its remaining error budget.',
    ],
    steps: [
      'Declare the incident and name a single coordinator — parallel uncoordinated fixes make things worse.',
      'Mitigate user impact first; root-cause analysis is not an incident-time activity.',
      'Keep a timestamped log of what was observed and what was changed, as you go.',
      'Communicate status on a fixed cadence, including when nothing has changed.',
      'Close the incident when the objective is back within target, then schedule a blameless review.',
    ],
    verification: 'The objective is back within target and the error-budget burn rate has returned to normal.',
    rollback: 'Revert the mitigation only after confirming the underlying cause is gone; otherwise keep it and track it as debt.',
  },

  'broken-frontend-release': {
    number: '0080',
    title: 'Recover from a broken interface release',
    when: 'A deployed build renders blank, throws on load, or leaves part of the interface unusable for real users.',
    prerequisites: [
      'The commit SHA of the current build and of the last one known good.',
      'Access to the CDN or host that serves the built assets, with permission to invalidate.',
      'Client-side error reporting for the affected release, and the browser and version the reports come from.',
    ],
    steps: [
      'Establish the blast radius before acting: all users, one browser, or one route. A failure in one browser is a compatibility problem, not a release to roll back.',
      'Redeploy the last known good build. Interface rollbacks are usually safe on their own — check first whether this release depended on an API change that is already live.',
      'Invalidate the CDN cache for the entry point, and confirm the served document references the previous asset hashes.',
      'If a service worker is in use, ship the update that unregisters or replaces it — a stale worker keeps serving the broken build to returning visitors long after the origin is fixed.',
      'Verify from an ordinary session with a cold cache, not from a developer machine with one already primed.',
      'Reproduce the failure on the reverted branch before fixing it forward, and add the check that would have caught it.',
    ],
    verification: 'The client error rate is back to baseline, a cold-cache load of the primary route completes, and the served document references the expected build.',
    rollback: 'If the previous build is also broken, serve a maintenance page rather than leaving users on a blank one, and treat the API change shipped alongside it as the suspect.',
  },

  'frontend-performance-regression': {
    number: '0090',
    title: 'Diagnose a frontend performance regression',
    when: 'A field metric degrades, or the budget check fails on a change that has to ship.',
    prerequisites: [
      'Field measurements for the affected metric, at a percentile rather than an average.',
      'A build report for the current release and for the one before it.',
      'A lab profile captured on a throttled connection and a mid-range device.',
    ],
    steps: [
      'Confirm the regression is real: compare the same percentile, the same route, and the same population before drawing a conclusion.',
      'Diff the build report against the previous release — a single new dependency accounts for most step changes in weight.',
      'Separate what got heavier from what got later: a bundle that grew and a render that now waits on a request are different faults with different fixes.',
      'Profile the route on a throttled connection and mid-range device to find what blocks first paint and first interaction.',
      'Fix the cause rather than the number: defer, split, or drop the addition. Raising the budget is a decision that belongs in an ADR.',
    ],
    verification: 'The metric returns to its previous percentile in field data over a full traffic cycle, and the budget check passes without being edited.',
    rollback: 'Revert the change that introduced the weight. If it must ship, load it on demand behind the interaction that needs it, and record the exception.',
  },
};
