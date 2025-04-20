package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
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
	// API Routes
	mux.HandleFunc("/api/config", h.ConfigHandler)
	mux.HandleFunc("/api/videos/drive", h.ListDriveVideosHandler)
	mux.HandleFunc("/api/convert/drive", h.ConvertFromDriveHandler)
	mux.HandleFunc("/api/convert/upload", h.UploadConvertHandler)
	mux.HandleFunc("/api/conversions/active", h.ActiveConversionsHandler)
	mux.HandleFunc("/api/conversion/status/", h.StatusHandler)
	mux.HandleFunc("/api/conversion/abort/", h.AbortConversionHandler)
	mux.HandleFunc("/api/files", h.ListFilesHandler)
	mux.HandleFunc("/api/file/delete/", h.DeleteFileHandler)
	mux.HandleFunc("/download/", h.DownloadHandler)

	// --- Static File Serving ---
	staticDir := "static"
	if _, err := os.Stat(staticDir); os.IsNotExist(err) {
		log.Printf("WARN: Static file directory '%s' not found. Frontend assets will not be served.", staticDir)
		// Handle root path minimally if static dir is missing
		mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			// Only handle exact root path if static dir is missing and it's not an API call
			if r.URL.Path == "/" {
				http.NotFound(w, r)
			} else {
				http.NotFound(w, r)
			}
		})
		return
	} else {
		log.Printf("Serving static files and index.html from: %s", staticDir)
	}

	// Serve static files and the main index.html using a single handler for non-API routes
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// Basic check to prevent serving API/download routes via this handler
		if strings.HasPrefix(r.URL.Path, "/api/") || strings.HasPrefix(r.URL.Path, "/download/") {
			http.NotFound(w, r) // Let the more specific handlers deal with these
			return
		}

		// Prevent path traversal
		if strings.Contains(r.URL.Path, "..") {
			http.Error(w, "Invalid path", http.StatusBadRequest)
			return
		}

		// Determine the target file path relative to staticDir
		requestedPath := r.URL.Path
		if requestedPath == "/" {
			requestedPath = "index.html" // Serve index.html for the root
		} else {
			// Remove leading slash for joining with staticDir
			requestedPath = strings.TrimPrefix(requestedPath, "/")
		}
		filePath := filepath.Join(staticDir, requestedPath)

		// Check if the file exists
		fileInfo, err := os.Stat(filePath)
		if err != nil {
			if os.IsNotExist(err) {
				// File doesn't exist, assume client-side routing and serve index.html
				// Avoid logging for every potential client-side route
				// log.Printf("Static file %s not found, serving index.html for client-side routing", filePath)
				indexPath := filepath.Join(staticDir, "index.html")
				http.ServeFile(w, r, indexPath)
			} else {
				// Other error (e.g., permission denied)
				log.Printf("ERROR: Error accessing static file %s: %v", filePath, err)
				http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			}
			return
		}

		// Check if it's a directory
		if fileInfo.IsDir() {
			// Don't serve directories, serve index.html instead (or 404/403 if preferred)
			indexPath := filepath.Join(staticDir, "index.html")
			http.ServeFile(w, r, indexPath)
			return
		}

		// File exists and is not a directory, serve it
		// http.ServeFile automatically sets Content-Type based on extension
		http.ServeFile(w, r, filePath)
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

func resolveAndValidateSubPath(baseDirConfig string, relativeSubPath string) (string, error) {
	// Resolve base directory
	absBaseDir, err := filepath.Abs(baseDirConfig)
	if err != nil {
		log.Printf("CRITICAL: Could not determine absolute path for base directory '%s': %v", baseDirConfig, err)
		// Use a generic error message to avoid leaking internal paths
		return "", fmt.Errorf("internal server configuration error (base dir)")
	}

	// Resolve the full path for the subpath
	// Note: We join baseDirConfig (potentially relative) with relativeSubPath first,
	// then resolve the absolute path. This handles cases where baseDirConfig might be like "."
	absSubPath, err := filepath.Abs(filepath.Join(baseDirConfig, relativeSubPath))
	if err != nil {
		log.Printf("WARN: Could not determine absolute path for subpath '%s' within base '%s': %v", relativeSubPath, baseDirConfig, err)
		return "", fmt.Errorf("invalid file path generated")
	}

	// Security check: Ensure the final path is strictly within the intended base directory.
	// Check if the path starts with the base directory followed by a path separator,
	// or if the path is exactly the base directory (for cases where relativeSubPath might be "." or empty, though handled elsewhere).
	if !strings.HasPrefix(absSubPath, absBaseDir+string(os.PathSeparator)) && absSubPath != absBaseDir {
		log.Printf("WARN: Invalid path detected (outside designated directory): Subpath='%s', Resolved='%s', BaseDir='%s'.",
			relativeSubPath, absSubPath, absBaseDir)
		return "", fmt.Errorf("invalid file path generated (security check failed)")
	}

	return absSubPath, nil
}

