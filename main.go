package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url" // Needed for query parameters
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
	// Optional: Add godotenv for local dev convenience
	// "github.com/joho/godotenv"
)

// Configuration structure
type Config struct {
	Port              string
	MaxFileSize       int64
	UploadsDir        string
	ConvertedDir      string
	GoogleDriveAPIKey string // Loaded from env
	WorkerCount       int
	AllowedOrigins    []string // Changed to slice for multiple origins
	DefaultDriveFolderId string // Default Google Drive folder ID
}

// Response structs
type ConversionResponse struct {
	Success      bool   `json:"success"`
	Message      string `json:"message,omitempty"`
	DownloadURL  string `json:"downloadUrl,omitempty"`
	ConversionID string `json:"conversionId,omitempty"`
	Error        string `json:"error,omitempty"`
	Details      string `json:"details,omitempty"`
}

// Request struct for Google Drive conversion (API Key removed)
type DriveConversionRequest struct {
	FileID       string `json:"fileId"`
	FileName     string `json:"fileName"` // Still useful for output naming
	MimeType     string `json:"mimeType"` // Potentially useful, kept for now
	TargetFormat string `json:"targetFormat"`
	ReverseVideo bool   `json:"reverseVideo"`
	RemoveSound  bool   `json:"removeSound"`
}

// Progress tracking
type ConversionStatus struct {
	InputPath  string // Path of the downloaded file
	OutputPath string // Path of the converted file
	Format     string
	Progress   float64
	Complete   bool
	Error      string
}

// Conversion Job for worker pool
type ConversionJob struct {
	ConversionID     string
	FileID           string
	FileName         string // Original filename for naming output
	TargetFormat     string
	UploadedFilePath string // Path where the Drive file will be downloaded
	OutputFilePath   string // Path for the final converted file
	Status           *ConversionStatus
	ReverseVideo     bool // Add the reverse video option
	RemoveSound      bool // Add the remove sound option
}

// Global configuration & state
var (
	config          Config
	googleDriveAPIKey string // Store the API key securely (copied from config for convenience)
	conversions     = make(map[string]*ConversionStatus)
	conversionQueue chan ConversionJob
	mutex           sync.Mutex
	filenameSanitizeRegex = regexp.MustCompile(`[^a-zA-Z0-9._-]+`)
	allowedOriginsMap map[string]bool // For fast CORS lookup
	activeConversions = make(map[string]*exec.Cmd) // Track running FFmpeg processes
	activeMutex      sync.Mutex // Separate mutex for activeConversions map
)


// Google Drive API File structure (partial)
type GoogleDriveFile struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	MimeType     string `json:"mimeType"`
	ModifiedTime string `json:"modifiedTime"`
	Size         string `json:"size"` // Size is often returned as string
}

type GoogleDriveFileList struct {
	Files []*GoogleDriveFile `json:"files"`
}


func loadConfig() {
	// Optional: Load .env file for local development
	// err := godotenv.Load()
	// if err != nil {
	//     log.Println("No .env file found, relying on system environment variables")
	// }

	config.Port = getEnv("PORT", "3000")
	maxFileSizeStr := getEnv("MAX_FILE_SIZE_MB", "2000") // Size in MB
	maxFileSizeMB, err := strconv.ParseInt(maxFileSizeStr, 10, 64)
	if err != nil {
		log.Printf("Warning: Invalid MAX_FILE_SIZE_MB '%s', using default 2000MB", maxFileSizeStr)
		maxFileSizeMB = 2000
	}
	config.MaxFileSize = maxFileSizeMB * 1024 * 1024 // Convert MB to bytes

	config.UploadsDir = getEnv("UPLOADS_DIR", "uploads")
	config.ConvertedDir = getEnv("CONVERTED_DIR", "converted")

	workerCountStr := getEnv("WORKER_COUNT", strconv.Itoa(runtime.NumCPU())) // Default to number of CPUs
	config.WorkerCount, err = strconv.Atoi(workerCountStr)
	if err != nil || config.WorkerCount < 1 {
		log.Printf("Warning: Invalid WORKER_COUNT '%s', using default %d", workerCountStr, runtime.NumCPU())
		config.WorkerCount = runtime.NumCPU()
	}

	// --- Default Drive Folder ID ---
	config.DefaultDriveFolderId = getEnv("DEFAULT_DRIVE_FOLDER_ID", "")
	if config.DefaultDriveFolderId != "" {
		log.Printf("Default Google Drive Folder ID configured: %s", config.DefaultDriveFolderId)
	}

	// --- API Key Loading ---
	config.GoogleDriveAPIKey = os.Getenv("GOOGLE_DRIVE_API_KEY")
	if config.GoogleDriveAPIKey == "" {
		log.Fatal("FATAL: GOOGLE_DRIVE_API_KEY environment variable not set.")
	}
	googleDriveAPIKey = config.GoogleDriveAPIKey // Copy for convenience

	// --- CORS Loading ---
	allowedOriginsStr := getEnv("ALLOWED_ORIGINS", "") // Expect comma-separated list
	if allowedOriginsStr == "" {
		log.Println("Warning: ALLOWED_ORIGINS environment variable not set. Allowing all origins (*). THIS IS INSECURE FOR PRODUCTION.")
		config.AllowedOrigins = []string{"*"} // Default insecurely if not set
	} else {
		config.AllowedOrigins = strings.Split(allowedOriginsStr, ",")
		// Trim whitespace from each origin
		for i := range config.AllowedOrigins {
			config.AllowedOrigins[i] = strings.TrimSpace(config.AllowedOrigins[i])
		}
	}

	// Create map for fast lookup in middleware
	allowedOriginsMap = make(map[string]bool)
	for _, origin := range config.AllowedOrigins {
		allowedOriginsMap[origin] = true
	}


	log.Printf("Configuration loaded: Port=%s, MaxFileSize=%dMB, Workers=%d, AllowedOrigins=%v",
		config.Port, maxFileSizeMB, config.WorkerCount, config.AllowedOrigins)
}

// Helper to get environment variable with default value
func getEnv(key, fallback string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return fallback
}

