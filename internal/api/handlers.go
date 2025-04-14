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

// Handler encapsulates dependencies for API handlers.
type Handler struct {
	Config    models.Config
	Converter *conversion.VideoConverter
}

// NewHandler creates a new API handler.
func NewHandler(config models.Config, converter *conversion.VideoConverter) *Handler {
	return &Handler{
		Config:    config,
		Converter: converter,
	}
}

// SetupRoutes configures the HTTP routes.
func (h *Handler) SetupRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/list-videos", h.ListDriveVideosHandler)
	mux.HandleFunc("/api/convert-from-drive", h.ConvertFromDriveHandler)
	mux.HandleFunc("/api/status/", h.StatusHandler) // Expects /api/status/{id}
	mux.HandleFunc("/api/files", h.ListFilesHandler)
	mux.HandleFunc("/api/delete-file/", h.DeleteFileHandler) // Expects /api/delete-file/{filename}
	mux.HandleFunc("/api/abort/", h.AbortConversionHandler) // Expects /api/abort/{id}
	mux.HandleFunc("/api/active-conversions", h.ActiveConversionsHandler)
	mux.HandleFunc("/api/config", h.ConfigHandler)

	mux.HandleFunc("/download/", h.DownloadHandler) // Expects /download/{filename}

	// Serve static files and the root index.html
	mux.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir("video-converter/static"))))
	mux.Handle("/", http.FileServer(http.Dir("video-converter")))
}

// ListDriveVideosHandler lists videos from a Google Drive folder.
func (h *Handler) ListDriveVideosHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		h.sendErrorResponse(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	folderID := r.URL.Query().Get("folderId")
	if folderID == "" {
		h.sendErrorResponse(w, "Missing 'folderId' query parameter", http.StatusBadRequest)
		return
	}

	log.Printf("Listing videos for folder: %s", folderID)
	responseBytes, err := drive.ListVideos(folderID, h.Config.GoogleDriveAPIKey)
	if err != nil {
		h.sendErrorResponse(w, fmt.Sprintf("Failed to list videos from Google Drive: %v", err), http.StatusInternalServerError)
		return
	}

	// Parse the response to extract just the files array
	var fileList models.GoogleDriveFileList
	if err := json.Unmarshal(responseBytes, &fileList); err != nil {
		h.sendErrorResponse(w, fmt.Sprintf("Failed to parse response from Google Drive: %v", err), http.StatusInternalServerError)
		return
	}

	h.sendJSONResponse(w, fileList.Files, http.StatusOK)
}

// ConvertFromDriveHandler handles requests to convert a video from Google Drive.
func (h *Handler) ConvertFromDriveHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		h.sendErrorResponse(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var request models.DriveConversionRequest
	r.Body = http.MaxBytesReader(w, r.Body, 1*1024*1024) // 1MB limit for JSON request
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		h.sendErrorResponse(w, fmt.Sprintf("Failed to parse request: %v", err), http.StatusBadRequest)
		return
	}

	if request.FileID == "" || request.FileName == "" || request.TargetFormat == "" {
		h.sendErrorResponse(w, "Missing required fields: fileId, fileName, targetFormat", http.StatusBadRequest)
		return
	}

	validFormats := map[string]bool{"mov": true, "mp4": true, "avi": true}
	if !validFormats[request.TargetFormat] {
		h.sendErrorResponse(w, "Invalid target format specified", http.StatusBadRequest)
		return
	}

	// Prepare filenames and paths
	sanitizedBaseName := filestore.SanitizeFilename(request.FileName)
	if sanitizedBaseName == "" {
		sanitizedBaseName = fmt.Sprintf("gdrive-video-%s", request.FileID) // Fallback
	}
	fileNameWithoutExt := strings.TrimSuffix(sanitizedBaseName, filepath.Ext(sanitizedBaseName))
	timestamp := time.Now().UnixNano()
	conversionID := strconv.FormatInt(timestamp, 10)

	// Use timestamp and original (sanitized) name for uniqueness and traceability
	uploadedFileName := fmt.Sprintf("%d-%s", timestamp, sanitizedBaseName)
	uploadedFilePath := filepath.Join(h.Config.UploadsDir, uploadedFileName)
	outputFileName := fmt.Sprintf("%s-%d.%s", fileNameWithoutExt, timestamp, request.TargetFormat)
	outputFilePath := filepath.Join(h.Config.ConvertedDir, outputFileName)

	// Create initial status entry
	status := &models.ConversionStatus{
		InputPath:  uploadedFilePath, // Store path where it *will* be downloaded
		OutputPath: outputFilePath,
		Format:     request.TargetFormat,
		Progress:   0,
		Complete:   false,
	}
	models.SetConversionStatus(conversionID, status) // Use helper

	// Download the file from Drive
	log.Printf("Starting download for job %s (File ID: %s)", conversionID, request.FileID)
	if err := drive.DownloadFile(request.FileID, h.Config.GoogleDriveAPIKey, uploadedFilePath, h.Config.MaxFileSize); err != nil {
		errMsg := fmt.Sprintf("Failed to download file from Google Drive: %v", err)
		models.UpdateStatusWithError(conversionID, errMsg) // Use helper
		h.sendErrorResponse(w, errMsg, http.StatusInternalServerError)
		return
	}
	log.Printf("Download complete for job %s", conversionID)

	// Create and queue the conversion job
	job := models.ConversionJob{
		ConversionID:     conversionID,
		FileID:           request.FileID, // Keep for logging/tracking
		FileName:         request.FileName, // Original name for context
		TargetFormat:     request.TargetFormat,
		UploadedFilePath: uploadedFilePath, // Path of the *downloaded* file
		OutputFilePath:   outputFilePath,
		Status:           status, // Pass the pointer
		ReverseVideo:     request.ReverseVideo,
		RemoveSound:      request.RemoveSound,
	}

	if err := h.Converter.QueueJob(job); err != nil {
		models.DeleteConversionStatus(conversionID) // Clean up status if queue fails
		os.Remove(uploadedFilePath)                 // Clean up downloaded file
		h.sendErrorResponse(w, "Server busy, conversion queue is full", http.StatusServiceUnavailable)
		return
	}

	// Respond with success and job ID
	response := models.ConversionResponse{
		Success:      true,
		Message:      "Conversion job queued successfully",
		ConversionID: conversionID,
		// Download URL is determined later based on status
	}
	h.sendJSONResponse(w, response, http.StatusAccepted)
}

