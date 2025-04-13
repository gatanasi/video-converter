// Package api contains HTTP handlers for the application's API endpoints
package api

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/gatanasi/video-converter/internal/conversion"
	"github.com/gatanasi/video-converter/internal/drive"
	"github.com/gatanasi/video-converter/internal/filestore"
	"github.com/gatanasi/video-converter/internal/models"
)

// Handler encapsulates the dependencies for API handlers
type Handler struct {
	Config          models.Config
	Converter       *conversion.VideoConverter
	GoogleDriveAPIKey string
}

// NewHandler creates a new API handler with the given dependencies
func NewHandler(config models.Config, converter *conversion.VideoConverter) *Handler {
	return &Handler{
		Config:        config,
		Converter:     converter,
		GoogleDriveAPIKey: config.GoogleDriveAPIKey,
	}
}

// SetupRoutes configures the HTTP routes for the application
func (h *Handler) SetupRoutes(mux *http.ServeMux) {
	// API endpoints
	mux.HandleFunc("/api/list-videos", h.ListDriveVideosHandler)
	mux.HandleFunc("/api/convert-from-drive", h.ConvertFromDriveHandler)
	mux.HandleFunc("/api/status/", h.StatusHandler)
	mux.HandleFunc("/api/files", h.ListFilesHandler)
	mux.HandleFunc("/api/delete-file/", h.DeleteFileHandler)
	mux.HandleFunc("/api/abort/", h.AbortConversionHandler)
	mux.HandleFunc("/api/active-conversions", h.ActiveConversionsHandler)
	mux.HandleFunc("/api/config", h.ConfigHandler)

	// Public download endpoint
	mux.HandleFunc("/download/", h.DownloadHandler)

	// Static files
	mux.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir("static"))))
	mux.Handle("/", http.FileServer(http.Dir("."))) // Serve index.html from root
}

// ListDriveVideosHandler lists videos from a Google Drive folder
func (h *Handler) ListDriveVideosHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		h.sendErrorResponse(w, "Method not allowed", "", http.StatusMethodNotAllowed)
		return
	}

	folderID := r.URL.Query().Get("folderId")
	if folderID == "" {
		h.sendErrorResponse(w, "Missing 'folderId' query parameter", "", http.StatusBadRequest)
		return
	}

	log.Printf("Listing videos for folder: %s", folderID)

	// Call the drive package to list videos
	responseBytes, err := drive.ListVideos(folderID, h.GoogleDriveAPIKey)
	if err != nil {
		h.sendErrorResponse(w, "Failed to list videos from Google Drive", err.Error(), http.StatusInternalServerError)
		return
	}

	// Parse the response to extract just the files array
	var fileList models.GoogleDriveFileList
	if err := json.Unmarshal(responseBytes, &fileList); err != nil {
		h.sendErrorResponse(w, "Failed to parse response from Google Drive", err.Error(), http.StatusInternalServerError)
		return
	}

	// Send the list back to the frontend
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	if err := json.NewEncoder(w).Encode(fileList.Files); err != nil {
		log.Printf("Error encoding file list response: %v", err)
	}
}