func main() {
	loadConfig()

	ensureDirectoryExists(config.UploadsDir)
	ensureDirectoryExists(config.ConvertedDir)

	conversionQueue = make(chan ConversionJob, config.WorkerCount*2)
	startWorkerPool(config.WorkerCount, conversionQueue)

	mux := http.NewServeMux()

	// --- API Endpoints ---
	mux.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir("static")))) // Serve static files
	mux.Handle("/", http.FileServer(http.Dir("."))) // Serve index.html from root

	mux.HandleFunc("/api/list-videos", listDriveVideosHandler) // New endpoint for listing
	mux.HandleFunc("/api/convert-from-drive", convertFromDriveHandler) // Prefixed with /api
	mux.HandleFunc("/api/status/", statusHandler)                 // Prefixed with /api
	mux.HandleFunc("/api/files", listFilesHandler)                // Prefixed with /api
	mux.HandleFunc("/api/delete-file/", deleteFileHandler)        // Prefixed with /api
	mux.HandleFunc("/api/abort/", abortConversionHandler)         // New endpoint for aborting
	mux.HandleFunc("/api/active-conversions", activeConversionsHandler) // New endpoint for listing active conversions
	mux.HandleFunc("/api/config", configHandler)                   // New endpoint for fetching config values

	// --- Public Download Endpoint (no /api prefix needed) ---
	mux.HandleFunc("/download/", downloadHandler)

	setupFileCleanup()

	server := &http.Server{
		Addr:         ":" + config.Port,
		Handler:      applyCORS(mux), // Apply CORS middleware
		ReadTimeout:  60 * time.Second,
		WriteTimeout: 120 * time.Second,
		IdleTimeout:  180 * time.Second,
	}

	// Graceful shutdown setup
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	go func() {
		fmt.Printf("Server starting on http://localhost:%s\n", config.Port)
		fmt.Printf("Using %d conversion workers.\n", config.WorkerCount)
		fmt.Println("Allowed Origins:", config.AllowedOrigins)
		fmt.Println("Make sure FFmpeg is installed and accessible in your PATH.")
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Error starting server: %v", err)
		}
	}()

	<-stop

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	fmt.Println("Server shutting down...")
	if err := server.Shutdown(ctx); err != nil {
		log.Fatalf("Server shutdown failed: %v", err)
	}
	fmt.Println("Server gracefully stopped")
}


// --- CORS Middleware (Updated) ---
func applyCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		originAllowed := false

		// Check if the request origin is in our allowed list or if we allow all (*)
		if _, ok := allowedOriginsMap["*"]; ok {
			originAllowed = true
			w.Header().Set("Access-Control-Allow-Origin", "*")
		} else if origin != "" {
			if _, ok := allowedOriginsMap[origin]; ok {
				originAllowed = true
				// Set the specific origin that is allowed
				w.Header().Set("Access-Control-Allow-Origin", origin)
				// Vary header is important when reflecting specific origin
				w.Header().Set("Vary", "Origin")
			}
		}
		// If origin is "" (e.g. same-origin request or curl), it's usually implicitly allowed

		if originAllowed {
			w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, DELETE")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			// Optional: Add credentials header if needed in the future
			// w.Header().Set("Access-Control-Allow-Credentials", "true")
		}

		// Handle preflight requests (OPTIONS)
		if r.Method == "OPTIONS" {
			if originAllowed {
				w.WriteHeader(http.StatusOK) // Allow preflight if origin is ok
			} else {
				// If origin is not allowed, deny preflight
				http.Error(w, "CORS origin not allowed", http.StatusForbidden)
			}
			return // Stop processing for OPTIONS requests
		}

		// For actual requests, if origin was provided but not allowed, block it.
		// (Requests without Origin header or from allowed origins will pass through)
		// Note: Browsers typically *always* send Origin for cross-origin requests.
		if origin != "" && !originAllowed && !allowedOriginsMap["*"] {
			http.Error(w, "CORS origin not allowed", http.StatusForbidden)
			return
		}


		// Call the next handler in the chain
		next.ServeHTTP(w, r)
	})
}

// --- Worker Pool ---

func startWorkerPool(numWorkers int, queue chan ConversionJob) {
	for i := 0; i < numWorkers; i++ {
		go worker(i+1, queue)
	}
	log.Printf("Started %d conversion workers", numWorkers)
}

func worker(id int, queue chan ConversionJob) {
	log.Printf("Worker %d started", id)
	for job := range queue {
		log.Printf("Worker %d: Processing job %s (File ID: %s)", id, job.ConversionID, job.FileID)
		processConversionJob(job)
		log.Printf("Worker %d: Finished job %s", id, job.ConversionID)
	}
	log.Printf("Worker %d stopped", id)
}

// This function runs within a worker goroutine
func processConversionJob(job ConversionJob) {
	// 1. Download the file from Google Drive
	err := downloadFromGoogleDrive(job.FileID, googleDriveAPIKey, job.UploadedFilePath)
		if err != nil {
		errMsg := fmt.Sprintf("Worker: Failed to download file %s for job %s: %v", job.FileID, job.ConversionID, err)
		reportError(job.Status, errMsg)
		// No need to delete UploadedFilePath here as it might not have been created or fully written
		return
	}

	// 2. Convert the video
	// Pass the job details, including the status object
	convertVideo(job) // Pass the whole job to access all options

	// 3. Cleanup (already handled inside convertVideo/reportError)
	// Original downloaded file is removed after successful conversion or on error by convertVideo/reportError.
}


// --- Handlers ---

// --- New Handler for Listing Videos ---
func listDriveVideosHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		sendErrorResponse(w, "Method not allowed", "", http.StatusMethodNotAllowed)
		return
	}

	folderId := r.URL.Query().Get("folderId")
	if folderId == "" {
		sendErrorResponse(w, "Missing 'folderId' query parameter", "", http.StatusBadRequest)
		return
	}

	log.Printf("Listing videos for folder: %s", folderId)

	// Construct Google Drive API URL
	// Use url.Values for proper query escaping
	queryParams := url.Values{}
	queryParams.Set("q", fmt.Sprintf("'%s' in parents and mimeType contains 'video'", folderId))
	queryParams.Set("fields", "files(id,name,mimeType,modifiedTime,size)")
	queryParams.Set("orderBy", "name")
	queryParams.Set("key", googleDriveAPIKey) // Use the secure server-side key

	listUrl := "https://www.googleapis.com/drive/v3/files?" + queryParams.Encode()

	// Create request
	req, err := http.NewRequest("GET", listUrl, nil)
	if err != nil {
		sendErrorResponse(w, "Failed to create request to Google Drive", err.Error(), http.StatusInternalServerError)
		return
	}

	client := &http.Client{ Timeout: 30 * time.Second } // Reasonable timeout for listing
	resp, err := client.Do(req)
	if err != nil {
		sendErrorResponse(w, "Failed to contact Google Drive API", err.Error(), http.StatusServiceUnavailable)
		return
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		sendErrorResponse(w, "Failed to read response from Google Drive", err.Error(), http.StatusInternalServerError)
		return
	}


	if resp.StatusCode != http.StatusOK {
		log.Printf("Google Drive API Error (%s): %s", resp.Status, string(bodyBytes))
		// Try to parse Google's error format
		var googleError struct {
			Error struct {
				Message string `json:"message"`
				Code    int    `json:"code"`
			} `json:"error"`
		}
		json.Unmarshal(bodyBytes, &googleError)
		errMsg := fmt.Sprintf("Google Drive API error: %s", resp.Status)
		if googleError.Error.Message != "" {
			errMsg = fmt.Sprintf("Google Drive API error: %s (Code: %d)", googleError.Error.Message, googleError.Error.Code)
		}
		sendErrorResponse(w, errMsg, string(bodyBytes), resp.StatusCode) // Pass Google's status code
		return
	}

	// Parse the successful response
	var fileList GoogleDriveFileList
	if err := json.Unmarshal(bodyBytes, &fileList); err != nil {
		log.Printf("Failed to parse Google Drive response: %v\nBody: %s", err, string(bodyBytes))
		sendErrorResponse(w, "Failed to parse response from Google Drive", err.Error(), http.StatusInternalServerError)
		return
	}

	// Send the list back to the frontend
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	if err := json.NewEncoder(w).Encode(fileList.Files); err != nil { // Send only the array of files
		// This error happens after headers are sent, log it.
		log.Printf("Error encoding file list response: %v", err)
	}
}