func (h *Handler) resolveAndValidatePaths(baseFileName, targetFormat, conversionID string) (absInputPath, absOutputPath string, err error) {
	// Generate relative filenames using conversionID for uniqueness
	fileNameWithoutExt := strings.TrimSuffix(baseFileName, filepath.Ext(baseFileName))
	inputFileName := fmt.Sprintf("%s-%s", conversionID, baseFileName)
	outputFileName := fmt.Sprintf("%s-%s.%s", fileNameWithoutExt, conversionID, targetFormat)

	// Resolve and validate input path
	absInputPath, err = resolveAndValidateSubPath(h.Config.UploadsDir, inputFileName)
	if err != nil {
		log.Printf("WARN: Input path validation failed for '%s': %v", inputFileName, err)
		return "", "", fmt.Errorf("invalid input file path generated: %w", err)
	}

	// Resolve and validate output path
	absOutputPath, err = resolveAndValidateSubPath(h.Config.ConvertedDir, outputFileName)
	if err != nil {
		log.Printf("WARN: Output path validation failed for '%s': %v", outputFileName, err)
		return "", "", fmt.Errorf("invalid output file path generated: %w", err)
	}

	return absInputPath, absOutputPath, nil
}

func (h *Handler) resolveAndValidateConvertedFilePath(r *http.Request, urlPrefix string) (absFilePath, filename string, err error) {
	filename = strings.TrimPrefix(r.URL.Path, urlPrefix)
	// Basic filename validation (prevent directory traversal, empty names, etc.)
	if filename == "" || strings.Contains(filename, "..") || strings.ContainsAny(filename, "/\\") {
		log.Printf("WARN: Invalid filename requested via URL %s: %s", r.URL.Path, filename)
		return "", "", fmt.Errorf("invalid filename")
	}

	// Resolve and validate the path using the helper
	absFilePath, err = resolveAndValidateSubPath(h.Config.ConvertedDir, filename)
	if err != nil {
		log.Printf("WARN: Converted file path validation failed for filename '%s' from URL '%s': %v", filename, r.URL.Path, err)
		// Map the generic helper error to a more context-specific one for the user.
		if strings.Contains(err.Error(), "security check failed") || strings.Contains(err.Error(), "invalid file path generated") {
			return "", "", fmt.Errorf("invalid filename")
		}
		if strings.Contains(err.Error(), "internal server configuration error") {
			return "", "", fmt.Errorf("internal server configuration error")
		}
		return "", "", fmt.Errorf("failed to validate file path: %w", err)
	}

	return absFilePath, filename, nil
}

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

	timestamp := time.Now().Unix()
	conversionID := strconv.FormatInt(timestamp, 10)
	// --- Resolve and Validate Paths ---
	uploadedFilePath, outputFilePath, err := h.resolveAndValidatePaths(sanitizedBaseName, request.TargetFormat, conversionID)
	if err != nil {
		h.sendErrorResponse(w, err.Error(), http.StatusBadRequest)
		return
	}
	// --- End Path Resolution ---

	status := &models.ConversionStatus{
		InputPath:  uploadedFilePath,
		OutputPath: outputFilePath,
		Format:     request.TargetFormat,
		Progress:   0,
		Complete:   false,
	}
	h.Store.SetStatus(conversionID, status)

	log.Printf("Starting download for job %s (File ID: %s) to %s", conversionID, request.FileID, uploadedFilePath)
	if err := drive.DownloadFile(request.FileID, h.Config.GoogleDriveAPIKey, uploadedFilePath, h.Config.MaxFileSize); err != nil {
		errMsg := fmt.Sprintf("Failed to download file from Google Drive: %v", err)
		log.Printf("ERROR [job %s]: %s", conversionID, errMsg)
		h.Store.UpdateStatusWithError(conversionID, errMsg)

		if removeErr := os.Remove(uploadedFilePath); removeErr != nil && !os.IsNotExist(removeErr) {
			log.Printf("WARN [job %s]: Failed to remove uploaded file %s after download error: %v", conversionID, uploadedFilePath, removeErr)
		}
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

// UploadConvertHandler handles requests to upload a video file and convert it.
func (h *Handler) UploadConvertHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		h.sendErrorResponse(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Set max upload size using MaxFileSize from config (ensure it's reasonable for uploads)
	// Add a buffer for other form fields
	maxUploadSize := h.Config.MaxFileSize + (1 * 1024 * 1024) // Add 1MB buffer
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize)

	// Parse the multipart form data
	// Use a reasonable limit for memory usage during parsing (e.g., 32MB)
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		if errors.Is(err, http.ErrMissingBoundary) {
			h.sendErrorResponse(w, "Invalid request: Missing multipart boundary", http.StatusBadRequest)
		} else if errors.Is(err, http.ErrNotMultipart) {
			h.sendErrorResponse(w, "Invalid request: Not a multipart request", http.StatusBadRequest)
		} else if strings.Contains(err.Error(), "request body too large") {
			h.sendErrorResponse(w, fmt.Sprintf("Upload failed: File exceeds maximum allowed size (%d MB)", h.Config.MaxFileSize/(1024*1024)), http.StatusRequestEntityTooLarge)
		} else {
			errMsg := fmt.Sprintf("Failed to parse multipart form: %v", err)
			log.Printf("WARN: %s", errMsg)
			h.sendErrorResponse(w, errMsg, http.StatusBadRequest)
		}
		return
	}
	defer func() {
		if err := r.MultipartForm.RemoveAll(); err != nil {
			log.Printf("WARN: Error removing multipart temp files: %v", err)
		}
	}()

	// Get the file from the form
	file, handler, err := r.FormFile("videoFile")
	if err != nil {
		if errors.Is(err, http.ErrMissingFile) {
			h.sendErrorResponse(w, "Missing 'videoFile' part in form data", http.StatusBadRequest)
		} else {
			errMsg := fmt.Sprintf("Failed to get file from form: %v", err)
			log.Printf("WARN: %s", errMsg)
			h.sendErrorResponse(w, errMsg, http.StatusBadRequest)
		}
		return
	}
	defer func() {
		if closeErr := file.Close(); closeErr != nil {
			log.Printf("WARN: Error closing uploaded file handle: %v", closeErr)
		}
	}()

	// Get conversion options from form values
	targetFormat := r.FormValue("targetFormat")
	reverseVideoStr := r.FormValue("reverseVideo")
	removeSoundStr := r.FormValue("removeSound")

	if targetFormat == "" {
		h.sendErrorResponse(w, "Missing required field: targetFormat", http.StatusBadRequest)
		return
	}
	validFormats := map[string]bool{"mov": true, "mp4": true, "avi": true}
	if !validFormats[targetFormat] {
		h.sendErrorResponse(w, "Invalid target format specified", http.StatusBadRequest)
		return
	}

	reverseVideo := reverseVideoStr == "true"
	removeSound := removeSoundStr == "true"

	// --- Prepare file paths and job details ---
	originalFileName := handler.Filename
	sanitizedBaseName := filestore.SanitizeFilename(originalFileName)
	if sanitizedBaseName == "" {
		sanitizedBaseName = fmt.Sprintf("upload-%d", time.Now().Unix()) // Fallback with shorter timestamp
	}
	timestamp := time.Now().Unix()
	conversionID := strconv.FormatInt(timestamp, 10)

	// --- Resolve and Validate Paths ---
	uploadedFilePath, outputFilePath, err := h.resolveAndValidatePaths(sanitizedBaseName, targetFormat, conversionID)
	if err != nil {
		h.sendErrorResponse(w, err.Error(), http.StatusBadRequest)
		return
	}
	// --- End Path Resolution ---

	// --- Save the uploaded file ---
	log.Printf("Saving uploaded file for job %s: %s -> %s", conversionID, originalFileName, uploadedFilePath)
	outFile, err := os.Create(uploadedFilePath)
	if err != nil {
		errMsg := fmt.Sprintf("Failed to create file for saving upload: %v", err)
		log.Printf("ERROR [job %s]: %s", conversionID, errMsg)
		h.sendErrorResponse(w, errMsg, http.StatusInternalServerError)
		return
	}
	defer func() {
		if closeErr := outFile.Close(); closeErr != nil {
			log.Printf("WARN [job %s]: Error closing saved upload file %s: %v", conversionID, uploadedFilePath, closeErr)
		}
	}()

	// Copy the file content, respecting MaxFileSize again just in case
	limitedReader := &io.LimitedReader{R: file, N: h.Config.MaxFileSize + 1}
	written, err := io.Copy(outFile, limitedReader)
	if err != nil {
		// Clean up partially written file
		if removeErr := os.Remove(uploadedFilePath); removeErr != nil && !os.IsNotExist(removeErr) {
			log.Printf("WARN [job %s]: Failed to remove partially written upload file %s: %v", conversionID, uploadedFilePath, removeErr)
		}
		errMsg := fmt.Sprintf("Failed to save uploaded file: %v", err)
		log.Printf("ERROR [job %s]: %s", conversionID, errMsg)
		h.sendErrorResponse(w, errMsg, http.StatusInternalServerError)
		return
	}

	// Check if the limit was hit during copy
	if limitedReader.N <= 0 {
		// Clean up oversized file
		if removeErr := os.Remove(uploadedFilePath); removeErr != nil && !os.IsNotExist(removeErr) {
			log.Printf("WARN [job %s]: Failed to remove oversized upload file %s: %v", conversionID, uploadedFilePath, removeErr)
		}
		h.sendErrorResponse(w, fmt.Sprintf("Upload failed: File exceeds maximum allowed size (%d MB)", h.Config.MaxFileSize/(1024*1024)), http.StatusRequestEntityTooLarge)
		return
	}
	log.Printf("Successfully saved %d bytes for job %s from upload %s", written, conversionID, originalFileName)

	// --- Queue the conversion job ---
	status := &models.ConversionStatus{
		InputPath:  uploadedFilePath,
		OutputPath: outputFilePath,
		Format:     targetFormat,
		Progress:   0,
		Complete:   false,
	}
	h.Store.SetStatus(conversionID, status)

	job := models.ConversionJob{
		ConversionID:     conversionID,
		FileID:           "",               // No Drive File ID for uploads
		FileName:         originalFileName, // Store original uploaded name
		TargetFormat:     targetFormat,
		UploadedFilePath: uploadedFilePath,
		OutputFilePath:   outputFilePath,
		Status:           status,
		ReverseVideo:     reverseVideo,
		RemoveSound:      removeSound,
	}

	if err := h.Converter.QueueJob(job); err != nil {
		log.Printf("ERROR [job %s]: Failed to queue upload job: %v", conversionID, err)
		h.Store.DeleteStatus(conversionID)
		// Attempt to remove the saved uploaded file
		if removeErr := os.Remove(uploadedFilePath); removeErr != nil {
			log.Printf("WARN [job %s]: Failed to remove saved upload file %s after queue failure: %v", conversionID, uploadedFilePath, removeErr)
		}
		h.sendErrorResponse(w, "Server busy, conversion queue is full", http.StatusServiceUnavailable)
		return
	}

	response := models.ConversionResponse{
		Success:      true,
		Message:      "Upload successful, conversion job queued",
		ConversionID: conversionID,
	}
	h.sendJSONResponse(w, response, http.StatusAccepted)
}

// StatusHandler returns the status of a conversion job.
func (h *Handler) StatusHandler(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/conversion/status/")
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
	filePath, filename, err := h.resolveAndValidateConvertedFilePath(r, "/download/")
	if err != nil {
		if err.Error() == "internal server configuration error" {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		} else {
			http.Error(w, err.Error(), http.StatusBadRequest)
		}
		return
	}

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
	if r.Method != http.MethodDelete {
		h.sendErrorResponse(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	filePath, filename, err := h.resolveAndValidateConvertedFilePath(r, "/api/file/delete/")
	if err != nil {
		if err.Error() == "internal server configuration error" {
			h.sendErrorResponse(w, err.Error(), http.StatusInternalServerError)
			return
		} else {
			h.sendErrorResponse(w, err.Error(), http.StatusBadRequest)
			return
		}
	}

	err = os.Remove(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			log.Printf("WARN: File not found for deletion: %s", filePath)
			h.sendErrorResponse(w, "File not found", http.StatusNotFound)
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
	id := strings.TrimPrefix(r.URL.Path, "/api/conversion/abort/")
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
