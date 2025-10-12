# Smoke Tests

This package contains end-to-end smoke tests executed against a running Docker
instance of the Video Converter application. They are designed to validate that
critical API endpoints respond with the expected status codes and that the
frontend bundle can be served after a fresh build.

## Running Locally

```bash
pnpm test:smoke
```

The command above wraps `tests/run-smoke-tests.sh`, which performs the
following steps:

1. Builds and starts the application through `docker-compose.dev.yml` to ensure
   the local Dockerfile and source tree are exercised.
2. Waits until the container passes its health check.
3. Executes the TypeScript smoke tests via `pnpm --filter smoke-tests test`.
4. Tears down the container (unless `CLEANUP=false` is exported).

Environment variables such as `GOOGLE_DRIVE_API_KEY` can be overridden before
running the script. Reasonable defaults are applied when they are absent so that
local development remains frictionless.

## Continuous Integration

The GitHub Actions workflow `.github/workflows/smoke-tests.yml` runs the same
`pnpm test:smoke` command, keeping local and CI executions consistent.

## Project Structure

- `run-smoke-tests.sh` – Orchestrates container lifecycle and test execution.
- `smoke-tests.ts` – Implements the HTTP-level assertions using native `fetch`.
- `tsconfig.json` – Extends the frontend TypeScript configuration for the smoke
  test workspace.
