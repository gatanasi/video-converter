# Guidance for Agents in this repo

This file defines how you should operate when working in this repository via AI Agents.
Priorities: (1) correctness, (2) maintainability, (3) minimizing churn, (4) speed.

---

## 1) Core operating principles

### 1.1 Plan-first for non-trivial work
For anything beyond a tiny edit, **start by writing a plan** before making changes.

A task is “non-trivial” if it involves any of the following:
- Multiple files / modules
- New feature or behavioral change
- Debugging a failing test/build
- Refactoring or performance work
- Any uncertainty about requirements or expected behavior

**Planning requirements**
- Break the work into small, verifiable steps.
- Identify risks/unknowns and how you’ll validate them.
- Call out assumptions explicitly.
- If you discover new information mid-way, update the plan.

**Default behavior**
- Unless the user explicitly asks you to wait, proceed after presenting the plan.
- Ask for confirmation before large/risky changes (broad refactors, dependency changes, migrations, deletions).

### 1.2 Prefer holistic solutions (avoid “patch file after file”)
Do not fix symptoms one file at a time without addressing the root cause.

When implementing a fix or feature:
- Start from the underlying design/abstraction and apply a consistent solution across the codebase.
- Prefer improving a shared abstraction/util/module over duplicating logic in multiple places.
- Update all impacted call sites in the same change.
- Keep behavior consistent across the system (error handling, logging, types, naming, API shapes).
- If you touch code paths, also update tests and documentation where appropriate.

Your goal is a **cohesive end state**, not a trail of incremental band-aids.

### 1.3 Use MCP servers when available
When Model Context Protocol (MCP) servers are available, **use them**.

**Rules**
- At the start of a task (or when you need external/system context), discover what MCP servers/tools are available and select the best match.
- Prefer MCP tools over guessing, brittle scraping, or re-implementing integrations.
- If an MCP server exists for the target system (GitHub, Jira, DB, cloud, docs, etc.), use it for authoritative info.
- If no relevant MCP server is available, say so and proceed with best-effort local analysis.

When you use MCP tools:
- Be explicit about *which* MCP server/tools you used and *what* you learned from them.
- Treat tool outputs as source-of-truth; don’t “fill in” missing details.

### 1.4 Be correct and verifiable
- Don’t invent APIs, file paths, or configs—verify them.
- Prefer reading existing code and patterns before introducing new ones.
- Run relevant tests/linters/build steps when possible.
- If you can’t run something locally, explain what should be run and why.

---

## 2) Standard workflow (follow this structure)

### Step 0 — Context & constraints
- Restate the goal in 1–2 lines.
- Identify relevant parts of the repo (entry points, modules, configs).
- List any missing info you need; ask targeted questions if required.

### Step 1 — Plan
Provide a plan using this template:

#### Plan
1. **Discovery / current behavior**
   - What you’ll inspect (files, configs, tests, logs)
2. **Design / approach**
   - What abstraction or architecture you’ll follow
3. **Implementation steps**
   - Small steps with clear completion criteria
4. **Validation**
   - Tests, lint, build, runtime checks
5. **Risks & rollback**
   - What could go wrong and how to mitigate

Keep steps small and sequenced. Prefer steps that can be validated independently.

### Step 2 — Execute (incrementally)
- Implement in the order of the plan.
- Keep changes cohesive and avoid drive-by edits.
- If the plan changes, update it and explain why.

### Step 3 — Quality gates
Before concluding:
- Ensure formatting/linting follows repo conventions.
- Add/update tests that cover the behavior change or bug fix.
- Update docs/readme/comments if behavior or usage changed.
- Confirm no broken imports, dead code, or inconsistent naming.

### Step 4 — Report back
Finish with:
- **Summary of changes** (what and why)
- **Files touched** (high-level)
- **How to verify** (exact commands or steps)
- **Follow-ups** (only if truly necessary)

---

## 3) Code-change guidelines

### 3.1 Minimize churn, maximize coherence
- Avoid reformatting unrelated code.
- Avoid renaming for aesthetics unless it materially improves clarity and is consistently applied.
- Prefer a small number of well-chosen edits that fix the root cause.

### 3.2 Follow existing patterns
- Match existing conventions for:
  - directory structure
  - naming
  - error handling
  - logging
  - configuration
  - dependency injection / state management
- Don’t introduce new dependencies unless there’s a clear, repo-consistent reason.

### 3.3 Tests are part of the solution
When behavior changes or bugs are fixed:
- Add or update tests to lock in correct behavior.
- Prefer tests that would have failed before your change.

### 3.4 Documentation counts
If you change how something is used or configured:
- Update README/docs/config comments accordingly.

---

## 4) Project Specifics

### 4.1 Architecture
- **Type**: Monorepo with Backend (Go) and Frontend (TypeScript).
- **Backend**: Go 1.25+.
    - **Router**: Standard `net/http` with custom middleware/routing logic (implied by file structure, verify if complex routing needed).
    - **Key Libs**: `google/uuid`, `stretchr/testify` (tests).
    - **External Deps**: `ffmpeg`, `exiftool`.
- **Frontend**: TypeScript (No Framework / Vanilla).
    - **Build**: `esbuild`.
    - **Key Libs**: None (minimal dependencies).
- **Deployment**: Docker Compose.

### 4.2 Key Directories
- `backend/`: Go application source code.
- `frontend/`: TypeScript application source code.
- `docker/`: Docker configuration and scripts.
- `tests/`: Smoke/Integration tests.
- `.github/workflows/`: CI/CD definitions.

---

## 5) Project-specific commands

> **Note**: This project uses a root-level `pnpm-lock.yaml`. Always run `pnpm` commands from the root or use filter.

- **Install Dependencies**:
  - Root/Frontend: `pnpm install`
  - Backend: `cd backend && go mod download`
- **Build**:
  - Frontend: `pnpm --filter ./frontend run build`
  - Backend: `cd backend && go build ./cmd/server`
  - Docker: `docker compose build` (or `docker build .`)
- **Run (Dev)**:
  - Backend: `cd backend && go run ./cmd/server/main.go`
  - Frontend: `pnpm --filter ./frontend exec npx serve dist` (after build)
  - Full Stack: `docker compose up`
- **Test**:
  - Backend: `cd backend && go test -v ./...`
  - Frontend: *No unit tests configured currently.*
  - Smoke/E2E: `pnpm test:smoke` (requires Docker/Environment setup)
- **Lint**:
  - Backend: `golangci-lint run` (inside `backend/`)
  - Frontend: `pnpm --filter ./frontend run lint`
- **Format**:
  - Go: `gofmt -w .`

---

## 6) “Definition of done”
A task is done when:
- The plan has been executed (or consciously revised) and validated.
- The solution is holistic (root-cause addressed; call sites updated).
- Tests and docs are updated appropriately.
- You’ve provided clear verification steps.
