# Backend Testing Documentation

## Overview

This document describes the comprehensive test suite for the video converter backend, following Go testing best practices with the testify framework.

## Test Coverage Snapshot

The following numbers were captured with `go test ./... -cover` on October 12, 2025:

- `internal/api`: **38.2%** — all HTTP handlers tested via table-driven cases with shared helpers
- `internal/utils`: **100.0%** — byte conversion helpers and formatting functions
- `internal/filestore`: **82.2%** — directory creation, filename sanitization, old-file cleanup
- `internal/conversion`: **2.5%** — quality configuration lookups
- `internal/middleware`: **97.4%** — CORS initialisation and request handling
- `internal/config`, `internal/drive`, `internal/models`: **0.0%** — candidates for future work

Coverage fluctuates as code evolves, so re-run the command above when reporting numbers.

### Go Testing Conventions

- ✅ Test files are named `*_test.go` and remain in the same package for white-box access
- ✅ Table-driven tests are preferred for input matrix coverage
- ✅ Shared setup lives in lightweight helpers instead of testify suites
- ✅ Documentation lives in `docs/` to guide contributors

## Test Framework

- **Framework**: [testify](https://github.com/stretchr/testify) v1.11.1 for `assert`/`require`
- **Pattern**: Table-driven tests plus focused helpers; no testify suite dependency
- **Environment**: Each handler test constructs fresh temp directories, config, store, and converter instances

## Endpoint Test Coverage

### 1. Config Endpoint (`/api/config`)

- `TestConfigHandler/success` — GET returns config with default folder ID
- `TestConfigHandler/method not allowed` — POST returns 405

### 2. Status Endpoint (`/api/conversion/status/{id}`)

- Success path returns stored status payload
- Missing ID yields 404 via `Conversion not found`

### 3. File Management (`/api/files`, `/api/file/delete/{filename}`, `/download/{filename}`)

- List handler sorts by modification time and returns empty results safely
- Delete handler is idempotent, returning success whether or not the file exists
- Download handler verifies path traversal protection and sets headers correctly

### 4. Active Conversions (`/api/conversions/active`)

- Success path returns queued and running jobs
- Non-GET requests receive 405 responses

### 5. Upload Convert (`/api/convert/upload`)

- Multipart uploads stream to disk, ensure queueing to converter, enforce max size
- Missing file field or unsupported format produces validation errors

### 6. Convert From Drive (`/api/convert/drive`)

- Validates required fields and restricts target format to `mp4` or `mov`
- Unknown quality names are logged, defaulting to safe presets

### 7. Abort Conversion (`/api/conversion/abort/{id}`)

- Covers nonexistent jobs, already-complete conversions, and normal abort path

### 8. Drive Video Listing (`/api/videos/drive`)

- Rejects missing `folderId`
- Restricts to GET with appropriate error messaging

## Test Patterns and Best Practices

### 1. Table-Driven Pattern
Tests cover both success and error cases for each endpoint.

### 2. Isolation
Each test runs inside a fresh `t.TempDir()` with brand-new handler instances and no shared state.

### 3. Realistic Testing
Handlers interact with real filesystem operations against temp directories and multipart form encoding for uploads.

### 4. Security Testing
Coverage includes path sanitization, filename validation, and rejection of unsupported formats.

### 5. Assertions
`assert` and `require` keep tests readable while failing fast on setup problems.

## Running the Tests

```bash
# Run all API tests
cd backend && go test ./internal/api -v

# Run with coverage
cd backend && go test ./internal/api -cover

# Run specific subtest
cd backend && go test ./internal/api -run 'TestConfigHandler/success' -v

# Run with race detection
cd backend && go test ./internal/api -race -v
```

## Dependencies

```
require (
    github.com/google/uuid v1.6.0
    github.com/stretchr/testify v1.11.1
)
```

## Notes

- Tests follow the official Go testing best practices
- Relies on a shared helper for consistent handler setup
- All file operations use temporary directories for safety
- Tests are independent and can run in any order
- No external dependencies required (mocked Google Drive calls)
