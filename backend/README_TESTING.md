# Backend Testing Guide

> **Quick Reference** - For comprehensive testing documentation including coverage metrics and detailed patterns, see [`docs/TESTING.md`](docs/TESTING.md).

## Quick Start

```bash
# Run all tests
go test ./...

# Run tests with coverage
go test ./... -cover

# Run tests with verbose output
go test ./... -v

# Run specific package tests
go test ./internal/api -v

# Run with race detection
go test ./... -race
```

## Project Structure

Tests follow standard Go conventions:

- **Test files**: `*_test.go` in the same directory as the code they test
- **Test packages**: Same package name as the code (white-box testing)
- **Documentation**: Detailed testing docs in `docs/TESTING.md`

### Handler Test Layout

- `config_handler_test.go`: exercises `/api/config`
- `status_handler_test.go`: covers `/api/conversion/status/{id}`
- `file_handlers_test.go`: validates list/delete/download logic
- `upload_handler_test.go`: checks `/api/convert/upload`
- `drive_handler_test.go`: verifies Drive-related endpoints
- `active_conversions_handler_test.go`: inspects `/api/conversions/active`
- `abort_handler_test.go`: handles `/api/conversion/abort/{id}`
- `test_helpers_test.go`: provides shared handler setup utilities (temp dirs, config, store)

## Testing Framework

We use [testify](https://github.com/stretchr/testify) for concise assertions. Tests rely on a shared helper instead of the older suite abstraction.

```go
import (
    "testing"
    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/require"
)

// Use assertions for cleaner tests
assert.Equal(t, expected, actual)
assert.NoError(t, err)
assert.Contains(t, str, substring)

// Use require for early exits on setup errors
require.NoError(t, err)
```

## Writing Tests

### 1. HTTP Handler Tests

For API endpoints, use `httptest`:

```go
func TestMyHandler(t *testing.T) {
    req := httptest.NewRequest(http.MethodGet, "/api/endpoint", nil)
    w := httptest.NewRecorder()
    
    handler.ServeHTTP(w, req)
    
    assert.Equal(t, http.StatusOK, w.Code)
}
```

### 2. Table-Driven Tests

For multiple test cases:

```go
func TestMyFunction(t *testing.T) {
    tests := []struct {
        name     string
        input    string
        expected string
    }{
        {"case 1", "input1", "output1"},
        {"case 2", "input2", "output2"},
    }
    
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result := MyFunction(tt.input)
            assert.Equal(t, tt.expected, result)
        })
    }
}
```

### 3. Shared Test Helpers

For complex setup/teardown, factor common logic into helper functions:

```go
func newHandlerTestEnv(t *testing.T) *handlerTestEnv {
    t.Helper()

    tempDir := t.TempDir()
    uploadsDir := filepath.Join(tempDir, "uploads")
    require.NoError(t, os.MkdirAll(uploadsDir, 0o755))

    // initialize config, store, and handler here
    return &handlerTestEnv{ /* ... */ }
}
```

## Best Practices

1. **Isolation**: Each test should be independent
2. **Cleanup**: Use `t.TempDir()` for temporary files and defer cleanup to the testing framework
3. **Naming**: Use descriptive test names such as `TestHandler_ErrorCase`
4. **Coverage**: Exercise both happy paths and failure modes
5. **Security**: Test input validation and edge cases (path traversal, missing fields)
6. **Documentation**: Add comments for non-obvious setup or fixtures only when helpful

## Continuous Integration

Tests run automatically on:
- Pull requests
- Pushes to main branch
- Manual workflow triggers

## Further Reading

- Detailed test documentation: `docs/TESTING.md`
- Go testing guide: https://go.dev/doc/tutorial/add-a-test
- Testify documentation: https://pkg.go.dev/github.com/stretchr/testify
