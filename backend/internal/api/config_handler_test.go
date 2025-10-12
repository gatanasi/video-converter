package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gatanasi/video-converter/internal/models"
	"github.com/stretchr/testify/assert"
)

func TestConfigHandler(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		env := newHandlerTestEnv(t)

		req := httptest.NewRequest(http.MethodGet, RouteConfig, nil)
		res := httptest.NewRecorder()

		env.handler.ConfigHandler(res, req)

		assert.Equal(t, http.StatusOK, res.Code)
		assert.Equal(t, "application/json", res.Header().Get("Content-Type"))

		var payload struct {
			DefaultDriveFolderId string `json:"defaultDriveFolderId"`
		}
		decodeErr := json.NewDecoder(res.Body).Decode(&payload)
		assert.NoError(t, decodeErr)
		assert.Equal(t, "test-folder-id", payload.DefaultDriveFolderId)
	})

	t.Run("method not allowed", func(t *testing.T) {
		env := newHandlerTestEnv(t)

		req := httptest.NewRequest(http.MethodPost, RouteConfig, nil)
		res := httptest.NewRecorder()

		env.handler.ConfigHandler(res, req)

		assert.Equal(t, http.StatusMethodNotAllowed, res.Code)

		var payload models.ConversionResponse
		decodeErr := json.NewDecoder(res.Body).Decode(&payload)
		assert.NoError(t, decodeErr)
		assert.False(t, payload.Success)
		assert.Contains(t, payload.Error, "Method not allowed")
	})
}
