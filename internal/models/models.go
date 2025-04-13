// Package models contains data structures used across the application
package models

import (
	"os/exec"
	"sync"
)

// Config contains application configuration settings
type Config struct {
	Port              string
	MaxFileSize       int64
	UploadsDir        string
	ConvertedDir      string
	GoogleDriveAPIKey string
	WorkerCount       int
	AllowedOrigins    []string
	DefaultDriveFolderId string
}

// ConversionResponse represents the API response for conversion requests
type ConversionResponse struct {
	Success      bool   `json:"success"`
	Message      string `json:"message,omitempty"`
	DownloadURL  string `json:"downloadUrl,omitempty"`
	ConversionID string `json:"conversionId,omitempty"`
	Error        string `json:"error,omitempty"`
	Details      string `json:"details,omitempty"`
}

// DriveConversionRequest represents the request payload for converting Google Drive videos
type DriveConversionRequest struct {
	FileID       string `json:"fileId"`
	FileName     string `json:"fileName"`
	MimeType     string `json:"mimeType"`
	TargetFormat string `json:"targetFormat"`
	ReverseVideo bool   `json:"reverseVideo"`
	RemoveSound  bool   `json:"removeSound"`
}

// ConversionStatus tracks the progress of a conversion job
type ConversionStatus struct {
	InputPath  string
	OutputPath string
	Format     string
	Progress   float64
	Complete   bool
	Error      string
}

// ConversionJob represents a job to be processed by a worker
type ConversionJob struct {
	ConversionID     string
	FileID           string
	FileName         string
	TargetFormat     string
	UploadedFilePath string
	OutputFilePath   string
	Status           *ConversionStatus
	ReverseVideo     bool
	RemoveSound      bool
}

// GoogleDriveFile represents the metadata of a file in Google Drive
type GoogleDriveFile struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	MimeType     string `json:"mimeType"`
	ModifiedTime string `json:"modifiedTime"`
	Size         string `json:"size"`
}

// GoogleDriveFileList represents a list of Google Drive files
type GoogleDriveFileList struct {
	Files []*GoogleDriveFile `json:"files"`
}

// Global application state structures - would be moved to appropriate stores in a larger application
var (
	// ActiveConversions maps conversion IDs to their FFmpeg commands
	ActiveConversions = make(map[string]*exec.Cmd)
	ActiveMutex       sync.Mutex

	// ConversionStore keeps track of all conversion statuses
	ConversionStore = make(map[string]*ConversionStatus)
	ConversionMutex sync.Mutex
)