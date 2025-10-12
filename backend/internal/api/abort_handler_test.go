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

func TestAbortConversionHandler(t *testing.T) {
	t.Run("conversion not found", func(t *testing.T) {
		env := newHandlerTestEnv(t)

		req := httptest.NewRequest(http.MethodPost, RouteConversionAbort+"missing-id", nil)
		res := httptest.NewRecorder()

		env.handler.AbortConversionHandler(res, req)

		assert.Equal(t, http.StatusNotFound, res.Code)
	})

	t.Run("already complete", func(t *testing.T) {
		env := newHandlerTestEnv(t)

		conversionID := "completed-conversion"
		status := &models.ConversionStatus{
			OutputPath: filepath.Join(env.convertedDir, "test.mp4"),
			Progress:   100.0,
			Complete:   true,
		}
		env.store.SetStatus(conversionID, status)

		req := httptest.NewRequest(http.MethodPost, RouteConversionAbort+conversionID, nil)
		res := httptest.NewRecorder()

		env.handler.AbortConversionHandler(res, req)

		assert.Equal(t, http.StatusConflict, res.Code)

		var response models.ConversionResponse
		decodeErr := json.NewDecoder(res.Body).Decode(&response)
		assert.NoError(t, decodeErr)
		assert.False(t, response.Success)
		assert.Contains(t, response.Error, "already complete")
	})

	t.Run("successful abort", func(t *testing.T) {
		env := newHandlerTestEnv(t)

		conversionID := "active-conversion"
		// Create a mock command that won't actually run
		mockCmd := exec.Command("sleep", "1000")
		err := mockCmd.Start()
		assert.NoError(t, err)

		// Register the active command in the store
		env.store.RegisterActiveCmd(conversionID, mockCmd)

		status := &models.ConversionStatus{
			OutputPath: filepath.Join(env.convertedDir, "test.mp4"),
			Progress:   50.0,
			Complete:   false,
		}
		env.store.SetStatus(conversionID, status)

		req := httptest.NewRequest(http.MethodPost, RouteConversionAbort+conversionID, nil)
		res := httptest.NewRecorder()

		env.handler.AbortConversionHandler(res, req)

		assert.Equal(t, http.StatusOK, res.Code)

		var response models.ConversionResponse
		decodeErr := json.NewDecoder(res.Body).Decode(&response)
		assert.NoError(t, decodeErr)
		assert.True(t, response.Success)

		// Clean up the process
		if mockCmd.Process != nil {
			_ = mockCmd.Process.Kill()
		}
	})
}
