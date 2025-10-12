package api

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gatanasi/video-converter/internal/models"
	"github.com/stretchr/testify/assert"
)

func TestUploadConvertHandler(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		env := newHandlerTestEnv(t)

		var body bytes.Buffer
		writer := multipart.NewWriter(&body)

		fileWriter, fileErr := writer.CreateFormFile("videoFile", "test-video.mov")
		assert.NoError(t, fileErr)
		_, writeErr := fileWriter.Write([]byte("fake video content"))
		assert.NoError(t, writeErr)

		assert.NoError(t, writer.WriteField("targetFormat", "mp4"))
		assert.NoError(t, writer.WriteField("quality", "default"))
		assert.NoError(t, writer.WriteField("reverseVideo", "false"))
		assert.NoError(t, writer.WriteField("removeSound", "false"))

		assert.NoError(t, writer.Close())

		req := httptest.NewRequest(http.MethodPost, RouteConvertUpload, &body)
		req.Header.Set("Content-Type", writer.FormDataContentType())
		res := httptest.NewRecorder()

		env.handler.UploadConvertHandler(res, req)

		assert.Equal(t, http.StatusAccepted, res.Code)

		var payload models.ConversionResponse
		decodeErr := json.NewDecoder(res.Body).Decode(&payload)
		assert.NoError(t, decodeErr)
		assert.True(t, payload.Success)
		assert.NotEmpty(t, payload.ConversionID)
	})

	t.Run("missing file", func(t *testing.T) {
		env := newHandlerTestEnv(t)

		var body bytes.Buffer
		writer := multipart.NewWriter(&body)
		assert.NoError(t, writer.WriteField("targetFormat", "mp4"))
		assert.NoError(t, writer.Close())

		req := httptest.NewRequest(http.MethodPost, RouteConvertUpload, &body)
		req.Header.Set("Content-Type", writer.FormDataContentType())
		res := httptest.NewRecorder()

		env.handler.UploadConvertHandler(res, req)

		assert.Equal(t, http.StatusBadRequest, res.Code)

		var payload models.ConversionResponse
		decodeErr := json.NewDecoder(res.Body).Decode(&payload)
		assert.NoError(t, decodeErr)
		assert.False(t, payload.Success)
		assert.Contains(t, payload.Error, "videoFile")
	})

	t.Run("file exceeds max size", func(t *testing.T) {
		env := newHandlerTestEnv(t)

		var body bytes.Buffer
		writer := multipart.NewWriter(&body)

		fileWriter, fileErr := writer.CreateFormFile("videoFile", "huge-video.mov")
		assert.NoError(t, fileErr)

		// Create a file larger than MaxFileSize (100 MB in test config)
		// Write 101 MB of data
		largeData := make([]byte, 101*1024*1024)
		_, writeErr := fileWriter.Write(largeData)
		assert.NoError(t, writeErr)

		assert.NoError(t, writer.WriteField("targetFormat", "mp4"))
		assert.NoError(t, writer.Close())

		req := httptest.NewRequest(http.MethodPost, RouteConvertUpload, &body)
		req.Header.Set("Content-Type", writer.FormDataContentType())
		res := httptest.NewRecorder()

		env.handler.UploadConvertHandler(res, req)

		assert.Equal(t, http.StatusRequestEntityTooLarge, res.Code)

		var payload models.ConversionResponse
		decodeErr := json.NewDecoder(res.Body).Decode(&payload)
		assert.NoError(t, decodeErr)
		assert.False(t, payload.Success)
		assert.Contains(t, payload.Error, "exceeds maximum allowed size")
	})
}