// ConvertFromDriveHandler handles requests to convert a video from Google Drive
func (h *Handler) ConvertFromDriveHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		h.sendErrorResponse(w, "Method not allowed", "", http.StatusMethodNotAllowed)
		return
	}

	var request models.DriveConversionRequest
	// Limit request body size
	r.Body = http.MaxBytesReader(w, r.Body, 1*1024*1024) // 1MB limit for JSON request
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		h.sendErrorResponse(w, "Failed to parse request", err.Error(), http.StatusBadRequest)
		return
	}

	// Validate input
	if request.FileID == "" {
		h.sendErrorResponse(w, "No file ID specified", "", http.StatusBadRequest)
		return
	}

	validFormats := map[string]bool{"mov": true, "mp4": true, "avi": true}
	if !validFormats[request.TargetFormat] {
		h.sendErrorResponse(w, "Invalid target format specified", "", http.StatusBadRequest)
		return
	}

	// Sanitize filename
	sanitizedBaseName := filestore.SanitizeFilename(request.FileName)
	if sanitizedBaseName == "" {
		sanitizedBaseName = fmt.Sprintf("gdrive-video-%s", request.FileID) // Fallback name
	}
	fileNameWithoutExt := strings.TrimSuffix(sanitizedBaseName, filepath.Ext(sanitizedBaseName))

	// Generate unique ID and create file paths
	timestamp := time.Now().UnixNano()
	conversionID := strconv.FormatInt(timestamp, 10)

	// Create file paths
	uploadedFileName := fmt.Sprintf("%d-%s", timestamp, sanitizedBaseName)
	uploadedFilePath := filepath.Join(h.Config.UploadsDir, uploadedFileName)

	outputFileName := fmt.Sprintf("%s-%d.%s", fileNameWithoutExt, timestamp, request.TargetFormat)
	outputFilePath := filepath.Join(h.Config.ConvertedDir, outputFileName)

	// Create initial status entry
	status := &models.ConversionStatus{
		InputPath:  uploadedFilePath,
		OutputPath: outputFilePath,
		Format:     request.TargetFormat,
		Progress:   0,
		Complete:   false,
	}
	models.ConversionMutex.Lock()
	models.ConversionStore[conversionID] = status
	models.ConversionMutex.Unlock()

	// Download the file from Drive
	if err := drive.DownloadFile(request.FileID, h.GoogleDriveAPIKey, uploadedFilePath, h.Config.MaxFileSize); err != nil {
		models.ConversionMutex.Lock()
		status.Error = err.Error()
		status.Complete = true
		models.ConversionMutex.Unlock()
		h.sendErrorResponse(w, "Failed to download file from Google Drive", err.Error(), http.StatusInternalServerError)
		return
	}

	// Create the job for the worker pool
	job := models.ConversionJob{
		ConversionID:     conversionID,
		FileID:           request.FileID,
		FileName:         request.FileName,
		TargetFormat:     request.TargetFormat,
		UploadedFilePath: uploadedFilePath,
		OutputFilePath:   outputFilePath,
		Status:           status,
		ReverseVideo:     request.ReverseVideo,
		RemoveSound:      request.RemoveSound,
	}

	// Queue the job
	if err := h.Converter.QueueJob(job); err != nil {
		models.ConversionMutex.Lock()
		delete(models.ConversionStore, conversionID)
		models.ConversionMutex.Unlock()
		h.sendErrorResponse(w, "Server busy", "Conversion queue is full, please try again later.", http.StatusServiceUnavailable)
		return
	}

	// Respond to the client
	downloadURL := fmt.Sprintf("/download/%s", outputFileName)
	response := models.ConversionResponse{
		Success:      true,
		Message:      "Conversion job queued",
		DownloadURL:  downloadURL,
		ConversionID: conversionID,
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(response)
}