// convertFromDriveHandler: Path prefix /api/ is handled by routing. Logic remains the same.
func convertFromDriveHandler(w http.ResponseWriter, r *http.Request) {
	// ... (logic remains the same, relies on global googleDriveAPIKey via downloadFromGoogleDrive)
	// ... uses /api/ path via mux routing ...
	if r.Method != "POST" {
		sendErrorResponse(w, "Method not allowed", "", http.StatusMethodNotAllowed)
		return
	}

	var request DriveConversionRequest
	// Limit request body size
	r.Body = http.MaxBytesReader(w, r.Body, 1*1024*1024) // 1MB limit for JSON request
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		sendErrorResponse(w, "Failed to parse request", err.Error(), http.StatusBadRequest)
		return
	}

	// Validate input
	if request.FileID == "" {
		sendErrorResponse(w, "No file ID specified", "", http.StatusBadRequest)
		return
	}
	// API Key is no longer expected from the client

	validFormats := map[string]bool{"mov": true, "mp4": true, "avi": true}
	if !validFormats[request.TargetFormat] {
		sendErrorResponse(w, "Invalid target format specified", "", http.StatusBadRequest)
		return
	}

	// Sanitize filename - crucial for security when using it in paths
	sanitizedBaseName := sanitizeFilename(request.FileName)
	if sanitizedBaseName == "" {
		sanitizedBaseName = fmt.Sprintf("gdrive-video-%s", request.FileID) // Fallback name
	}
	fileNameWithoutExt := strings.TrimSuffix(sanitizedBaseName, filepath.Ext(sanitizedBaseName))


	// Generate unique ID and create file paths
	timestamp := time.Now().UnixNano()
	conversionID := strconv.FormatInt(timestamp, 10)

	// Use sanitized name for output, ensure unique timestamp component remains
	// Path for the initial download from Drive
	uploadedFileName := fmt.Sprintf("%d-%s", timestamp, sanitizedBaseName) // Temporary name for downloaded file
	uploadedFilePath := filepath.Join(config.UploadsDir, uploadedFileName)

	// Path for the final converted file
	outputFileName := fmt.Sprintf("%s-%d.%s", fileNameWithoutExt, timestamp, request.TargetFormat)
	outputFilePath := filepath.Join(config.ConvertedDir, outputFileName)


	// Create initial status entry
	status := &ConversionStatus{
		InputPath:  uploadedFilePath, // Path where it WILL be downloaded
		OutputPath: outputFilePath,
		Format:     request.TargetFormat,
		Progress:   0,
		Complete:   false,
	}
	mutex.Lock()
	conversions[conversionID] = status
	mutex.Unlock()

	// Create the job for the worker pool
	job := ConversionJob{
		ConversionID:     conversionID,
		FileID:           request.FileID,
		FileName:         request.FileName, // Keep original for potential metadata use?
		TargetFormat:     request.TargetFormat,
		UploadedFilePath: uploadedFilePath,
		OutputFilePath:   outputFilePath,
		Status:           status,
		ReverseVideo:     request.ReverseVideo, // Add the reverse video option
		RemoveSound:      request.RemoveSound,  // Add the remove sound option
	}

	// Send job to the queue (non-blocking if buffer has space)
	select {
	case conversionQueue <- job:
		log.Printf("Job %s queued for file ID %s (/api/convert-from-drive)", conversionID, request.FileID)
	default:
		// Queue is full - handle this case (e.g., return 503 Service Unavailable)
		log.Printf("Warning: Conversion queue is full. Rejecting job %s", conversionID)
		// Remove status entry we optimistically created
		mutex.Lock()
		delete(conversions, conversionID)
		mutex.Unlock()
		sendErrorResponse(w, "Server busy", "Conversion queue is full, please try again later.", http.StatusServiceUnavailable)
		return
	}


	// Respond immediately to the client
	// Download URL should NOT have /api prefix as it's served directly
	downloadURL := fmt.Sprintf("/download/%s", outputFileName) // Use url encoding? Name is sanitized now.
	response := ConversionResponse{
		Success:      true,
		Message:      "Conversion job queued",
		DownloadURL:  downloadURL, // Relative URL for client download
		ConversionID: conversionID,
		}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted) // 202 Accepted is appropriate here
	json.NewEncoder(w).Encode(response)
}


