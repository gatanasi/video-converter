package filestore

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestEnsureDirectoryExists(t *testing.T) {
	t.Run("creates directory", func(t *testing.T) {
		baseDir := t.TempDir()
		target := filepath.Join(baseDir, "nested")

		err := EnsureDirectoryExists(target)
		require.NoError(t, err)

		info, statErr := os.Stat(target)
		require.NoError(t, statErr)
		assert.True(t, info.IsDir())
	})

	t.Run("creates nested directories", func(t *testing.T) {
		baseDir := t.TempDir()
		target := filepath.Join(baseDir, "parent", "child", "grandchild")

		err := EnsureDirectoryExists(target)
		require.NoError(t, err)

		info, statErr := os.Stat(target)
		require.NoError(t, statErr)
		assert.True(t, info.IsDir())
	})

	t.Run("returns error on empty path", func(t *testing.T) {
		err := EnsureDirectoryExists("")
		require.Error(t, err)
		assert.Contains(t, err.Error(), "empty directory path")
	})

	t.Run("idempotent for existing directory", func(t *testing.T) {
		baseDir := t.TempDir()
		target := filepath.Join(baseDir, "existing")

		require.NoError(t, EnsureDirectoryExists(target))
		require.NoError(t, EnsureDirectoryExists(target))
	})
}

func TestSanitizeFilename(t *testing.T) {
	t.Run("normalizes common cases", func(t *testing.T) {
		cases := map[string]string{
			"video.mp4":           "video.mp4",
			"my video file.mov":   "my_video_file.mov",
			"file@#$%^&*().mp4":   "file_.mp4",
			"/path/to/file.mp4":   "file.mp4",
			"..\\weird\\path.mp4": "weird_path.mp4",
		}

		for input, expected := range cases {
			input, expected := input, expected
			t.Run(input, func(t *testing.T) {
				t.Parallel()
				assert.Equal(t, expected, SanitizeFilename(input))
			})
		}
	})

	t.Run("falls back for empty or invalid names", func(t *testing.T) {
		cases := []string{"", "...", "@#$%^&*()"}
		for _, input := range cases {
			input := input
			t.Run("fallback_"+input, func(t *testing.T) {
				t.Parallel()
				sanitized := SanitizeFilename(input)
				assert.NotEmpty(t, sanitized)
				assert.Contains(t, sanitized, "sanitized_fallback")
			})
		}
	})

	t.Run("enforces maximum length", func(t *testing.T) {
		var builder string
		for i := 0; i < 200; i++ {
			builder += "a"
		}
		builder += ".mp4"

		sanitized := SanitizeFilename(builder)
		assert.LessOrEqual(t, len(sanitized), 100)
		assert.Greater(t, len(sanitized), 0)
	})
}

func TestCleanupOldFiles(t *testing.T) {
	t.Run("removes files older than max age", func(t *testing.T) {
		dir := t.TempDir()
		oldFile := filepath.Join(dir, "old.txt")
		recentFile := filepath.Join(dir, "recent.txt")

		require.NoError(t, os.WriteFile(oldFile, []byte("old"), 0o644))
		oldTimestamp := time.Now().Add(-25 * time.Hour)
		require.NoError(t, os.Chtimes(oldFile, oldTimestamp, oldTimestamp))

		require.NoError(t, os.WriteFile(recentFile, []byte("recent"), 0o644))

		removed := CleanupOldFiles(dir, 24*time.Hour)
		assert.Equal(t, 1, removed)

		_, err := os.Stat(oldFile)
		assert.True(t, os.IsNotExist(err))

		_, err = os.Stat(recentFile)
		assert.NoError(t, err)
	})

	t.Run("returns zero for empty directory", func(t *testing.T) {
		dir := t.TempDir()
		removed := CleanupOldFiles(dir, 24*time.Hour)
		assert.Equal(t, 0, removed)
	})
}
