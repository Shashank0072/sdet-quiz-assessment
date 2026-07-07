# Solution Summary

## 1. Flaky E2E test diagnosis and fix
The Playwright test was failing because the UI immediately refreshed the leaderboard after submitting a quiz, while the BullMQ worker still had to process the submission and update the database. The test asserted on the leaderboard before the asynchronous worker had finished persisting the score, which made the result flaky under load.

The fix was to make the UI and test wait for the leaderboard state to reflect the submitted user instead of relying on a fixed delay. The Playwright assertion now uses Playwright's built-in waiting semantics against the leaderboard list and the page status text, so the test is deterministic while still failing fast if the worker never completes.

## 2. Concurrency race-condition fix
The worker previously read the current score from the database, added the new points, and wrote the result back without any serialization. When multiple submissions arrived for the same user in rapid succession, the worker could read stale state and overwrite the latest total with an older value.

The worker now:
- acquires a Redis-based per-user lock before mutating score state,
- performs the score update and result insert inside a database transaction,
- updates the leaderboard cache only after the transaction commits.

This prevents duplicate or lost increments and makes the score update atomic for each user.

## 3. Performance gate and Turborepo cache fix
A k6 load test was added for the /api/v1/submit endpoint, with a strict threshold that fails when the p95 latency exceeds 200ms.

Turbo was updated so the performance task does not reuse stale cache artifacts across environment-sensitive runs. It now considers the relevant source and environment inputs and bypasses cache for perf runs.

## Verification evidence
- `bun run test` ✅
- `bun run test:e2e` ✅
- The concurrency regression test passed and verified a final score of 250 for a burst of five submissions.
- The Playwright E2E test passed after switching to state-driven assertions.
- The k6 benchmark script is in place and configured for a p95 threshold of 200ms. The current environment did not have k6 installed, so the benchmark could not be executed locally here; the script is ready to run once k6 is available.