// StatusHandler returns the status of a conversion job.
func (h *Handler) StatusHandler(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/status/")
	if id == "" {
		h.sendErrorResponse(w, "Conversion ID not specified", http.StatusBadRequest)
		return
	}

	status, exists := models.GetConversionStatus(id) // Use helper
	if !exists {
		h.sendErrorResponse(w, "Conversion not found or expired", http.StatusNotFound)
		return
	}

	// Create response object from the retrieved status
	response := struct {
		ID          string  `json:"id"`
		Progress    float64 `json:"progress"`
		Complete    bool    `json:"complete"`
		Error       string  `json:"error,omitempty"`
		Format      string  `json:"format"`
		DownloadURL string  `json:"downloadUrl,omitempty"`
	}{
		ID:       id,
		Progress: status.Progress,
		Complete: status.Complete,
		Error:    status.Error,
		Format:   status.Format,
		DownloadURL: func() string {
			if status.Complete && status.Error == "" {
				// Generate download URL only if completed successfully
				return fmt.Sprintf("/download/%s", filepath.Base(status.OutputPath))
			}
			return ""
		}(),
	}

	h.sendJSONResponse(w, response, http.StatusOK)
}

// DownloadHandler serves the converted file.
func (h *Handler) DownloadHandler(w http.ResponseWriter, r *http.Request) {
	filename := strings.TrimPrefix(r.URL.Path, "/download/")
	if filename == "" || strings.Contains(filename, "..") || strings.ContainsAny(filename, "/\\") {
		http.Error(w, "Invalid filename", http.StatusBadRequest)
		return
	}

	filePath := filepath.Join(h.Config.ConvertedDir, filename)

	// Check if file exists and is not a directory before serving
	fileInfo, err := os.Stat(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			http.Error(w, "File not found", http.StatusNotFound)
		} else {
			log.Printf("Error stating file %s: %v", filePath, err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
		}
		return
	}
	if fileInfo.IsDir() {
		http.Error(w, "Invalid request (directory specified)", http.StatusBadRequest)
		return
	}

	// Set headers for download
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))
	contentType := "application/octet-stream" // Default
	ext := strings.ToLower(filepath.Ext(filename))
	switch ext {
	case ".mov": contentType = "video/quicktime"
	case ".mp4": contentType = "video/mp4"
	case ".avi": contentType = "video/x-msvideo"
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Length", strconv.FormatInt(fileInfo.Size(), 10))

	http.ServeFile(w, r, filePath)
}

// ListFilesHandler returns a list of available converted files.
func (h *Handler) ListFilesHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		h.sendErrorResponse(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	entries, err := os.ReadDir(h.Config.ConvertedDir)
	if (err != nil) {
		// Don't treat "not found" as an error, just return empty list
		if os.IsNotExist(err) {
			h.sendJSONResponse(w, []models.FileInfo{}, http.StatusOK)
			return
		}
		h.sendErrorResponse(w, fmt.Sprintf("Failed to list files: %v", err), http.StatusInternalServerError)
		return
	}

	fileInfos := make([]models.FileInfo, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() {
			info, err := entry.Info()
			if err != nil {
				log.Printf("Could not get info for file %s: %v", entry.Name(), err)
				continue // Skip files we can't get info for
			}
			fileInfos = append(fileInfos, models.FileInfo{
				Name:    entry.Name(),
				Size:    info.Size(),
				ModTime: info.ModTime(),
				URL:     fmt.Sprintf("/download/%s", entry.Name()),
			})
		}
	}

	h.sendJSONResponse(w, fileInfos, http.StatusOK)
}

