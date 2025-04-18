// Package filestore handles file storage and management operations
package filestore

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

var filenameSanitizeRegex = regexp.MustCompile(`[^a-zA-Z0-9._-]+`)

// EnsureDirectoryExists ensures the specified directory exists
func EnsureDirectoryExists(dirPath string) error {
	if dirPath == "" {
		return fmt.Errorf("empty directory path")
	}
	// Use MkdirAll which is idempotent and creates parent dirs if needed
	if err := os.MkdirAll(dirPath, 0755); err != nil {
		return fmt.Errorf("failed to create directory %s: %w", dirPath, err)
	}
	return nil
}

// SanitizeFilename sanitizes a filename to be safe for file system operations
func SanitizeFilename(fileName string) string {
	if fileName == "" {
		return ""
	}

	baseName := filepath.Base(fileName)
	sanitized := filenameSanitizeRegex.ReplaceAllString(baseName, "_")
	sanitized = regexp.MustCompile(`_+`).ReplaceAllString(sanitized, "_")
	sanitized = strings.Trim(sanitized, "._")

	// Limit length
	const maxLength = 100
	if len(sanitized) > maxLength {
		ext := filepath.Ext(sanitized)
		// Ensure base name length calculation handles multibyte characters correctly
		baseRunes := []rune(strings.TrimSuffix(sanitized, ext))
		maxBaseLen := maxLength - len(ext)
		if len(baseRunes) > maxBaseLen {
			sanitized = string(baseRunes[:maxBaseLen]) + ext
		}
	}

	if sanitized == "" || sanitized == "." || sanitized == ".." {
		// Fallback for edge cases where sanitization results in an invalid name
		return fmt.Sprintf("sanitized_fallback_%d", time.Now().UnixNano())
	}
	return sanitized
}

// CleanupOldFiles removes files older than maxAge from the specified directory
func CleanupOldFiles(dirPath string, maxAge time.Duration) int {
	entries, err := os.ReadDir(dirPath)
	if err != nil {
		if !os.IsNotExist(err) { // Log only if it's not a "directory not found" error
			log.Printf("Error reading directory %s for cleanup: %v", dirPath, err)
		}
		return 0 // Directory doesn't exist or error reading, nothing removed
	}

	now := time.Now()
	removedCount := 0
	for _, entry := range entries {
		if entry.IsDir() {
			continue // Skip subdirectories
		}
		info, err := entry.Info()
		if err != nil {
			log.Printf("Error getting info for file %s in %s during cleanup: %v", entry.Name(), dirPath, err)
			continue
		}

		if now.Sub(info.ModTime()) > maxAge {
			filePath := filepath.Join(dirPath, entry.Name())
			err := os.Remove(filePath)
			if err != nil && !os.IsNotExist(err) { // Avoid logging errors for files already deleted
				log.Printf("Error removing old file %s: %v", filePath, err)
			} else if err == nil {
				removedCount++
			}
		}
	}

	if removedCount > 0 {
		log.Printf("Removed %d old files from %s", removedCount, dirPath)
	}
	return removedCount
}
