package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/gatanasi/video-converter/internal/models"
	"github.com/stretchr/testify/assert"
)

func TestListFilesHandler(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		env := newHandlerTestEnv(t)

		first := filepath.Join(env.convertedDir, "video1.mp4")
		second := filepath.Join(env.convertedDir, "video2.mov")

		writeErr := os.WriteFile(first, []byte("test content 1"), 0o644)
		assert.NoError(t, writeErr)
		time.Sleep(10 * time.Millisecond)
		writeErr = os.WriteFile(second, []byte("test content 2"), 0o644)
		assert.NoError(t, writeErr)

		req := httptest.NewRequest(http.MethodGet, RouteListFiles, nil)
		res := httptest.NewRecorder()

		env.handler.ListFilesHandler(res, req)

		assert.Equal(t, http.StatusOK, res.Code)

		var files []models.FileInfo
		decodeErr := json.NewDecoder(res.Body).Decode(&files)
		assert.NoError(t, decodeErr)
		assert.Len(t, files, 2)
		assert.Equal(t, "video2.mov", files[0].Name)
		assert.Equal(t, "video1.mp4", files[1].Name)
	})

	t.Run("empty directory", func(t *testing.T) {
		env := newHandlerTestEnv(t)

		req := httptest.NewRequest(http.MethodGet, RouteListFiles, nil)
		res := httptest.NewRecorder()

		env.handler.ListFilesHandler(res, req)

		assert.Equal(t, http.StatusOK, res.Code)

		var files []models.FileInfo
		decodeErr := json.NewDecoder(res.Body).Decode(&files)
		assert.NoError(t, decodeErr)
		assert.Empty(t, files)
	})
}

func TestDeleteFileHandler(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		env := newHandlerTestEnv(t)

		target := filepath.Join(env.convertedDir, "test-delete.mp4")
		writeErr := os.WriteFile(target, []byte("test content"), 0o644)
		assert.NoError(t, writeErr)

		req := httptest.NewRequest(http.MethodDelete, RouteDeleteFile+"test-delete.mp4", nil)
		res := httptest.NewRecorder()

		env.handler.DeleteFileHandler(res, req)

		assert.Equal(t, http.StatusOK, res.Code)

		var payload map[string]any
		decodeErr := json.NewDecoder(res.Body).Decode(&payload)
		assert.NoError(t, decodeErr)
		assert.True(t, payload["success"].(bool))

		_, statErr := os.Stat(target)
		assert.True(t, os.IsNotExist(statErr))
	})

	t.Run("file not found", func(t *testing.T) {
		env := newHandlerTestEnv(t)

		req := httptest.NewRequest(http.MethodDelete, RouteDeleteFile+"missing.mp4", nil)
		res := httptest.NewRecorder()

		env.handler.DeleteFileHandler(res, req)

		assert.Equal(t, http.StatusOK, res.Code)

		var payload map[string]any
		decodeErr := json.NewDecoder(res.Body).Decode(&payload)
		assert.NoError(t, decodeErr)
		assert.True(t, payload["success"].(bool))
	})
}

func TestDownloadHandler(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		env := newHandlerTestEnv(t)

		content := []byte("test video content")
		target := filepath.Join(env.convertedDir, "test-download.mp4")
		writeErr := os.WriteFile(target, content, 0o644)
		assert.NoError(t, writeErr)

		req := httptest.NewRequest(http.MethodGet, RouteDownload+"test-download.mp4", nil)
		res := httptest.NewRecorder()

		env.handler.DownloadHandler(res, req)

		assert.Equal(t, http.StatusOK, res.Code)
		assert.Equal(t, "video/mp4", res.Header().Get("Content-Type"))
		assert.Contains(t, res.Header().Get("Content-Disposition"), "attachment")
		assert.Equal(t, content, res.Body.Bytes())
	})

	t.Run("invalid filename", func(t *testing.T) {
		env := newHandlerTestEnv(t)

		req := httptest.NewRequest(http.MethodGet, RouteDownload+"../../../etc/passwd", nil)
		res := httptest.NewRecorder()

		env.handler.DownloadHandler(res, req)

		assert.Equal(t, http.StatusBadRequest, res.Code)
	})
}
