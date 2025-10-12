package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestInitCORS(t *testing.T) {
	t.Run("wildcard", func(t *testing.T) {
		InitCORS([]string{"*"})

		require.Len(t, AllowedOriginsMap, 1)
		assert.True(t, AllowedOriginsMap["*"])
	})

	t.Run("specific origins", func(t *testing.T) {
		origins := []string{"http://localhost:3000", "http://example.com"}
		InitCORS(origins)

		require.Len(t, AllowedOriginsMap, len(origins))
		for _, origin := range origins {
			assert.True(t, AllowedOriginsMap[origin])
		}
		assert.False(t, AllowedOriginsMap["*"])
	})

	t.Run("wildcard overrides specific", func(t *testing.T) {
		InitCORS([]string{"http://localhost:3000", "*", "http://example.com"})

		require.Len(t, AllowedOriginsMap, 1)
		assert.True(t, AllowedOriginsMap["*"])
	})
}

func TestCORS(t *testing.T) {
	t.Run("wildcard allows any origin", func(t *testing.T) {
		InitCORS([]string{"*"})
		handler := CORS(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))

		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		req.Header.Set("Origin", "http://example.com")
		res := httptest.NewRecorder()

		handler.ServeHTTP(res, req)

		assert.Equal(t, "*", res.Header().Get("Access-Control-Allow-Origin"))
		assert.Equal(t, http.StatusOK, res.Code)
	})

	t.Run("specific origin allowed", func(t *testing.T) {
		allowedOrigin := "http://localhost:3000"
		InitCORS([]string{allowedOrigin})
		handler := CORS(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))

		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		req.Header.Set("Origin", allowedOrigin)
		res := httptest.NewRecorder()

		handler.ServeHTTP(res, req)

		assert.Equal(t, allowedOrigin, res.Header().Get("Access-Control-Allow-Origin"))
		assert.Contains(t, res.Header().Get("Vary"), "Origin")
		assert.Equal(t, http.StatusOK, res.Code)
	})

	t.Run("origin not allowed", func(t *testing.T) {
		InitCORS([]string{"http://localhost:3000"})
		handler := CORS(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))

		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		req.Header.Set("Origin", "http://evil.com")
		res := httptest.NewRecorder()

		handler.ServeHTTP(res, req)

		assert.Equal(t, http.StatusForbidden, res.Code)
		assert.Contains(t, res.Body.String(), "CORS origin not allowed")
	})

	t.Run("preflight request allowed", func(t *testing.T) {
		InitCORS([]string{"*"})
		handler := CORS(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			t.Fatalf("handler should not be called for successful preflight")
		}))

		req := httptest.NewRequest(http.MethodOptions, "/test", nil)
		req.Header.Set("Origin", "http://example.com")
		req.Header.Set("Access-Control-Request-Method", http.MethodPost)
		res := httptest.NewRecorder()

		handler.ServeHTTP(res, req)

		assert.Equal(t, http.StatusOK, res.Code)
		assert.Equal(t, "*", res.Header().Get("Access-Control-Allow-Origin"))
		assert.Equal(t, "POST, GET, OPTIONS, PUT, DELETE", res.Header().Get("Access-Control-Allow-Methods"))
	})

	t.Run("request without origin is passed through", func(t *testing.T) {
		InitCORS([]string{"http://localhost:3000"})
		handler := CORS(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusNoContent)
		}))

		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		res := httptest.NewRecorder()

		handler.ServeHTTP(res, req)

		assert.Empty(t, res.Header().Get("Access-Control-Allow-Origin"))
		assert.Equal(t, http.StatusNoContent, res.Code)
	})
}
