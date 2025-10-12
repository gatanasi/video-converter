package api

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/gatanasi/video-converter/internal/conversion"
	"github.com/gatanasi/video-converter/internal/models"
	"github.com/stretchr/testify/require"
)

type handlerTestEnv struct {
	handler      *Handler
	store        *conversion.Store
	uploadsDir   string
	convertedDir string
}

func newHandlerTestEnv(t *testing.T) *handlerTestEnv {
	t.Helper()

	tempDir := t.TempDir()
	uploadsDir := filepath.Join(tempDir, "uploads")
	convertedDir := filepath.Join(tempDir, "converted")

	require.NoError(t, os.MkdirAll(uploadsDir, 0o755))
	require.NoError(t, os.MkdirAll(convertedDir, 0o755))

	config := models.Config{
		Port:                 "3000",
		MaxFileSize:          100 * 1024 * 1024,
		UploadsDir:           uploadsDir,
		ConvertedDir:         convertedDir,
		GoogleDriveAPIKey:    "test-api-key",
		WorkerCount:          2,
		AllowedOrigins:       []string{"*"},
		DefaultDriveFolderId: "test-folder-id",
	}

	store := conversion.NewStore()
	converter := conversion.NewVideoConverter(config.WorkerCount, store)

	return &handlerTestEnv{
		handler:      NewHandler(config, converter, store),
		store:        store,
		uploadsDir:   uploadsDir,
		convertedDir: convertedDir,
	}
}
