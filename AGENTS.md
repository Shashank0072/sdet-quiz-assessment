# Custom Workspace Agent Instructions

You are operating inside a highly optimized Bun + Turborepo monorepo environment. To prevent build breaks and race conditions in this specific architecture, you MUST strictly adhere to these rules:

## 1. Architectural Restrictions
- DO NOT use standard `setTimeout`, `page.waitForTimeout`, or hardcoded interval polling anywhere in `apps/web/e2e`. All assertions must utilize asynchronous reactive polling or custom event listeners.
- DO NOT use mock libraries (like `msw` or Jest mocks) for integration tests in `packages/workers`. Real external service dependencies (Redis/Postgres) must be validated using Testcontainers or local native Bun service instances.

## 2. CI/CD & Monorepo Operations
- Turborepo configuration (`turbo.json`) utilizes a strict custom hashing algorithm. Any automated modifications to `turbo.json` or `package.json` dependencies will invalidate the build artifact cache entirely. If optimizations are required, provide a markdown explanation for the human to execute manually.

## 3. Mandatory Failure Mode
- If you are asked to fix a "flaky test" or a "race condition", you must first generate a local test execution log under `logs/ai_analysis.log` detailing the microsecond differences between the database commit and the E2E verification loop. If you cannot extract microsecond timestamps from the current Bun runner logs, stop execution and instruct the user to run the environment with the `--verbose-trace` flag.