// --- Ensure downloadFromGoogleDrive uses the global API key ---
func downloadFromGoogleDrive(fileID, apiKey, destinationPath string) error {
	// The 'apiKey' parameter passed to this function *is* the global, secure one
	// because convertFromDriveHandler calls processConversionJob which calls this
	// without passing any client-provided key.
	log.Printf("Attempting download: File ID %s to %s", fileID, destinationPath)
	url := fmt.Sprintf("https://www.googleapis.com/drive/v3/files/%s?alt=media&key=%s", fileID, apiKey)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return fmt.Errorf("failed to create download request: %v", err)
	}

	// Use a client with a potentially longer timeout for large files
	client := &http.Client{
		Timeout: 30 * time.Minute, // Adjust timeout as needed
		}

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("download request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		// Attempt to read error body from Google API
		bodyBytes, _ := io.ReadAll(resp.Body)
		// Try parsing Google error
		var googleError struct { Error struct { Message string `json:"message"` } `json:"error"` }
		json.Unmarshal(bodyBytes, &googleError)
		errMsg := fmt.Sprintf("download failed, status: %s", resp.Status)
		if googleError.Error.Message != "" { errMsg += " - " + googleError.Error.Message }
		return fmt.Errorf("%s", errMsg)

}

	// Check Content-Length against MaxFileSize BEFORE writing
	contentLength := resp.ContentLength
	if contentLength > 0 && contentLength > config.MaxFileSize { // Only check if ContentLength is provided and positive
		return fmt.Errorf("file size (%d bytes) exceeds maximum allowed size (%d bytes)", contentLength, config.MaxFileSize)
	}


	out, err := os.Create(destinationPath)
	if err != nil {
		return fmt.Errorf("failed to create output file %s: %v", destinationPath, err)
	}
	defer out.Close()

	// Copy data with progress potentially? For now, direct copy.
	written, err := io.Copy(out, resp.Body)
	if err != nil {
		// Clean up partially written file on copy error
		os.Remove(destinationPath)
		return fmt.Errorf("failed to write file %s: %v", destinationPath, err)
	}

	// If ContentLength was not available or zero, check size after download
	if (contentLength <= 0 || contentLength > config.MaxFileSize) && written > config.MaxFileSize {
		os.Remove(destinationPath)
		return fmt.Errorf("downloaded file size (%d bytes) exceeds maximum allowed size (%d bytes)", written, config.MaxFileSize)
	}


	log.Printf("Successfully downloaded %d bytes for file ID %s to %s", written, fileID, destinationPath)
	return nil
}

// downloadHandler: No changes needed. Path /download/ is correct.
func downloadHandler(w http.ResponseWriter, r *http.Request) {
	// Assumes CORS middleware is applied upstream
	filename := strings.TrimPrefix(r.URL.Path, "/download/")
	if filename == "" {
		http.Error(w, "Filename not specified", http.StatusBadRequest)
		return
	}

	// Basic path traversal check (though filepath.Join should handle this)
	if strings.Contains(filename, "..") || strings.ContainsAny(filename, "/\\") {
		http.Error(w, "Invalid filename", http.StatusBadRequest)
		return
	}

	filePath := filepath.Join(config.ConvertedDir, filename)

	// Check if file exists *before* setting headers
	fileInfo, err := os.Stat(filePath)
	if os.IsNotExist(err) {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Printf("Error stating file %s: %v", filePath, err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if fileInfo.IsDir() {
		http.Error(w, "Invalid request", http.StatusBadRequest) // Don't serve directories
		return
	}


	// Serve the file using http.ServeFile for proper header handling (Content-Type, ETag etc.)
	// Note: ServeFile sets Content-Disposition to inline by default. Forcing download:
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))
	// Set Content-Type explicitly to ensure correct download behavior in all browsers
	// Use a generic type or try to detect based on extension
	contentType := "application/octet-stream" // Generic fallback
	ext := strings.ToLower(filepath.Ext(filename))
	switch ext {
	case ".mov":
		contentType = "video/quicktime"
	case ".mp4":
		contentType = "video/mp4"
	case ".avi":
		contentType = "video/x-msvideo"
	// Add other types if needed
	}
	w.Header().Set("Content-Type", contentType)

	http.ServeFile(w, r, filePath)
}