// DeleteFileHandler handles deleting a converted file.
func (h *Handler) DeleteFileHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		h.sendErrorResponse(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	filename := strings.TrimPrefix(r.URL.Path, "/api/delete-file/")
	if filename == "" || strings.Contains(filename, "..") || strings.ContainsAny(filename, "/\\") {
		http.Error(w, "Invalid filename", http.StatusBadRequest)
		return
	}

	filePath := filepath.Join(h.Config.ConvertedDir, filename)

	// Attempt to remove the file
	err := os.Remove(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			http.Error(w, "File not found", http.StatusNotFound)
		} else {
			log.Printf("Failed to delete file %s: %v", filePath, err)
			h.sendErrorResponse(w, fmt.Sprintf("Failed to delete file: %v", err), http.StatusInternalServerError)
		}
		return
	}

	log.Printf("Deleted file: %s", filePath)
	h.sendJSONResponse(w, map[string]interface{}{"success": true, "message": fmt.Sprintf("File '%s' deleted successfully", filename)}, http.StatusOK)
}

// AbortConversionHandler handles requests to abort a conversion job.
func (h *Handler) AbortConversionHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		h.sendErrorResponse(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	id := strings.TrimPrefix(r.URL.Path, "/api/abort/")
	if id == "" {
		h.sendErrorResponse(w, "Missing conversion ID", http.StatusBadRequest)
		return
	}

	status, exists := models.GetConversionStatus(id)
	if !exists {
		h.sendErrorResponse(w, "Conversion not found", http.StatusNotFound)
		return
	}

	if status.Complete {
		h.sendErrorResponse(w, "Conversion already complete or aborted", http.StatusConflict)
		return
	}

	cmd, active := models.GetActiveConversionCmd(id)
	if !active {
		// It might have just finished between the status check and here.
		// Re-check status. If it's now complete, report conflict. Otherwise, report not found.
		status, exists = models.GetConversionStatus(id)
		if exists && status.Complete {
			h.sendErrorResponse(w, "Conversion completed before abort request processed", http.StatusConflict)
		} else {
			h.sendErrorResponse(w, "Active conversion process not found (may have already finished)", http.StatusNotFound)
		}
		return
	}

	// Attempt to terminate the process
	var abortErr error
	if runtime.GOOS == "windows" {
		abortErr = cmd.Process.Kill()
	} else {
		// Send SIGTERM first for potentially cleaner shutdown
		abortErr = cmd.Process.Signal(syscall.SIGTERM)
		if abortErr != nil {
			// If SIGTERM fails, try SIGKILL
			log.Printf("SIGTERM failed for conversion %s, trying SIGKILL: %v", id, abortErr)
			abortErr = cmd.Process.Signal(syscall.SIGKILL)
		}
	}

	if abortErr != nil {
		// Even if killing fails, update status to reflect the attempt
		errMsg := fmt.Sprintf("Failed to stop FFmpeg process: %v", abortErr)
		log.Printf("Error aborting conversion %s: %s", id, errMsg)
		models.UpdateStatusWithError(id, "Abort requested, but process termination failed: "+abortErr.Error())
		h.sendErrorResponse(w, errMsg, http.StatusInternalServerError)
		return
	}

	// Update status after successful signal/kill
	models.UpdateStatusWithError(id, "Conversion aborted by user")
	log.Printf("Conversion %s aborted by user request", id)

	response := models.ConversionResponse{
		Success:      true,
		Message:      "Conversion abort requested successfully",
		ConversionID: id,
	}
	h.sendJSONResponse(w, response, http.StatusOK)
}

// ActiveConversionsHandler returns a list of currently active conversions.
func (h *Handler) ActiveConversionsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		h.sendErrorResponse(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	activeJobs := models.GetActiveConversionsInfo() // Use helper

	h.sendJSONResponse(w, activeJobs, http.StatusOK)
}

// ConfigHandler returns relevant configuration values to the client.
func (h *Handler) ConfigHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		h.sendErrorResponse(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Only expose necessary config to the frontend
	response := struct {
		DefaultDriveFolderId string `json:"defaultDriveFolderId"`
	}{
		DefaultDriveFolderId: h.Config.DefaultDriveFolderId,
	}

	h.sendJSONResponse(w, response, http.StatusOK)
}

// sendJSONResponse sends a JSON response with appropriate headers.
func (h *Handler) sendJSONResponse(w http.ResponseWriter, data interface{}, statusCode int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	if err := json.NewEncoder(w).Encode(data); err != nil {
		// Log error, but can't send another response if headers are already sent
		log.Printf("Error encoding JSON response: %v", err)
	}
}

// sendErrorResponse sends a standardized JSON error response.
func (h *Handler) sendErrorResponse(w http.ResponseWriter, errMsg string, statusCode int) {
	response := models.ConversionResponse{
		Success: false,
		Error:   errMsg,
	}
	h.sendJSONResponse(w, response, statusCode)
}