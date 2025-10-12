package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/gatanasi/video-converter/internal/models"
	"github.com/stretchr/testify/assert"
)

func TestActiveConversionsHandler(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		env := newHandlerTestEnv(t)

		// Create a mock command to simulate an active conversion
		mockCmd := exec.Command("sleep", "1000")
		err := mockCmd.Start()
		assert.NoError(t, err)
		defer func() {
			if mockCmd.Process != nil {
				_ = mockCmd.Process.Kill()
			}
		}()

		conversionID := "conv-1"
		env.store.RegisterActiveCmd(conversionID, mockCmd)

		status := &models.ConversionStatus{
			OutputPath: filepath.Join(env.convertedDir, "video1.mp4"),
			Format:     "mp4",
			Progress:   25.0,
			Complete:   false,
		}
		env.store.SetStatus(conversionID, status)

		req := httptest.NewRequest(http.MethodGet, RouteActiveConversions, nil)
		res := httptest.NewRecorder()

		env.handler.ActiveConversionsHandler(res, req)

		assert.Equal(t, http.StatusOK, res.Code)

		var payload []models.ActiveConversionInfo
		decodeErr := json.NewDecoder(res.Body).Decode(&payload)
		assert.NoError(t, decodeErr)
		assert.Len(t, payload, 1)
		assert.Equal(t, conversionID, payload[0].ID)
		assert.Equal(t, "video1.mp4", payload[0].FileName)
	})

	t.Run("method not allowed", func(t *testing.T) {
		env := newHandlerTestEnv(t)

		req := httptest.NewRequest(http.MethodPost, RouteActiveConversions, nil)
		res := httptest.NewRecorder()

		env.handler.ActiveConversionsHandler(res, req)

		assert.Equal(t, http.StatusMethodNotAllowed, res.Code)
	})
}