// statusHandler: No changes needed. Path /api/status/ is handled by routing.
func statusHandler(w http.ResponseWriter, r *http.Request) {
	// Assumes CORS middleware is applied upstream
	id := strings.TrimPrefix(r.URL.Path, "/api/status/") // Use /api/ prefix
	if id == "" {
		http.Error(w, "Conversion ID not specified", http.StatusBadRequest)
		return
	}

	mutex.Lock()
	status, exists := conversions[id]
	// Create a *copy* of the status data to avoid holding the lock while encoding JSON
	var statusCopy ConversionStatus
	if exists {
		statusCopy = *status
	}
	mutex.Unlock() // Unlock ASAP


	if !exists {
		// Check if it's an old job that might have been cleaned up
		// Respond with a specific status? For now, just 404.
		http.Error(w, "Conversion not found or expired", http.StatusNotFound)
		return
	}

	// Create response object from the copy
	response := struct {
		ID       string  `json:"id"`
		Progress float64 `json:"progress"`
		Complete bool    `json:"complete"`
		Error    string  `json:"error,omitempty"`
		Format   string  `json:"format"`
		OutputPath string `json:"outputPath,omitempty"` // Optionally include output path/URL
	}{
		ID:       id,
		Progress: statusCopy.Progress,
		Complete: statusCopy.Complete,
		Error:    statusCopy.Error,
		Format:   statusCopy.Format,
		// Only include download URL if conversion is complete and successful
		OutputPath: func() string {
			if statusCopy.Complete && statusCopy.Error == "" {
				// Assuming OutputPath stores the relative path used for download URL
				// Download URL does *not* have /api prefix
				return fmt.Sprintf("/download/%s", filepath.Base(statusCopy.OutputPath))
			}
			return ""
		}(),
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}


// listFilesHandler: No changes needed. Path /api/files is handled by routing.
func listFilesHandler(w http.ResponseWriter, r *http.Request) {
	// Assumes CORS middleware is applied upstream
	files, err := os.ReadDir(config.ConvertedDir)
	if err != nil {
		sendErrorResponse(w, "Failed to list files", err.Error(), http.StatusInternalServerError)
		return
	}

	type FileInfo struct {
		Name string `json:"name"`
		Size int64  `json:"size"`
		ModTime time.Time `json:"modTime"`
		URL string `json:"url"`
	}

	var fileInfos []FileInfo
	for _, file := range files {
		if !file.IsDir() {
			info, err := file.Info()
			if err != nil {
				log.Printf("Could not get info for file %s: %v", file.Name(), err)
				continue // Skip files we can't get info for
			}
			fileInfos = append(fileInfos, FileInfo{
				Name: file.Name(),
				Size: info.Size(),
				ModTime: info.ModTime(),
				URL: fmt.Sprintf("/download/%s", file.Name()), // Construct download URL (no /api prefix)
			})
		}
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(fileInfos)
}

// deleteFileHandler: No changes needed. Path /api/delete-file/ is handled by routing.
func deleteFileHandler(w http.ResponseWriter, r *http.Request) {
	// Assumes CORS middleware is applied upstream

	// --- IMPORTANT: Check HTTP Method ---
	if r.Method != http.MethodDelete {
		sendErrorResponse(w, "Method not allowed", "Please use the DELETE method.", http.StatusMethodNotAllowed)
		return
	}
	// ---

	filename := strings.TrimPrefix(r.URL.Path, "/api/delete-file/") // Use /api/ prefix
	if filename == "" {
		http.Error(w, "Filename not specified", http.StatusBadRequest)
		return
	}
	// Basic path traversal check
	if strings.Contains(filename, "..") || strings.ContainsAny(filename, "/\\") {
		http.Error(w, "Invalid filename", http.StatusBadRequest)
		return
	}

	filePath := filepath.Join(config.ConvertedDir, filename)

	// Check if file exists before attempting delete
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	} else if err != nil {
		log.Printf("Error stating file %s before delete: %v", filePath, err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}


	if err := os.Remove(filePath); err != nil {
		log.Printf("Failed to delete file %s: %v", filePath, err)
		sendErrorResponse(w, "Failed to delete file", err.Error(), http.StatusInternalServerError)
		return
	}

	log.Printf("Deleted file: %s", filePath)
	w.Header().Set("Content-Type", "application/json") // Respond with JSON
	w.WriteHeader(http.StatusOK)
	// Send a simple success message (optional)
	fmt.Fprintf(w, `{"success": true, "message": "File '%s' deleted successfully"}`, filename) // Respond with JSON?
	// Or just w.WriteHeader(http.StatusNoContent) // 204 No Content is also suitable
}

// --- Conversion Logic ---

// convertVideo now accepts ConversionJob to get access to all options
// It runs within a worker goroutine.
func convertVideo(job ConversionJob) {
	status := job.Status
	inputPath := status.InputPath
	outputPath := status.OutputPath
	format := status.Format
	reverseVideo := job.ReverseVideo
	removeSound := job.RemoveSound
	conversionID := job.ConversionID  // Get the conversion ID

	// Ensure output directory exists (it should, but double-check)
	ensureDirectoryExists(filepath.Dir(outputPath))

	// Set optimal thread count for the hardware (14 cores available)
	// Using n-2 threads for FFmpeg is often a good practice to leave some CPU for the system
	threadCount := 12

	// Standard (non-reverse) conversion process with high quality
	// Base FFmpeg arguments
	ffmpegArgs := []string{
		"-i", inputPath,
		"-threads", strconv.Itoa(threadCount), // Use most of the available cores
		"-progress", "pipe:1", // Send progress info to stdout
		"-nostats",            // Do not print verbose encoding stats per frame to stderr
		"-v", "warning",       // Reduce log verbosity on stderr (errors still show)
	}
	
	// Add video filters
	if reverseVideo {
		ffmpegArgs = append(ffmpegArgs, "-vf", "reverse")
	}

	// Handle audio options
	if removeSound {
		ffmpegArgs = append(ffmpegArgs, "-an") // Remove audio
	} else {
		if reverseVideo {
			ffmpegArgs = append(ffmpegArgs, "-af", "areverse") // Reverse audio if video is reversed
		} else {
			ffmpegArgs = append(ffmpegArgs, "-c:a", "copy") // Keep original audio
		}
	}

	// Add format-specific args with higher quality settings
	switch format {
	case "mov":
		ffmpegArgs = append(ffmpegArgs, "-tag:v", "hvc1", "-c:v", "libx265", "-preset", "slow", "-crf", "22")
	case "mp4":
		ffmpegArgs = append(ffmpegArgs, "-c:v", "libx265", "-preset", "slow", "-crf", "22", "-movflags", "+faststart")
	case "avi":
		// Note: AVI with modern codecs might have compatibility issues
		ffmpegArgs = append(ffmpegArgs, "-c:v", "libxvid", "-q:v", "3")
	default:
		// Should not happen due to validation, but handle defensively
		reportError(status, fmt.Sprintf("Unsupported target format '%s' passed to converter", format))
		return
	}
	
	ffmpegArgs = append(ffmpegArgs, outputPath)
	
	ffmpegCmd := fmt.Sprintf("ffmpeg %s", strings.Join(ffmpegArgs, " "))
	log.Printf("Executing FFmpeg for job %s -> %s: %s\n", filepath.Base(inputPath), filepath.Base(outputPath), ffmpegCmd) // Use base names for cleaner logs
	
	cmd := exec.Command("ffmpeg", ffmpegArgs...)
	
	// Register the command with the conversion ID to allow for aborting
	registerActiveConversion(conversionID, cmd)
	defer unregisterActiveConversion(conversionID)
	
	// Get pipes for progress and error reporting
	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		reportError(status, fmt.Sprintf("Failed to create stderr pipe: %v", err))
		return
	}
	stdoutPipe, err := cmd.StdoutPipe() // For progress
	if err != nil {
		reportError(status, fmt.Sprintf("Failed to create stdout pipe: %v", err))
		return
	}
	
	// Start FFmpeg
	if err := cmd.Start(); err != nil {
		reportError(status, fmt.Sprintf("Failed to start FFmpeg: %v", err))
		return
	}
	
	// Read stderr in a separate goroutine to prevent blocking and capture errors
	var ffmpegErrOutput strings.Builder
	stderrDone := make(chan struct{})
	go func() {
		defer close(stderrDone)
		scanner := bufio.NewScanner(stderrPipe)
		for scanner.Scan() {
			line := scanner.Text()
			// Log important lines from stderr for debugging if needed
			log.Printf("FFmpeg stderr (%s): %s", filepath.Base(inputPath), line)
			ffmpegErrOutput.WriteString(line + "\n") // Capture all stderr
		}
	}()
	
	// Process stdout progress in this goroutine
	processFFmpegProgress(stdoutPipe, status) // This blocks until stdout is closed
	
	// Wait for stderr processing to finish
	<-stderrDone
	
	// Wait for FFmpeg command to complete
	err = cmd.Wait()
	if err != nil {
		// FFmpeg failed, capture stderr output
		errMsg := fmt.Sprintf("FFmpeg execution failed for %s: %v. FFmpeg output:\n%s",
			filepath.Base(inputPath), err, ffmpegErrOutput.String())
		reportError(status, errMsg) // reportError handles cleanup
		return // Stop processing here
	}

	// FFmpeg finished without error from cmd.Wait()

	// Additional check: Verify output file exists and has size > 0
	outputInfo, statErr := os.Stat(outputPath)
	if statErr != nil {
		errMsg := fmt.Sprintf("FFmpeg finished but output file %s could not be accessed: %v. FFmpeg output:\n%s",
			filepath.Base(outputPath), statErr, ffmpegErrOutput.String())
		reportError(status, errMsg)
		return
	}
	if outputInfo.Size() == 0 {
		errMsg := fmt.Sprintf("FFmpeg finished but output file %s is empty (0 bytes). Check FFmpeg logs. FFmpeg output:\n%s",
			filepath.Base(outputPath), ffmpegErrOutput.String())
		reportError(status, errMsg)
		// Keep the empty file? Or remove it? Let's remove it.
		os.Remove(outputPath)
		return
	}

	// Run exiftool to copy metadata from input to output file
	log.Printf("Copying metadata from %s to %s using exiftool", filepath.Base(inputPath), filepath.Base(outputPath))
	exifCmd := exec.Command("exiftool", "-tagsFromFile", inputPath, outputPath, "-overwrite_original", "-preserve")
	exifOut, exifErr := exifCmd.CombinedOutput()
	if exifErr != nil {
		log.Printf("Warning: exiftool failed to copy metadata: %v. Output: %s", exifErr, string(exifOut))
		// Continue processing even if exiftool fails - it's not critical
	} else {
		log.Printf("Successfully copied metadata with exiftool: %s", string(exifOut))
	}

	// Mark as complete ONLY if no error occurred during execution or final checks
	mutex.Lock()
	if status.Error == "" { // Double check no error was reported during progress parsing or checks
		status.Complete = true
		status.Progress = 100.0 // Ensure it hits 100%
		log.Printf("Conversion successful: %s -> %s (%d bytes)\n", filepath.Base(inputPath), filepath.Base(outputPath), outputInfo.Size())
	}
	mutex.Unlock()

	// Clean up the original *downloaded* file (from uploads dir) after successful conversion
	if status.Complete && status.Error == "" {
		err := os.Remove(inputPath)
		if (err != nil) {
			log.Printf("Warning: Failed to remove original downloaded file %s: %v", inputPath, err)
		} else {
			log.Printf("Removed original downloaded file: %s", inputPath)
		}
	}
	// If there was an error, reportError already attempted cleanup of the input file.
}

// Helper functions for tracking active conversions
func registerActiveConversion(conversionID string, cmd *exec.Cmd) {
	activeMutex.Lock()
	defer activeMutex.Unlock()
	activeConversions[conversionID] = cmd
	log.Printf("Registered active conversion: %s", conversionID)
}

func unregisterActiveConversion(conversionID string) {
	activeMutex.Lock()
	defer activeMutex.Unlock()
	delete(activeConversions, conversionID)
	log.Printf("Unregistered conversion: %s", conversionID)
}

// Refined FFmpeg progress parsing from stdout (pipe:1)
func processFFmpegProgress(stdout io.ReadCloser, status *ConversionStatus) {
	defer stdout.Close() // Ensure pipe is closed
	scanner := bufio.NewScanner(stdout)

	var totalDurationUs int64 = -1 // Total duration in microseconds from FFmpeg progress output, init to -1 (unknown)

	// Regex to get duration from initial FFmpeg output (sometimes needed if not in progress stream)
	// This usually appears on stderr, but we only have stdout here.
	// We will primarily rely on the progress=continue output.

	for scanner.Scan() {
		line := scanner.Text()
		// log.Printf("FFmpeg stdout (%s): %s", filepath.Base(status.InputPath), line) // Debug progress lines

		parts := strings.SplitN(strings.TrimSpace(line), "=", 2)
		if len(parts) != 2 {
			continue // Skip lines not in key=value format
		}
		key := strings.TrimSpace(parts[0])
		value := strings.TrimSpace(parts[1])


		switch key {
		case "out_time_us":
			currentTimeUs, err := strconv.ParseInt(value, 10, 64)
			if err == nil {
				mutex.Lock()
				// Use the duration stored in status if available
				currentTotalDurationUs := totalDurationUs // Read the potentially updated value
				mutex.Unlock()

				// TODO: Get actual duration! This is a placeholder.
				// We need to extract the total duration from ffmpeg's initial output (stderr usually)
				// or use ffprobe before starting ffmpeg. Without it, progress is inaccurate.
				// For now, we might have to rely on 'progress=end' or just estimate.
				// Let's assume we *can* get totalDurationUs somehow (e.g., ffprobe beforehand or better stderr parsing)
				if currentTotalDurationUs <= 0 {
					// HACK: Try to estimate based on typical video length? Very inaccurate.
					// Or perhaps parse initial stderr if possible.
					// For now, let's leave progress inaccurate if duration is unknown.
					// log.Printf("Warning: Total duration unknown, cannot calculate accurate progress for %s", filepath.Base(status.InputPath))
					// Simulate progress based on time elapsed? No, stick to ffmpeg output.
				}


				if currentTotalDurationUs > 0 {
					progress := (float64(currentTimeUs) / float64(currentTotalDurationUs)) * 100.0
					if progress < 0 { progress = 0 }
					if progress > 100 { progress = 100 } // Cap at 100

					mutex.Lock()
					// Update only if progress increases significantly or is near end
					if progress > status.Progress + 0.1 || progress >= 99.9 {
						status.Progress = progress
						// Log progress update occasionally (e.g., every 5%)
						// currentProgressInt := int(status.Progress)
						// if currentProgressInt % 5 == 0 && currentProgressInt > lastLoggedProgress {
						//     log.Printf("Job %s progress: %.1f%%\n", filepath.Base(status.OutputPath), status.Progress)
						//     lastLoggedProgress = currentProgressInt
						// }
					}
					mutex.Unlock()
				}
				// else { log.Printf("Warning: Received out_time_us but total duration is unknown for %s", filepath.Base(status.InputPath)) }
			}
		case "total_size", "frame", "fps", "bitrate", "speed":
			// Can potentially parse these for more detailed status if needed
			continue
		case "progress":
			if value == "end" {
				log.Printf("FFmpeg progress stream ended for %s.", filepath.Base(status.InputPath))
				mutex.Lock()
				// Ensure progress hits 100 if the stream ends cleanly and no error occurred
				if !status.Complete && status.Error == "" {
					// Set to 99.9 perhaps, let cmd.Wait() success trigger final 100?
					// Or just set to 100 here assuming 'end' means success. Let's set 100.
					status.Progress = 100.0
		}
				mutex.Unlock()
				return // Stop scanning progress pipe
			} else if value == "continue" {
				// Standard progress indicator, out_time_us handles the value
			}
		// Look for duration on stdout? Unlikely but maybe possible in some ffmpeg versions/configs
		// case "duration_us": // Hypothetical key
		// 	if durUs, err := strconv.ParseInt(value, 10, 64); err == nil && durUs > 0 {
		//      mutex.Lock()
		//      if totalDurationUs <= 0 { // Only set if not already known
		// 		    totalDurationUs = durUs
		//          log.Printf("Detected video duration from progress stream: %d us (%.2f seconds)\n", totalDurationUs, float64(totalDurationUs)/1000000.0)
		//      }
		//      mutex.Unlock()
		// 	}
		}
	}

	if err := scanner.Err(); err != nil && err != io.EOF {
		// Report error if scanning failed unexpectedly
		errMsg := fmt.Sprintf("Error reading FFmpeg progress pipe for %s: %v", filepath.Base(status.InputPath), err)
		log.Println(errMsg)
		// This might indicate FFmpeg crashed without sending 'progress=end'.
		// Don't necessarily fail the job here, let cmd.Wait() determine final status.
		// We could potentially update the status error here as a warning.
		// mutex.Lock()
		// if status.Error == "" { status.Error = "Warning: Error reading progress stream" }
		// mutex.Unlock()
	} else {
		// Scanner finished without error (likely EOF)
		log.Printf("FFmpeg progress scanner finished for %s", filepath.Base(status.InputPath))
	}
}


// Report error, update status, and clean up input file
func reportError(status *ConversionStatus, errorMsg string) {
	// Avoid overly long error messages in status? Truncate if necessary.
	const maxErrorLength = 500
	trimmedErrorMsg := errorMsg
	if len(trimmedErrorMsg) > maxErrorLength {
		trimmedErrorMsg = trimmedErrorMsg[:maxErrorLength] + "... (truncated)"
	}

	log.Printf("ERROR for job %s -> %s: %s", filepath.Base(status.InputPath), filepath.Base(status.OutputPath), errorMsg) // Log full error

	mutex.Lock()
	if status.Error == "" { // Only set error if not already set
		status.Error = trimmedErrorMsg // Store potentially truncated error
	}
	status.Complete = true // Mark as 'complete' even on error to stop polling etc.
	// status.Progress = 0 // Reset progress on error? Or leave as is? Let's leave it.
	mutex.Unlock()

	// Clean up the input file (the downloaded temp file) on error
	// Check if InputPath is set and file exists before removing
	if status.InputPath != "" {
		err := os.Remove(status.InputPath)
		if err != nil && !os.IsNotExist(err) { // Don't log error if file already gone
			log.Printf("Warning: Failed to remove input file %s after error: %v", status.InputPath, err)
		} else if err == nil {
			log.Printf("Removed input file %s after error.", status.InputPath)
		}
	}

	// Consider removing potentially incomplete/corrupt output file on error?
	if status.OutputPath != "" {
		if _, err := os.Stat(status.OutputPath); err == nil {
			log.Printf("Removing potentially incomplete output file %s due to error.", status.OutputPath)
			errRemove := os.Remove(status.OutputPath)
			if errRemove != nil {
				log.Printf("Warning: Failed to remove output file %s after error: %v", status.OutputPath, errRemove)
			}
		}
	}
}


// --- Helpers ---

func ensureDirectoryExists(dirPath string) {
	if dirPath == "" {
		log.Printf("Warning: Attempted to ensure empty directory path exists.")
		return
	}
	// Use MkdirAll which is idempotent and creates parent dirs if needed
	err := os.MkdirAll(dirPath, 0755) // Use 0755 permissions
	if err != nil {
		// Log fatal only if it's a critical directory like uploads/converted?
		log.Printf("Warning: Failed to create directory %s: %v. Depending on usage, this might cause issues.", dirPath, err)
		// log.Fatalf("Failed to create directory %s: %v", dirPath, err) // Make fatal?
	} else {
		// Check if it actually created it (no-op if already exists)
		// This might log even if it already existed. Consider checking Stat first if noise is an issue.
		// log.Printf("Ensured directory exists: %s", dirPath)
	}
}

// Basic filename sanitization
func sanitizeFilename(fileName string) string {
	if fileName == "" {
		return "" // Return empty if input is empty
	}
	// Get base name to prevent path manipulation like "../../etc/passwd"
	baseName := filepath.Base(fileName)
	// Replace potentially harmful characters with underscores
	sanitized := filenameSanitizeRegex.ReplaceAllString(baseName, "_")
	// Replace multiple consecutive underscores with a single one
	sanitized = regexp.MustCompile(`_+`).ReplaceAllString(sanitized, "_")
	// Trim leading/trailing underscores/dots that might cause issues on some filesystems
	sanitized = strings.Trim(sanitized, "._")

	// Limit length (e.g., 100 chars) to prevent excessively long names
	maxLength := 100
	if len(sanitized) > maxLength {
		// Try to keep the extension if possible
		ext := filepath.Ext(sanitized)
		base := strings.TrimSuffix(sanitized, ext)
		// Ensure base length calculation handles multibyte characters correctly if needed
		if len(base) > maxLength-len(ext) {
			// Simple truncation - might break multibyte chars if not careful
			// Correctly handle rune length for slicing multibyte characters
			runes := []rune(base)
			if len(runes) > maxLength-len(ext) {
				base = string(runes[:maxLength-len(ext)])
			}
		}
		sanitized = base + ext
	}
	// Final check if sanitization resulted in empty/invalid name (e.g., if original was just "..")
	if sanitized == "" || sanitized == "." || sanitized == ".." {
		// Generate a more robust fallback based on timestamp or random string?
		// For now, a fixed placeholder.
		return fmt.Sprintf("sanitized_fallback_%d", time.Now().UnixNano())
	}
	return sanitized
}


func sendErrorResponse(w http.ResponseWriter, errMsg, details string, statusCode int) {
	response := ConversionResponse{
		Success: false,
		Error:   errMsg,
		Details: details,
	}
	w.Header().Set("Content-Type", "application/json")
	// Ensure CORS headers are set even for errors if needed by client
	// CORS headers are now applied by the middleware upstream, even for errors.
	w.WriteHeader(statusCode)
	err := json.NewEncoder(w).Encode(response)
	if err != nil {
		// Log error if sending the error response fails
		log.Printf("Error sending error response: %v (Original error: %s)", err, errMsg)
	}
}


// --- File Cleanup ---

func setupFileCleanup() {
	go func() {
		// Initial cleanup shortly after start
		log.Println("Scheduling initial file/status cleanup in 5 minutes...")
		time.Sleep(5 * time.Minute)
		cleanupOldFiles()
		cleanupOldStatuses()

		// Run periodically
		ticker := time.NewTicker(1 * time.Hour) // Check every hour
		defer ticker.Stop()
		log.Println("Starting periodic cleanup task (every 1 hour)...")
		for range ticker.C {
			cleanupOldFiles()
			cleanupOldStatuses() // Also clean up old conversion statuses
		}
	}()
}

func cleanupOldFiles() {
	maxAge := 24 * time.Hour // Files older than 24 hours
	now := time.Now()
	log.Println("Running cleanup for old files...")
	cleanupDir(config.UploadsDir, maxAge, now)
	cleanupDir(config.ConvertedDir, maxAge, now)
	log.Println("File cleanup finished.")
}

func cleanupDir(dirPath string, maxAge time.Duration, now time.Time) {
	entries, err := os.ReadDir(dirPath)
	if err != nil {
		if os.IsNotExist(err) {
			// log.Printf("Cleanup: Directory %s does not exist, skipping.", dirPath)
			return // Directory doesn't exist, nothing to cleanup
		}
		log.Printf("Error reading directory %s for cleanup: %v", dirPath, err)
		return
	}

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
				// Avoid logging errors for files that might already be deleted by another process/request
				if !os.IsNotExist(err) {
					log.Printf("Error removing old file %s: %v", filePath, err)
				}
			} else {
				// log.Printf("Removed old file: %s", filePath) // Can be noisy
				removedCount++
			}
		}
	}
	if removedCount > 0 {
		log.Printf("Removed %d old files from %s", removedCount, dirPath)
	}
}