// StatusHandler returns the status of a conversion job
func (h *Handler) StatusHandler(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/status/")
	if id == "" {
		http.Error(w, "Conversion ID not specified", http.StatusBadRequest)
		return
	}

	models.ConversionMutex.Lock()
	status, exists := models.ConversionStore[id]
	var statusCopy models.ConversionStatus
	if exists {
		statusCopy = *status
	}
	models.ConversionMutex.Unlock()

	if !exists {
		http.Error(w, "Conversion not found or expired", http.StatusNotFound)
		return
	}

	// Create response object from the copy
	response := struct {
		ID        string  `json:"id"`
		Progress  float64 `json:"progress"`
		Complete  bool    `json:"complete"`
		Error     string  `json:"error,omitempty"`
		Format    string  `json:"format"`
		OutputPath string `json:"outputPath,omitempty"`
	}{
		ID:       id,
		Progress: statusCopy.Progress,
		Complete: statusCopy.Complete,
		Error:    statusCopy.Error,
		Format:   statusCopy.Format,
		OutputPath: func() string {
			if statusCopy.Complete && statusCopy.Error == "" {
				return fmt.Sprintf("/download/%s", filepath.Base(statusCopy.OutputPath))
			}
			return ""
		}(),
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

// DownloadHandler serves the converted file for download
func (h *Handler) DownloadHandler(w http.ResponseWriter, r *http.Request) {
	filename := strings.TrimPrefix(r.URL.Path, "/download/")
	if filename == "" {
		http.Error(w, "Filename not specified", http.StatusBadRequest)
		return
	}

	// Basic path traversal check
	if strings.Contains(filename, "..") || strings.ContainsAny(filename, "/\\") {
		http.Error(w, "Invalid filename", http.StatusBadRequest)
		return
	}

	filePath := filepath.Join(h.Config.ConvertedDir, filename)

	// Check if file exists before setting headers
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
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	// Set appropriate headers for download
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))
	
	// Set content type based on extension
	contentType := "application/octet-stream" // Generic fallback
	ext := strings.ToLower(filepath.Ext(filename))
	switch ext {
	case ".mov":
		contentType = "video/quicktime"
	case ".mp4":
		contentType = "video/mp4"
	case ".avi":
		contentType = "video/x-msvideo"
	}
	w.Header().Set("Content-Type", contentType)

	http.ServeFile(w, r, filePath)
}

// ListFilesHandler returns a list of converted files
func (h *Handler) ListFilesHandler(w http.ResponseWriter, r *http.Request) {
	files, err := os.ReadDir(h.Config.ConvertedDir)
	if err != nil {
		h.sendErrorResponse(w, "Failed to list files", err.Error(), http.StatusInternalServerError)
		return
	}

	type FileInfo struct {
		Name    string    `json:"name"`
		Size    int64     `json:"size"`
		ModTime time.Time `json:"modTime"`
		URL     string    `json:"url"`
	}

	var fileInfos []FileInfo
	for _, file := range files {
		if !file.IsDir() {
			info, err := file.Info()
			if err != nil {
				log.Printf("Could not get info for file %s: %v", file.Name(), err)
				continue
			}
			fileInfos = append(fileInfos, FileInfo{
				Name:    file.Name(),
				Size:    info.Size(),
				ModTime: info.ModTime(),
				URL:     fmt.Sprintf("/download/%s", file.Name()),
			})
		}
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(fileInfos)
}

// DeleteFileHandler handles deleting a converted file
func (h *Handler) DeleteFileHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		h.sendErrorResponse(w, "Method not allowed", "Please use the DELETE method.", http.StatusMethodNotAllowed)
		return
	}

	filename := strings.TrimPrefix(r.URL.Path, "/api/delete-file/")
	if filename == "" {
		http.Error(w, "Filename not specified", http.StatusBadRequest)
		return
	}
	
	// Basic path traversal check
	if strings.Contains(filename, "..") || strings.ContainsAny(filename, "/\\") {
		http.Error(w, "Invalid filename", http.StatusBadRequest)
		return
	}

	filePath := filepath.Join(h.Config.ConvertedDir, filename)

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
		h.sendErrorResponse(w, "Failed to delete file", err.Error(), http.StatusInternalServerError)
		return
	}

	log.Printf("Deleted file: %s", filePath)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, `{"success": true, "message": "File '%s' deleted successfully"}`, filename)
}

