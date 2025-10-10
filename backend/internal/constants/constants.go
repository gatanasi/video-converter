// Package constants defines application-wide constant values
package constants

import (
	"os"
	"time"
)

// HTTP Server Configuration
const (
	// DefaultPort is the default server port
	DefaultPort = "3000"

	// HTTPReadTimeout is the maximum duration for reading the entire request
	HTTPReadTimeout = 60 * time.Second

	// HTTPWriteTimeout is the maximum duration before timing out writes of the response
	HTTPWriteTimeout = 120 * time.Second

	// HTTPIdleTimeout is the maximum amount of time to wait for the next request
	HTTPIdleTimeout = 180 * time.Second

	// ShutdownTimeout is the graceful shutdown timeout
	ShutdownTimeout = 30 * time.Second
)

// Request Size Limits
const (
	// MaxJSONRequestSize is the maximum size for JSON request bodies
	MaxJSONRequestSize = 1 * 1024 * 1024 // 1 MB

	// MultipartMemoryLimit is the maximum memory used for multipart form parsing
	MultipartMemoryLimit = 32 << 20 // 32 MB

	// UploadSizeBuffer is extra buffer added to MaxFileSize for upload handling
	UploadSizeBuffer = 1 * 1024 * 1024 // 1 MB
)

// File Cleanup Configuration
const (
	// FileCleanupInitialDelay is the delay before the first cleanup run
	FileCleanupInitialDelay = 5 * time.Minute

	// FileCleanupInterval is the interval between cleanup runs
	FileCleanupInterval = 4 * time.Hour

	// FileMaxAge is the maximum age of files before cleanup
	FileMaxAge = 24 * time.Hour * 3 // 3 days
)

// Server-Sent Events Configuration
const (
	// SSEHeartbeatInterval is the interval between SSE heartbeat messages
	SSEHeartbeatInterval = 30 * time.Second

	// SSESubscriberBufferSize is the buffer size for SSE event channels
	SSESubscriberBufferSize = 16
)

// Video Conversion Configuration
const (
	// FFprobeTimeout is the timeout for ffprobe operations
	FFprobeTimeout = 15 * time.Second

	// MinThreadCount is the minimum number of threads for FFmpeg
	MinThreadCount = 1

	// ThreadCountReserve is the number of CPU cores to reserve (not use for FFmpeg)
	ThreadCountReserve = 2

	// ProgressUpdateThrottle is the minimum time between progress updates
	ProgressUpdateThrottle = 500 * time.Millisecond

	// ProgressIncrementStep is the progress increment for unknown duration videos
	ProgressIncrementStep = 0.5

	// ProgressMaxBeforeCompletion is the maximum progress before marking as complete
	ProgressMaxBeforeCompletion = 99.0
)

// Google Drive API Configuration
const (
	// DriveAPIRequestTimeout is the timeout for standard Drive API requests
	DriveAPIRequestTimeout = 30 * time.Second

	// DriveAPIDownloadTimeout is the timeout for file download operations
	DriveAPIDownloadTimeout = 20 * time.Minute
)

// File System Configuration
const (
	// DirectoryPermissions is the default permission mode for created directories
	DirectoryPermissions os.FileMode = 0755

	// MaxFilenameLength is the maximum length for sanitized filenames
	MaxFilenameLength = 100
)

// Default Configuration Values
const (
	// DefaultMaxFileSizeMB is the default maximum file size in megabytes
	DefaultMaxFileSizeMB = 2000

	// DefaultUploadsDir is the default directory for uploaded files
	DefaultUploadsDir = "uploads"

	// DefaultConvertedDir is the default directory for converted files
	DefaultConvertedDir = "converted"
)
