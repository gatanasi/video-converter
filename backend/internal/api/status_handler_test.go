package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/gatanasi/video-converter/internal/models"
	"github.com/stretchr/testify/assert"
)

func TestStatusHandler(t *testing.T) {
	t.Run("conversion found", func(t *testing.T) {
		env := newHandlerTestEnv(t)

		conversionID := "test-conversion-123"
		status := &models.ConversionStatus{
			InputPath:  filepath.Join(env.uploadsDir, "test.mov"),
			OutputPath: filepath.Join(env.convertedDir, "test.mp4"),
			Format:     "mp4",
			Quality:    "default",
			Progress:   50.0,
			Complete:   false,
		}
		env.store.SetStatus(conversionID, status)

		req := httptest.NewRequest(http.MethodGet, RouteConversionStatus+conversionID, nil)
		res := httptest.NewRecorder()

		env.handler.StatusHandler(res, req)

		assert.Equal(t, http.StatusOK, res.Code)

		var payload models.ConversionStatusResponse
		decodeErr := json.NewDecoder(res.Body).Decode(&payload)
		assert.NoError(t, decodeErr)
		assert.Equal(t, conversionID, payload.ID)
		assert.Equal(t, 50.0, payload.Progress)
		assert.False(t, payload.Complete)
		assert.Equal(t, "mp4", payload.Format)
	})

	t.Run("conversion not found", func(t *testing.T) {
		env := newHandlerTestEnv(t)

		req := httptest.NewRequest(http.MethodGet, RouteConversionStatus+"missing-id", nil)
		res := httptest.NewRecorder()

		env.handler.StatusHandler(res, req)

		assert.Equal(t, http.StatusNotFound, res.Code)

		var payload models.ConversionResponse
		decodeErr := json.NewDecoder(res.Body).Decode(&payload)
		assert.NoError(t, decodeErr)
		assert.False(t, payload.Success)
		assert.Contains(t, payload.Error, "not found")
	})
}
