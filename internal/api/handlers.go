// Package api contains HTTP handlers for the application's API endpoints
package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"sort"
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
	Store     *conversion.Store
}

// NewHandler creates a new API handler.
func NewHandler(config models.Config, converter *conversion.VideoConverter, store *conversion.Store) *Handler {
	return &Handler{
		Config:    config,
		Converter: converter,
		Store:     store,
	}
}

// SetupRoutes configures the HTTP routes.
func (h *Handler) SetupRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/list-videos", h.ListDriveVideosHandler)
	mux.HandleFunc("/api/convert-from-drive", h.ConvertFromDriveHandler)
	mux.HandleFunc("/api/status/", h.StatusHandler) // Expects /api/status/{id}
	mux.HandleFunc("/api/files", h.ListFilesHandler)
	mux.HandleFunc("/api/delete-file/", h.DeleteFileHandler) // Expects /api/delete-file/{filename}
	mux.HandleFunc("/api/abort/", h.AbortConversionHandler)  // Expects /api/abort/{id}
	mux.HandleFunc("/api/active-conversions", h.ActiveConversionsHandler)
	mux.HandleFunc("/api/config", h.ConfigHandler)
	mux.HandleFunc("/download/", h.DownloadHandler) // Expects /download/{filename}

	// Serve static files (CSS, JS, images) from the 'static' directory
	// Use http.Dir with a relative path. Assumes 'static' is relative to the executable.
	staticFileServer := http.FileServer(http.Dir("static"))
	mux.Handle("/static/", http.StripPrefix("/static/", staticFileServer))

	// Serve the main index.html file for the root path ONLY.
	// Prevents serving other files or directory listings from the root.
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// Ensure only the root path "/" serves index.html
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		// Explicitly serve the index.html file.
		http.ServeFile(w, r, filepath.Join("index.html"))
	})
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
		errMsg := fmt.Sprintf("Failed to list videos from Google Drive: %v", err)
		log.Printf("ERROR: %s", errMsg)
		h.sendErrorResponse(w, errMsg, http.StatusInternalServerError)
		return
	}

	var fileList models.GoogleDriveFileList
	if err := json.Unmarshal(responseBytes, &fileList); err != nil {
		errMsg := fmt.Sprintf("Failed to parse response from Google Drive: %v", err)
		log.Printf("ERROR: %s", errMsg)
		h.sendErrorResponse(w, errMsg, http.StatusInternalServerError)
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
	r.Body = http.MaxBytesReader(w, r.Body, 1*1024*1024)
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		errMsg := fmt.Sprintf("Failed to parse request: %v", err)
		log.Printf("WARN: %s", errMsg)
		h.sendErrorResponse(w, errMsg, http.StatusBadRequest)
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

	status := &models.ConversionStatus{
		InputPath:  uploadedFilePath,
		OutputPath: outputFilePath,
		Format:     request.TargetFormat,
		Progress:   0,
		Complete:   false,
	}
	h.Store.SetStatus(conversionID, status)

	log.Printf("Starting download for job %s (File ID: %s)", conversionID, request.FileID)
	if err := drive.DownloadFile(request.FileID, h.Config.GoogleDriveAPIKey, uploadedFilePath, h.Config.MaxFileSize); err != nil {
		errMsg := fmt.Sprintf("Failed to download file from Google Drive: %v", err)
		log.Printf("ERROR [job %s]: %s", conversionID, errMsg)
		h.Store.UpdateStatusWithError(conversionID, errMsg)
		h.sendErrorResponse(w, errMsg, http.StatusInternalServerError)
		return
	}
	log.Printf("Download complete for job %s", conversionID)

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

	if err := h.Converter.QueueJob(job); err != nil {
		log.Printf("ERROR [job %s]: Failed to queue job: %v", conversionID, err)
		h.Store.DeleteStatus(conversionID)
		// Attempt to remove the uploaded file, log if it fails
		if removeErr := os.Remove(uploadedFilePath); removeErr != nil {
			log.Printf("WARN [job %s]: Failed to remove uploaded file %s after queue failure: %v", conversionID, uploadedFilePath, removeErr)
		}
		h.sendErrorResponse(w, "Server busy, conversion queue is full", http.StatusServiceUnavailable)
		return
	}

	response := models.ConversionResponse{
		Success:      true,
		Message:      "Conversion job queued successfully",
		ConversionID: conversionID,
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

	status, exists := h.Store.GetStatus(id)
	if !exists {
		h.sendErrorResponse(w, "Conversion not found or expired", http.StatusNotFound)
		return
	}

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
		log.Printf("WARN: Invalid filename requested for download: %s", filename)
		http.Error(w, "Invalid filename", http.StatusBadRequest)
		return
	}

	filePath := filepath.Join(h.Config.ConvertedDir, filename)

	fileInfo, err := os.Stat(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			log.Printf("WARN: Requested download file not found: %s", filePath)
			http.Error(w, "File not found", http.StatusNotFound)
		} else {
			log.Printf("ERROR: Error stating download file %s: %v", filePath, err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
		}
		return
	}
	if fileInfo.IsDir() {
		log.Printf("WARN: Directory requested for download instead of file: %s", filePath)
		http.Error(w, "Invalid request (directory specified)", http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))
	contentType := "application/octet-stream"
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
	if err != nil {
		if os.IsNotExist(err) {
			log.Printf("INFO: Converted directory not found, returning empty list: %s", h.Config.ConvertedDir)
			h.sendJSONResponse(w, []models.FileInfo{}, http.StatusOK)
			return
		}
		errMsg := fmt.Sprintf("Failed to list files: %v", err)
		log.Printf("ERROR: %s", errMsg)
		h.sendErrorResponse(w, errMsg, http.StatusInternalServerError)
		return
	}

	fileInfos := make([]models.FileInfo, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() {
			info, err := entry.Info()
			if err != nil {
				log.Printf("WARN: Could not get info for file %s: %v", entry.Name(), err)
				continue
			}
			fileInfos = append(fileInfos, models.FileInfo{
				Name:    entry.Name(),
				Size:    info.Size(),
				ModTime: info.ModTime(),
				URL:     fmt.Sprintf("/download/%s", entry.Name()),
			})
		}
	}

	sort.Slice(fileInfos, func(i, j int) bool {
		return fileInfos[i].ModTime.After(fileInfos[j].ModTime)
	})

	h.sendJSONResponse(w, fileInfos, http.StatusOK)
}

