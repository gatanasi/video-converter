package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gatanasi/video-converter/internal/models"
	"github.com/stretchr/testify/assert"
)

func TestConvertFromDriveHandler(t *testing.T) {
	t.Run("missing fields", func(t *testing.T) {
		env := newHandlerTestEnv(t)

		request := models.DriveConversionRequest{
			FileID:       "",
			FileName:     "test.mov",
			TargetFormat: "mp4",
		}
		payload, marshalErr := json.Marshal(request)
		assert.NoError(t, marshalErr)

		req := httptest.NewRequest(http.MethodPost, RouteConvertFromDrive, bytes.NewReader(payload))
		req.Header.Set("Content-Type", "application/json")
		res := httptest.NewRecorder()

		env.handler.ConvertFromDriveHandler(res, req)

		assert.Equal(t, http.StatusBadRequest, res.Code)

		var response models.ConversionResponse
		decodeErr := json.NewDecoder(res.Body).Decode(&response)
		assert.NoError(t, decodeErr)
		assert.False(t, response.Success)
		assert.Contains(t, response.Error, "required fields")
	})

	t.Run("invalid format", func(t *testing.T) {
		env := newHandlerTestEnv(t)

		request := models.DriveConversionRequest{
			FileID:       "test-file-id",
			FileName:     "test.mov",
			TargetFormat: "avi",
		}
		payload, marshalErr := json.Marshal(request)
		assert.NoError(t, marshalErr)

		req := httptest.NewRequest(http.MethodPost, RouteConvertFromDrive, bytes.NewReader(payload))
		req.Header.Set("Content-Type", "application/json")
		res := httptest.NewRecorder()

		env.handler.ConvertFromDriveHandler(res, req)

		assert.Equal(t, http.StatusBadRequest, res.Code)

		var response models.ConversionResponse
		decodeErr := json.NewDecoder(res.Body).Decode(&response)
		assert.NoError(t, decodeErr)
		assert.False(t, response.Success)
		assert.Contains(t, response.Error, "Invalid target format")
	})
}

func TestListDriveVideosHandler(t *testing.T) {
	t.Run("missing folder id", func(t *testing.T) {
		env := newHandlerTestEnv(t)

		req := httptest.NewRequest(http.MethodGet, RouteListDriveVideos, nil)
		res := httptest.NewRecorder()

		env.handler.ListDriveVideosHandler(res, req)

		assert.Equal(t, http.StatusBadRequest, res.Code)

		var response models.ConversionResponse
		decodeErr := json.NewDecoder(res.Body).Decode(&response)
		assert.NoError(t, decodeErr)
		assert.False(t, response.Success)
		assert.Contains(t, response.Error, "folderId")
	})

	t.Run("method not allowed", func(t *testing.T) {
		env := newHandlerTestEnv(t)

		req := httptest.NewRequest(http.MethodPost, RouteListDriveVideos+"?folderId=test", nil)
		res := httptest.NewRecorder()

		env.handler.ListDriveVideosHandler(res, req)

		assert.Equal(t, http.StatusMethodNotAllowed, res.Code)
	})
}