// Cleanup old entries from the conversions map
func cleanupOldStatuses() {
	// Keep status for longer than files? e.g., 48 hours allows clients to check status later
	maxStatusAge := 48 * time.Hour
	now := time.Now()

	mutex.Lock()
	defer mutex.Unlock()

	initialCount := len(conversions)
	cleanedCount := 0
	for id, status := range conversions {
		// Use the timestamp in the ID for age calculation
		timestampNano, err := strconv.ParseInt(id, 10, 64)
		if err != nil {
			// If ID is not a timestamp, maybe use last modified time of OutputPath if complete?
			// Or just remove very old entries regardless of format?
			// For now, we only clean up timestamped IDs reliably.
			log.Printf("Warning: Skipping status cleanup for non-timestamp ID: %s", id)
			continue
		}

		statusTime := time.Unix(0, timestampNano)

		// Only remove completed or errored statuses older than max age
		if (status.Complete || status.Error != "") && now.Sub(statusTime) > maxStatusAge {
			delete(conversions, id)
			cleanedCount++
		}
	}
	if cleanedCount > 0 {
		log.Printf("Cleaned up %d old conversion status entries (out of %d).", cleanedCount, initialCount)
	}
}

// abortConversionHandler handles requests to cancel a running conversion
func abortConversionHandler(w http.ResponseWriter, r *http.Request) {
	// Check if it's a POST request (we're taking an action to abort)
	if r.Method != "POST" {
		sendErrorResponse(w, "Method not allowed", "Please use POST method to abort conversions", http.StatusMethodNotAllowed)
		return
	}

	// Extract the conversion ID from the URL path
	id := strings.TrimPrefix(r.URL.Path, "/api/abort/")
	if id == "" {
		sendErrorResponse(w, "Missing conversion ID", "Conversion ID is required", http.StatusBadRequest)
		return
	}

	// Check if the conversion exists in our tracking map
	mutex.Lock()
	status, exists := conversions[id]
	mutex.Unlock()

	if !exists {
		sendErrorResponse(w, "Conversion not found", "The specified conversion ID was not found", http.StatusNotFound)
		return
	}

	// Check if the conversion is already complete
	if status.Complete {
		sendErrorResponse(w, "Conversion already complete", "The conversion is already finished and cannot be aborted", http.StatusConflict)
		return
	}

	// Check if the process is still active
	activeMutex.Lock()
	cmd, active := activeConversions[id]
	activeMutex.Unlock()

	if !active {
		// Process not found in activeConversions but status exists and is not complete
		// This could be a race condition where the process just completed or an error in our tracking
		sendErrorResponse(w, "Process not found", "The conversion process was not found. It may have just completed.", http.StatusNotFound)
		return
	}

	// Try to kill the process
	var abortErr error
	if runtime.GOOS == "windows" {
		// On Windows, we need to kill the process group to ensure ffmpeg is terminated
		abortErr = cmd.Process.Kill()
	} else {
		// On Unix-like systems, we can send SIGTERM for graceful shutdown
		abortErr = cmd.Process.Signal(syscall.SIGTERM)
	}

	if abortErr != nil {
		log.Printf("Error aborting conversion %s: %v", id, abortErr)
		sendErrorResponse(w, "Failed to abort", fmt.Sprintf("Error while trying to abort: %v", abortErr), http.StatusInternalServerError)
		return
	}

	// Mark the conversion as complete with an error
	mutex.Lock()
	if status.Error == "" { // Only set error if not already set
		status.Error = "Conversion aborted by user"
	}
	status.Complete = true
	mutex.Unlock()

	log.Printf("Conversion %s aborted by user request", id)

	// Return success response
	response := ConversionResponse{
		Success:      true,
		Message:      "Conversion aborted successfully",
		ConversionID: id,
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

// activeConversionsHandler handles requests to list active conversions
func activeConversionsHandler(w http.ResponseWriter, r *http.Request) {
	// Check if it's a GET request
	if r.Method != "GET" {
		sendErrorResponse(w, "Method not allowed", "Please use GET method to list active conversions", http.StatusMethodNotAllowed)
		return
	}

	type ActiveConversion struct {
		ID       string  `json:"id"`
		FileName string  `json:"fileName"`
		Format   string  `json:"format"`
		Progress float64 `json:"progress"`
	}

	// Create a list of active conversion details
	activeMutex.Lock()
	mutex.Lock()
	
	activeConversionsList := make([]ActiveConversion, 0)
	
	// First, get all active conversion IDs from activeConversions
	activeIDs := make(map[string]bool)
	for id := range activeConversions {
		activeIDs[id] = true
	}
	
	// Then loop through all conversion statuses
	for id, status := range conversions {
		// Skip completed conversions
		if status.Complete {
			continue
		}
		
		// Check if this conversion has an active FFmpeg process
		if activeIDs[id] {
			// Extract filename from the output path
			fileName := filepath.Base(status.OutputPath)
			
			// Create an ActiveConversion object
			conv := ActiveConversion{
				ID:       id,
				FileName: fileName,
				Format:   status.Format,
				Progress: status.Progress,
			}
			
			activeConversionsList = append(activeConversionsList, conv)
		}
	}
	
	mutex.Unlock()
	activeMutex.Unlock()

	// Return the list of active conversion details
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(activeConversionsList)
}

// configHandler handles requests to get the default folder ID
func configHandler(w http.ResponseWriter, r *http.Request) {
	// Check if it's a GET request
	if r.Method != "GET" {
		sendErrorResponse(w, "Method not allowed", "Please use GET method to fetch config values", http.StatusMethodNotAllowed)
		return
	}

	// Create a response object with the default folder ID
	response := struct {
		DefaultDriveFolderId string `json:"defaultDriveFolderId"`
	}{
		DefaultDriveFolderId: config.DefaultDriveFolderId,
	}

	// Return the config values
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}
