// Package models contains data structures used across the application
package models

import (
	"time"
)

// Config holds application configuration settings.
type Config struct {
	Port                 string
	MaxFileSize          int64
	UploadsDir           string
	ConvertedDir         string
	GoogleDriveAPIKey    string
	WorkerCount          int
	AllowedOrigins       []string
	DefaultDriveFolderId string
}

// ConversionResponse is the standard API response structure.
type ConversionResponse struct {
	Success      bool   `json:"success"`
	Message      string `json:"message,omitempty"`
	DownloadURL  string `json:"downloadUrl,omitempty"` // Used in status response
	ConversionID string `json:"conversionId,omitempty"`
	Error        string `json:"error,omitempty"`
	Details      string `json:"details,omitempty"` // Potentially more detailed error info
}

// DriveConversionRequest is the payload for starting a conversion from Google Drive.
type DriveConversionRequest struct {
	FileID       string `json:"fileId"`
	FileName     string `json:"fileName"`
	MimeType     string `json:"mimeType"` // Optional, for context
	TargetFormat string `json:"targetFormat"`
	ReverseVideo bool   `json:"reverseVideo"`
	RemoveSound  bool   `json:"removeSound"`
}

// ConversionStatus tracks the state of a single conversion job.
type ConversionStatus struct {
	InputPath       string  // Path to the originally downloaded file
	OutputPath      string  // Path to the target converted file
	Format          string  // Target format (e.g., "mp4")
	DurationSeconds float64 // Total duration of the input video in seconds
	Progress        float64 // Estimated progress (0-100)
	Complete        bool    // True if finished (successfully or with error)
	Error           string  // Error message if conversion failed
}

// ConversionJob represents a job passed to a conversion worker.
type ConversionJob struct {
	ConversionID     string
	FileID           string // Original Google Drive File ID (for reference)
	FileName         string // Original filename (for reference)
	TargetFormat     string
	UploadedFilePath string            // Path to the file downloaded from Drive
	OutputFilePath   string            // Path where the converted file should be saved
	Status           *ConversionStatus // Pointer to the shared status object
	ReverseVideo     bool
	RemoveSound      bool
}

// GoogleDriveFile represents metadata for a file listed from Google Drive.
type GoogleDriveFile struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	MimeType     string `json:"mimeType"`
	ModifiedTime string `json:"modifiedTime"` // RFC3339 format string
	Size         string `json:"size"`         // String representation of size in bytes
}

// GoogleDriveFileList is the structure returned by the Google Drive API list endpoint.
type GoogleDriveFileList struct {
	Files []*GoogleDriveFile `json:"files"`
}

// FileInfo represents metadata for a locally stored (converted) file.
type FileInfo struct {
	Name    string    `json:"name"`
	Size    int64     `json:"size"`
	ModTime time.Time `json:"modTime"`
	URL     string    `json:"url"` // Download URL for the file
}

// ActiveConversionInfo represents details of a currently running conversion.
type ActiveConversionInfo struct {
	ID       string  `json:"id"`
	FileName string  `json:"fileName"` // Output filename
	Format   string  `json:"format"`
	Progress float64 `json:"progress"`
}

// --- End of Global State Management ---