// DeleteFileHandler handles deleting a converted file.
func (h *Handler) DeleteFileHandler(w http.ResponseWriter, r *http.Request) {
	filename := strings.TrimPrefix(r.URL.Path, "/api/delete-file/")
	if r.Method != http.MethodDelete {
		h.sendErrorResponse(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if filename == "" || strings.Contains(filename, "..") || strings.ContainsAny(filename, "/\\") {
		log.Printf("WARN: Invalid filename requested for deletion: %s", filename)
		http.Error(w, "Invalid filename", http.StatusBadRequest)
		return
	}

	filePath := filepath.Join(h.Config.ConvertedDir, filename)

	err := os.Remove(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			log.Printf("WARN: File not found for deletion: %s", filePath)
			http.Error(w, "File not found", http.StatusNotFound)
		} else {
			log.Printf("ERROR: Failed to delete file %s: %v", filePath, err)
			h.sendErrorResponse(w, fmt.Sprintf("Failed to delete file: %v", err), http.StatusInternalServerError)
		}
		return
	}

	log.Printf("Deleted file: %s", filePath)
	h.sendJSONResponse(w, map[string]interface{}{"success": true, "message": fmt.Sprintf("File '%s' deleted successfully", filename)}, http.StatusOK)
}

// AbortConversionHandler handles requests to abort a conversion job.
func (h *Handler) AbortConversionHandler(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/abort/")
	if r.Method != http.MethodPost {
		h.sendErrorResponse(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if id == "" {
		h.sendErrorResponse(w, "Missing conversion ID", http.StatusBadRequest)
		return
	}

	status, exists := h.Store.GetStatus(id)
	if !exists {
		h.sendErrorResponse(w, "Conversion not found", http.StatusNotFound)
		return
	}

	if status.Complete {
		h.sendErrorResponse(w, "Conversion already complete or aborted", http.StatusConflict)
		return
	}

	cmd, active := h.Store.GetActiveCmd(id)
	if !active {
		status, exists = h.Store.GetStatus(id)
		if exists && status.Complete {
			log.Printf("WARN [job %s]: Abort requested but conversion completed before processing", id)
			h.sendErrorResponse(w, "Conversion completed before abort request processed", http.StatusConflict)
		} else {
			log.Printf("WARN [job %s]: Abort requested but active conversion process not found", id)
			h.sendErrorResponse(w, "Active conversion process not found (may have already finished)", http.StatusNotFound)
		}
		return
	}

	log.Printf("INFO [job %s]: Attempting to abort conversion process", id)
	var abortErr error
	if runtime.GOOS == "windows" {
		abortErr = cmd.Process.Kill()
	} else {
		abortErr = cmd.Process.Signal(syscall.SIGTERM)
		if abortErr != nil && !errors.Is(abortErr, os.ErrProcessDone) {
			log.Printf("WARN [job %s]: SIGTERM failed, trying SIGKILL: %v", id, abortErr)
			abortErr = cmd.Process.Signal(syscall.SIGKILL)
		} else if abortErr == nil {
			log.Printf("INFO [job %s]: Sent SIGTERM to process", id)
		}
	}

	if abortErr != nil && !errors.Is(abortErr, os.ErrProcessDone) {
		errMsg := fmt.Sprintf("Failed to stop FFmpeg process: %v", abortErr)
		log.Printf("ERROR [job %s]: %s", id, errMsg)
		h.Store.UpdateStatusWithError(id, "Abort requested, but process termination failed: "+abortErr.Error())
		h.sendErrorResponse(w, errMsg, http.StatusInternalServerError)
		return
	}

	h.Store.UpdateStatusWithError(id, "Conversion aborted by user")
	log.Printf("INFO [job %s]: Conversion abort request processed successfully", id)

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

	activeJobs := h.Store.GetActiveConversionsInfo()

	h.sendJSONResponse(w, activeJobs, http.StatusOK)
}

// ConfigHandler returns relevant configuration values to the client.
func (h *Handler) ConfigHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		h.sendErrorResponse(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

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
		log.Printf("Error encoding JSON response: %v", err)
	}
}

// sendErrorResponse sends a standardized JSON error response.
func (h *Handler) sendErrorResponse(w http.ResponseWriter, errMsg string, statusCode int) {
	response := models.ConversionResponse{
		Success: false,
		Error:   errMsg,
	}
	// Log the error being sent to the client
	log.Printf("WARN: Sending error response (status %d): %s", statusCode, errMsg)
	h.sendJSONResponse(w, response, statusCode)
}