// AbortConversionHandler handles requests to abort a conversion job
func (h *Handler) AbortConversionHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		h.sendErrorResponse(w, "Method not allowed", "Please use POST method to abort conversions", http.StatusMethodNotAllowed)
		return
	}

	id := strings.TrimPrefix(r.URL.Path, "/api/abort/")
	if id == "" {
		h.sendErrorResponse(w, "Missing conversion ID", "Conversion ID is required", http.StatusBadRequest)
		return
	}

	models.ConversionMutex.Lock()
	status, exists := models.ConversionStore[id]
	models.ConversionMutex.Unlock()

	if !exists {
		h.sendErrorResponse(w, "Conversion not found", "The specified conversion ID was not found", http.StatusNotFound)
		return
	}

	if status.Complete {
		h.sendErrorResponse(w, "Conversion already complete", "The conversion is already finished and cannot be aborted", http.StatusConflict)
		return
	}

	models.ActiveMutex.Lock()
	cmd, active := models.ActiveConversions[id]
	models.ActiveMutex.Unlock()

	if !active {
		h.sendErrorResponse(w, "Process not found", "The conversion process was not found. It may have just completed.", http.StatusNotFound)
		return
	}

	// Try to kill the process
	var abortErr error
	if strings.Contains(strings.ToLower(runtime.GOOS), "windows") {
		abortErr = cmd.Process.Kill()
	} else {
		abortErr = cmd.Process.Signal(syscall.SIGTERM)
	}

	if abortErr != nil {
		log.Printf("Error aborting conversion %s: %v", id, abortErr)
		h.sendErrorResponse(w, "Failed to abort", fmt.Sprintf("Error while trying to abort: %v", abortErr), http.StatusInternalServerError)
		return
	}

	models.ConversionMutex.Lock()
	if status.Error == "" {
		status.Error = "Conversion aborted by user"
	}
	status.Complete = true
	models.ConversionMutex.Unlock()

	log.Printf("Conversion %s aborted by user request", id)

	response := models.ConversionResponse{
		Success:      true,
		Message:      "Conversion aborted successfully",
		ConversionID: id,
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

// ActiveConversionsHandler returns a list of active conversions
func (h *Handler) ActiveConversionsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		h.sendErrorResponse(w, "Method not allowed", "Please use GET method to list active conversions", http.StatusMethodNotAllowed)
		return
	}

	type ActiveConversion struct {
		ID       string  `json:"id"`
		FileName string  `json:"fileName"`
		Format   string  `json:"format"`
		Progress float64 `json:"progress"`
	}

	models.ActiveMutex.Lock()
	models.ConversionMutex.Lock()
	
	activeConversionsList := make([]ActiveConversion, 0)
	
	// First, get all active conversion IDs
	activeIDs := make(map[string]bool)
	for id := range models.ActiveConversions {
		activeIDs[id] = true
	}
	
	// Then loop through all conversion statuses
	for id, status := range models.ConversionStore {
		if status.Complete {
			continue
		}
		
		if activeIDs[id] {
			fileName := filepath.Base(status.OutputPath)
			
			conv := ActiveConversion{
				ID:       id,
				FileName: fileName,
				Format:   status.Format,
				Progress: status.Progress,
			}
			
			activeConversionsList = append(activeConversionsList, conv)
		}
	}
	
	models.ConversionMutex.Unlock()
	models.ActiveMutex.Unlock()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(activeConversionsList)
}

// ConfigHandler returns configuration values to the client
func (h *Handler) ConfigHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		h.sendErrorResponse(w, "Method not allowed", "Please use GET method to fetch config values", http.StatusMethodNotAllowed)
		return
	}

	response := struct {
		DefaultDriveFolderId string `json:"defaultDriveFolderId"`
	}{
		DefaultDriveFolderId: h.Config.DefaultDriveFolderId,
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

// sendErrorResponse sends a standardized error response
func (h *Handler) sendErrorResponse(w http.ResponseWriter, errMsg, details string, statusCode int) {
	response := models.ConversionResponse{
		Success: false,
		Error:   errMsg,
		Details: details,
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	err := json.NewEncoder(w).Encode(response)
	if err != nil {
		log.Printf("Error sending error response: %v (Original error: %s)", err, errMsg)
	}
}