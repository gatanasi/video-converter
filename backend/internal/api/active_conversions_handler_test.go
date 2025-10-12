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

func TestActiveConversionsHandler(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		env := newHandlerTestEnv(t)

		status := &models.ConversionStatus{
			OutputPath: filepath.Join(env.convertedDir, "video1.mp4"),
			Format:     "mp4",
			Progress:   25.0,
			Complete:   false,
		}
		env.store.SetStatus("conv-1", status)

		req := httptest.NewRequest(http.MethodGet, RouteActiveConversions, nil)
		res := httptest.NewRecorder()

		env.handler.ActiveConversionsHandler(res, req)

		assert.Equal(t, http.StatusOK, res.Code)

		var payload []models.ActiveConversionInfo
		decodeErr := json.NewDecoder(res.Body).Decode(&payload)
		assert.NoError(t, decodeErr)
	})

	t.Run("method not allowed", func(t *testing.T) {
		env := newHandlerTestEnv(t)

		req := httptest.NewRequest(http.MethodPost, RouteActiveConversions, nil)
		res := httptest.NewRecorder()

		env.handler.ActiveConversionsHandler(res, req)

		assert.Equal(t, http.StatusMethodNotAllowed, res.Code)
	})
}
