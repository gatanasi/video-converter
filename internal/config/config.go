// Package config handles loading and managing application configuration
package config

import (
	"log"
	"os"
	"runtime"
	"strconv"
	"strings"

	"github.com/gatanasi/video-converter/internal/models"
)

// New loads configuration from environment variables and returns a Config struct
func New() models.Config {
	var config models.Config

	config.Port = getEnv("PORT", "3000")
	
	// Parse max file size
	maxFileSizeStr := getEnv("MAX_FILE_SIZE_MB", "2000")
	maxFileSizeMB, err := strconv.ParseInt(maxFileSizeStr, 10, 64)
	if err != nil {
		log.Printf("Warning: Invalid MAX_FILE_SIZE_MB '%s', using default 2000MB", maxFileSizeStr)
		maxFileSizeMB = 2000
	}
	config.MaxFileSize = maxFileSizeMB * 1024 * 1024 // Convert MB to bytes

	// Set directory paths
	config.UploadsDir = getEnv("UPLOADS_DIR", "uploads")
	config.ConvertedDir = getEnv("CONVERTED_DIR", "converted")

	// Parse worker count
	workerCountStr := getEnv("WORKER_COUNT", strconv.Itoa(runtime.NumCPU()))
	config.WorkerCount, err = strconv.Atoi(workerCountStr)
	if err != nil || config.WorkerCount < 1 {
		log.Printf("Warning: Invalid WORKER_COUNT '%s', using default %d", workerCountStr, runtime.NumCPU())
		config.WorkerCount = runtime.NumCPU()
	}

	// Get default Google Drive folder ID
	config.DefaultDriveFolderId = getEnv("DEFAULT_DRIVE_FOLDER_ID", "")
	if config.DefaultDriveFolderId != "" {
		log.Printf("Default Google Drive Folder ID configured: %s", config.DefaultDriveFolderId)
	}

	// Get Google Drive API key
	config.GoogleDriveAPIKey = os.Getenv("GOOGLE_DRIVE_API_KEY")
	if config.GoogleDriveAPIKey == "" {
		log.Fatal("FATAL: GOOGLE_DRIVE_API_KEY environment variable not set.")
	}

	// Parse allowed origins for CORS
	allowedOriginsStr := getEnv("ALLOWED_ORIGINS", "")
	if allowedOriginsStr == "" {
		log.Println("Warning: ALLOWED_ORIGINS environment variable not set. Allowing all origins (*). THIS IS INSECURE FOR PRODUCTION.")
		config.AllowedOrigins = []string{"*"}
	} else {
		config.AllowedOrigins = strings.Split(allowedOriginsStr, ",")
		// Trim whitespace from each origin
		for i := range config.AllowedOrigins {
			config.AllowedOrigins[i] = strings.TrimSpace(config.AllowedOrigins[i])
		}
	}

	log.Printf("Configuration loaded: Port=%s, MaxFileSize=%dMB, Workers=%d, AllowedOrigins=%v",
		config.Port, maxFileSizeMB, config.WorkerCount, config.AllowedOrigins)

	return config
}

// getEnv retrieves an environment variable or returns a default value if not set
func getEnv(key, fallback string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return fallback
}