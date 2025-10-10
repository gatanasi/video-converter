// Package config handles loading and managing application configuration
package config

import (
	"log"
	"os"
	"runtime"
	"strconv"
	"strings"

	"github.com/gatanasi/video-converter/internal/constants"
	"github.com/gatanasi/video-converter/internal/models"
)

// New loads configuration from environment variables and returns a Config struct
func New() models.Config {
	var config models.Config

	config.Port = getEnv("PORT", constants.DefaultPort)

	maxFileSizeMB := parseIntEnv("MAX_FILE_SIZE_MB", constants.DefaultMaxFileSizeMB)
	config.MaxFileSize = int64(maxFileSizeMB) * 1024 * 1024 // Convert MB to bytes

	config.UploadsDir = getEnv("UPLOADS_DIR", constants.DefaultUploadsDir)
	config.ConvertedDir = getEnv("CONVERTED_DIR", constants.DefaultConvertedDir)

	defaultWorkers := runtime.NumCPU()
	workerCountStr := getEnv("WORKER_COUNT", strconv.Itoa(defaultWorkers)) // Get string for logging
	config.WorkerCount = parseIntEnv("WORKER_COUNT", defaultWorkers)
	if config.WorkerCount < 1 {
		log.Printf("Warning: Invalid WORKER_COUNT '%s', using default %d", workerCountStr, defaultWorkers)
		config.WorkerCount = defaultWorkers
	}

	config.DefaultDriveFolderId = getEnv("DEFAULT_DRIVE_FOLDER_ID", "")
	if config.DefaultDriveFolderId != "" {
		log.Printf("Default Google Drive Folder ID configured: %s", config.DefaultDriveFolderId)
	}

	config.GoogleDriveAPIKey = os.Getenv("GOOGLE_DRIVE_API_KEY")
	if config.GoogleDriveAPIKey == "" {
		log.Fatal("FATAL: GOOGLE_DRIVE_API_KEY environment variable not set.")
	}

	allowedOriginsStr := getEnv("ALLOWED_ORIGINS", "")
	if allowedOriginsStr == "" {
		log.Println("Warning: ALLOWED_ORIGINS not set. Allowing all origins ('*'). THIS IS INSECURE FOR PRODUCTION.")
		config.AllowedOrigins = []string{"*"}
	} else {
		origins := strings.Split(allowedOriginsStr, ",")
		config.AllowedOrigins = make([]string, 0, len(origins))
		for _, origin := range origins {
			trimmed := strings.TrimSpace(origin)
			if trimmed != "" {
				config.AllowedOrigins = append(config.AllowedOrigins, trimmed)
			}
		}
	}

	log.Printf("Configuration loaded: Port=%s, MaxFileSize=%dMB, Workers=%d, AllowedOrigins=%v",
		config.Port, maxFileSizeMB, config.WorkerCount, config.AllowedOrigins)

	return config
}

// getEnv retrieves an environment variable or returns a default value.
func getEnv(key, fallback string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return fallback
}

// parseIntEnv retrieves an integer environment variable or returns a default.
func parseIntEnv(key string, fallback int) int {
	valueStr := getEnv(key, "")
	if valueStr == "" {
		return fallback
	}
	value, err := strconv.Atoi(valueStr)
	if err != nil {
		log.Printf("Warning: Invalid integer value for %s ('%s'), using default %d", key, valueStr, fallback)
		return fallback
	}
	return value
}
