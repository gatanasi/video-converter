// Package models contains data structures used across the application
package models

import (
	"os/exec"
	"path/filepath"
	"sync"
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
	InputPath  string  // Path to the originally downloaded file
	OutputPath string  // Path to the target converted file
	Format     string  // Target format (e.g., "mp4")
	Progress   float64 // Estimated progress (0-100)
	Complete   bool    // True if finished (successfully or with error)
	Error      string  // Error message if conversion failed
}

// ConversionJob represents a job passed to a conversion worker.
type ConversionJob struct {
	ConversionID     string
	FileID           string // Original Google Drive File ID (for reference)
	FileName         string // Original filename (for reference)
	TargetFormat     string
	UploadedFilePath string // Path to the file downloaded from Drive
	OutputFilePath   string // Path where the converted file should be saved
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

// --- Global State Management ---
// Using global maps protected by mutexes for simplicity in this example.
// In a larger application, consider dedicated store implementations.

var (
	activeConversions = make(map[string]*exec.Cmd)
	activeMutex       sync.Mutex

	conversionStore = make(map[string]*ConversionStatus)
	conversionMutex sync.Mutex
)

// RegisterActiveConversion tracks a running FFmpeg command.
func RegisterActiveConversion(id string, cmd *exec.Cmd) {
	activeMutex.Lock()
	defer activeMutex.Unlock()
	activeConversions[id] = cmd
}

// UnregisterActiveConversion removes a command when it finishes or is aborted.
func UnregisterActiveConversion(id string) {
	activeMutex.Lock()
	defer activeMutex.Unlock()
	delete(activeConversions, id)
}

// GetActiveConversionCmd retrieves the command for an active conversion ID.
func GetActiveConversionCmd(id string) (*exec.Cmd, bool) {
	activeMutex.Lock()
	defer activeMutex.Unlock()
	cmd, exists := activeConversions[id]
	return cmd, exists
}

// GetActiveConversionsInfo returns details for all currently active conversions.
func GetActiveConversionsInfo() []ActiveConversionInfo {
	activeMutex.Lock()
	conversionMutex.Lock() // Lock both to ensure consistency
	defer conversionMutex.Unlock()
	defer activeMutex.Unlock()

	activeJobs := make([]ActiveConversionInfo, 0, len(activeConversions))
	for id := range activeConversions {
		// Check if status exists (it should, but defensive check)
		if status, ok := conversionStore[id]; ok && !status.Complete {
			activeJobs = append(activeJobs, ActiveConversionInfo{
				ID:       id,
				FileName: filepath.Base(status.OutputPath),
				Format:   status.Format,
				Progress: status.Progress,
			})
		}
	}
	return activeJobs
}

// SetConversionStatus adds or updates the status for a conversion ID.
func SetConversionStatus(id string, status *ConversionStatus) {
	conversionMutex.Lock()
	defer conversionMutex.Unlock()
	conversionStore[id] = status
}

// GetConversionStatus retrieves a copy of the status for a conversion ID.
// Returns the status and true if found, otherwise zero value and false.
func GetConversionStatus(id string) (ConversionStatus, bool) {
	conversionMutex.Lock()
	defer conversionMutex.Unlock()
	status, exists := conversionStore[id]
	if !exists {
		return ConversionStatus{}, false
	}
	// Return a copy to prevent race conditions if caller modifies it
	statusCopy := *status
	return statusCopy, true
}

// DeleteConversionStatus removes the status entry for a given ID.
func DeleteConversionStatus(id string) {
	conversionMutex.Lock()
	defer conversionMutex.Unlock()
	delete(conversionStore, id)
}

// UpdateStatusWithError updates the status to indicate completion with an error.
func UpdateStatusWithError(id, errorMsg string) {
	conversionMutex.Lock()
	defer conversionMutex.Unlock()
	if status, exists := conversionStore[id]; exists {
		// Only update if not already marked complete with a different error
		if !status.Complete {
			status.Error = errorMsg
			status.Complete = true
			status.Progress = 0 // Reset progress on error
		}
	}
}

// UpdateProgress updates the progress for a conversion, handling locking.
// It increments the current progress by the given amount, capping at 99.0.
func UpdateProgress(id string, increment float64) {
	conversionMutex.Lock()
	defer conversionMutex.Unlock()
	if status, exists := conversionStore[id]; exists {
		// Only update if not already completed or errored
		if !status.Complete && status.Error == "" {
			// Increment progress slightly, capped at 99% until 'progress=end'
			if status.Progress < 99.0 {
				status.Progress += increment
				if status.Progress > 99.0 {
					status.Progress = 99.0
				}
			}
		}
	}
}

// UpdateStatusOnSuccess marks the conversion as complete and successful.
func UpdateStatusOnSuccess(id string) {
	conversionMutex.Lock()
	defer conversionMutex.Unlock()
	if status, exists := conversionStore[id]; exists {
		// Only update if not already marked complete (e.g., by an abort)
		if !status.Complete {
			status.Complete = true
			status.Progress = 100.0
			status.Error = "" // Ensure no previous error lingers
		}
	}
}