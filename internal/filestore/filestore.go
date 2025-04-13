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
	err := os.MkdirAll(dirPath, 0755) // Use 0755 permissions
	if err != nil {
		return fmt.Errorf("failed to create directory %s: %v", dirPath, err)
	}
	return nil
}

// SanitizeFilename sanitizes a filename to be safe for file system operations
func SanitizeFilename(fileName string) string {
	if fileName == "" {
		return "" // Return empty if input is empty
	}
	
	// Get base name to prevent path manipulation like "../../etc/passwd"
	baseName := filepath.Base(fileName)
	
	// Replace potentially harmful characters with underscores
	sanitized := filenameSanitizeRegex.ReplaceAllString(baseName, "_")
	
	// Replace multiple consecutive underscores with a single one
	sanitized = regexp.MustCompile(`_+`).ReplaceAllString(sanitized, "_")
	
	// Trim leading/trailing underscores/dots that might cause issues
	sanitized = strings.Trim(sanitized, "._")

	// Limit length to prevent excessively long names
	maxLength := 100
	if len(sanitized) > maxLength {
		// Try to keep the extension if possible
		ext := filepath.Ext(sanitized)
		base := strings.TrimSuffix(sanitized, ext)
		
		// Handle multibyte characters correctly
		runes := []rune(base)
		if len(runes) > maxLength-len(ext) {
			base = string(runes[:maxLength-len(ext)])
		}
		sanitized = base + ext
	}
	
	// Check if sanitization resulted in empty/invalid name
	if sanitized == "" || sanitized == "." || sanitized == ".." {
		return fmt.Sprintf("sanitized_fallback_%d", time.Now().UnixNano())
	}
	return sanitized
}

// CleanupOldFiles removes files older than maxAge from the specified directory
func CleanupOldFiles(dirPath string, maxAge time.Duration) int {
	entries, err := os.ReadDir(dirPath)
	if err != nil {
		if os.IsNotExist(err) {
			return 0 // Directory doesn't exist, nothing to cleanup
		}
		log.Printf("Error reading directory %s for cleanup: %v", dirPath, err)
		return 0
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
			if err != nil {
				// Avoid logging errors for files that might already be deleted
				if !os.IsNotExist(err) {
					log.Printf("Error removing old file %s: %v", filePath, err)
				}
			} else {
				removedCount++
			}
		}
	}
	
	if removedCount > 0 {
		log.Printf("Removed %d old files from %s", removedCount, dirPath)
	}
	return removedCount
}