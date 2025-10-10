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

	"github.com/gatanasi/video-converter/internal/constants"
	"github.com/gatanasi/video-converter/internal/conversion"
	"github.com/gatanasi/video-converter/internal/drive"
	"github.com/gatanasi/video-converter/internal/filestore"
	"github.com/gatanasi/video-converter/internal/models"
	"github.com/gatanasi/video-converter/internal/utils"
	"github.com/google/uuid"
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
	mux.HandleFunc(RouteConfig, h.ConfigHandler)
	mux.HandleFunc(RouteListDriveVideos, h.ListDriveVideosHandler)
	mux.HandleFunc(RouteConvertFromDrive, h.ConvertFromDriveHandler)
	mux.HandleFunc(RouteConvertUpload, h.UploadConvertHandler)
	mux.HandleFunc(RouteActiveConversions, h.ActiveConversionsHandler)
	mux.HandleFunc(RouteActiveConversionsStream, h.ActiveConversionsStreamHandler)
	mux.HandleFunc(RouteConversionStatus, h.StatusHandler)
	mux.HandleFunc(RouteConversionAbort, h.AbortConversionHandler)
	mux.HandleFunc(RouteListFiles, h.ListFilesHandler)
	mux.HandleFunc(RouteDeleteFile, h.DeleteFileHandler)
	mux.HandleFunc(RouteDownload, h.DownloadHandler)

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

// isPathWithinBase checks if the targetPath is safely within the baseDir.
// It resolves both paths to absolute paths for comparison.
func isPathWithinBase(baseDir, targetPath string) (bool, error) {
	absBaseDir, err := filepath.Abs(baseDir)
	if err != nil {
		log.Printf("CRITICAL: Could not determine absolute path for base directory '%s': %v", baseDir, err)
		return false, fmt.Errorf("internal server configuration error (base dir)")
	}

	absTargetPath, err := filepath.Abs(targetPath)
	if err != nil {
		// Don't log targetPath directly here if it might be malicious
		log.Printf("WARN: Could not determine absolute path for target path during validation: %v", err)
		return false, fmt.Errorf("invalid target path generated")
	}

	// Check if the absolute target path starts with the absolute base directory path followed by a separator,
	// or if the path is exactly the base directory (less likely for files but included for completeness).
	if !strings.HasPrefix(absTargetPath, absBaseDir+string(os.PathSeparator)) && absTargetPath != absBaseDir {
		log.Printf("WARN: Security check failed: Path '%s' is outside of base directory '%s'.", absTargetPath, absBaseDir)
		return false, nil // Path is outside, but not necessarily an error state, just fails the check.
	}

	return true, nil
}

func resolveAndValidateSubPath(baseDirConfig string, relativeSubPath string) (string, error) {
	// Resolve base directory
	absBaseDir, err := filepath.Abs(baseDirConfig)
	if err != nil {
		log.Printf("CRITICAL: Could not determine absolute path for base directory '%s': %v", baseDirConfig, err)
		// Use a generic error message to avoid leaking internal paths
		return "", fmt.Errorf("internal server configuration error (base dir)")
	}

	// Clean and resolve the full path for the subpath
	cleanSubPath := filepath.Clean(relativeSubPath)
	absSubPath, err := filepath.Abs(filepath.Join(absBaseDir, cleanSubPath))
	if err != nil {
		log.Printf("WARN: Could not determine absolute path for subpath '%s' within base '%s': %v", relativeSubPath, baseDirConfig, err)
		return "", fmt.Errorf("invalid file path generated")
	}

	// Ensure the resolved path is within the base directory
	if !strings.HasPrefix(absSubPath, absBaseDir) {
		log.Printf("SECURITY: Path traversal attempt detected. Subpath: '%s', Base: '%s'", relativeSubPath, baseDirConfig)
		return "", fmt.Errorf("invalid file path: access outside allowed directory")
	}
	// Security check: Ensure the final path is strictly within the intended base directory.
	// Check if the path starts with the base directory followed by a path separator,
	// or if the path is exactly the base directory (for cases where relativeSubPath might be "." or empty, though handled elsewhere).
	relPath, err := filepath.Rel(absBaseDir, absSubPath)
	if err != nil || strings.HasPrefix(relPath, "..") || filepath.IsAbs(relPath) {
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
	// Use only the first 3 chars of UUID for the output filename
	shortID := conversionID[:3]
	outputFileName := fmt.Sprintf("%s-%s.%s", fileNameWithoutExt, shortID, targetFormat)

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

// validateFileSafety performs security validations for file operations:
// 1. Checks if the path is within the allowed base directory
// 2. Ensures the path exists and is a regular file (not a directory or symlink)
// Returns the file info if validation passes, along with an error explaining any failure
func (h *Handler) validateFileSafety(baseDir, filePath, operationContext string) (os.FileInfo, error) {
	// 1. First verify the path is within the allowed directory
	validPath, validationErr := isPathWithinBase(baseDir, filePath)
	if validationErr != nil {
		log.Printf("SECURITY [%s]: Validation error for file operation - %s: %v",
			operationContext, filePath, validationErr)
		return nil, fmt.Errorf("internal server error")
	}

	if !validPath {
		log.Printf("SECURITY [%s]: Rejected file operation - path outside allowed directory: %s",
			operationContext, filePath)
		return nil, fmt.Errorf("invalid file path")
	}

	// 2. Check that the path exists and is a regular file (not a symlink or directory)
	fileInfo, err := os.Lstat(filePath) // Lstat doesn't follow symlinks
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("file not found")
		}
		log.Printf("ERROR [%s]: Cannot stat file for operation - %s: %v",
			operationContext, filePath, err)
		return nil, fmt.Errorf("error accessing file")
	}

	// Ensure it's a regular file
	if !fileInfo.Mode().IsRegular() {
		log.Printf("SECURITY [%s]: Rejected file operation - not a regular file: %s",
			operationContext, filePath)
		return nil, fmt.Errorf("invalid file type")
	}

	return fileInfo, nil
}

// safeRemoveFile safely removes a file after performing security validations
// Returns true if removal was successful or the file didn't exist, false otherwise
func (h *Handler) safeRemoveFile(baseDir, filePath, operationContext string) bool {
	_, err := h.validateFileSafety(baseDir, filePath, operationContext)
	if err != nil {
		if err.Error() == "file not found" {
			// File doesn't exist anyway, so removal is "successful"
			return true
		}
		// All other validation errors indicate failure
		return false
	}

	// All validations passed, proceed with removal
	if err := os.Remove(filePath); err != nil {
		log.Printf("ERROR [%s]: Failed to remove file %s: %v",
			operationContext, filePath, err)
		return false
	}

	return true
}

// safeAccessFile validates a file for safe download
// Returns the file info if the file is safe to access, or an error if not
func (h *Handler) safeAccessFile(baseDir, filePath, operationContext string) (os.FileInfo, error) {
	// Simply delegate to the common validation function - it already does everything we need
	return h.validateFileSafety(baseDir, filePath, operationContext)
}

func (h *Handler) ConvertFromDriveHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		h.sendErrorResponse(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var request models.DriveConversionRequest
	r.Body = http.MaxBytesReader(w, r.Body, constants.MaxJSONRequestSize)
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

	validFormats := map[string]bool{"mov": true, "mp4": true}
	if !validFormats[request.TargetFormat] {
		h.sendErrorResponse(w, "Invalid target format specified", http.StatusBadRequest)
		return
	}

	qualitySetting := conversion.ResolveQualitySetting(request.Quality)
	if request.Quality != "" && !conversion.IsValidQualityName(request.Quality) {
		log.Printf("WARN: Unknown quality '%s' requested, defaulting to '%s'", request.Quality, qualitySetting.Name)
	}

	sanitizedBaseName := filestore.SanitizeFilename(request.FileName)
	if sanitizedBaseName == "" {
		sanitizedBaseName = fmt.Sprintf("gdrive-video-%s", request.FileID) // Fallback
	}

	// Generate a unique Conversion ID using UUID
	conversionID := uuid.NewString()

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
		Quality:    qualitySetting.Name,
		Progress:   0,
		Complete:   false,
	}
	h.Store.SetStatus(conversionID, status)

	log.Printf("Starting download for job %s (File ID: %s) to %s", conversionID, request.FileID, uploadedFilePath)
	if err := drive.DownloadFile(request.FileID, h.Config.GoogleDriveAPIKey, uploadedFilePath, h.Config.MaxFileSize); err != nil {
		errMsg := fmt.Sprintf("Failed to download file from Google Drive: %v", err)
		log.Printf("ERROR [job %s]: %s", conversionID, errMsg)
		genericErrMsg := "Failed to download file from Google Drive"
		h.Store.UpdateStatusWithError(conversionID, genericErrMsg)

		// Replace the vulnerable path removal with our safe version
		h.safeRemoveFile(h.Config.UploadsDir, uploadedFilePath, fmt.Sprintf("job %s", conversionID))

		h.sendErrorResponse(w, genericErrMsg, http.StatusInternalServerError)
		return
	}
	log.Printf("Download complete for job %s", conversionID)

	job := models.ConversionJob{
		ConversionID:     conversionID,
		FileID:           request.FileID,
		FileName:         request.FileName,
		TargetFormat:     request.TargetFormat,
		Quality:          qualitySetting.Name,
		VideoPreset:      qualitySetting.Preset,
		VideoCRF:         qualitySetting.CRF,
		UploadedFilePath: uploadedFilePath,
		OutputFilePath:   outputFilePath,
		Status:           status,
		ReverseVideo:     request.ReverseVideo,
		RemoveSound:      request.RemoveSound,
	}

	if err := h.Converter.QueueJob(job); err != nil {
		log.Printf("ERROR [job %s]: Failed to queue job: %v", conversionID, err)
		h.Store.DeleteStatus(conversionID)

		// Replace with safe removal
		h.safeRemoveFile(h.Config.UploadsDir, uploadedFilePath, fmt.Sprintf("job %s", conversionID))

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
	maxUploadSize := h.Config.MaxFileSize + constants.UploadSizeBuffer
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize)

	// Parse the multipart form data
	// Use a reasonable limit for memory usage during parsing (e.g., 32MB)
	if err := r.ParseMultipartForm(constants.MultipartMemoryLimit); err != nil {
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
	qualityStr := r.FormValue("quality")

	if targetFormat == "" {
		h.sendErrorResponse(w, "Missing required field: targetFormat", http.StatusBadRequest)
		return
	}
	validFormats := map[string]bool{"mov": true, "mp4": true}
	if !validFormats[targetFormat] {
		h.sendErrorResponse(w, "Invalid target format specified", http.StatusBadRequest)
		return
	}

	reverseVideo := reverseVideoStr == "true"
	removeSound := removeSoundStr == "true"
	qualitySetting := conversion.ResolveQualitySetting(qualityStr)
	if qualityStr != "" && !conversion.IsValidQualityName(qualityStr) {
		log.Printf("WARN: Unknown quality '%s' requested via upload, defaulting to '%s'", qualityStr, qualitySetting.Name)
	}

	// --- Prepare file paths and job details ---
	originalFileName := filepath.Base(handler.Filename)
	sanitizedBaseName := filestore.SanitizeFilename(originalFileName)
	// Generate a unique Conversion ID using UUID
	conversionID := uuid.NewString()
	if sanitizedBaseName == "" {
		// Use the generated conversionID for a unique fallback name
		sanitizedBaseName = fmt.Sprintf("upload-%s", conversionID)
		log.Printf("WARN: Sanitized filename was empty for original '%s', using fallback: %s", originalFileName, sanitizedBaseName)
	}

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
		// Replace with safe file removal
		h.safeRemoveFile(h.Config.UploadsDir, uploadedFilePath, fmt.Sprintf("job %s", conversionID))

		errMsg := fmt.Sprintf("Failed to save uploaded file: %v", err)
		log.Printf("ERROR [job %s]: %s", conversionID, errMsg)
		h.sendErrorResponse(w, errMsg, http.StatusInternalServerError)
		return
	}

	// Check if the limit was hit during copy
	if limitedReader.N <= 0 {
		// Clean up oversized file
		// Replace with safe file removal
		h.safeRemoveFile(h.Config.UploadsDir, uploadedFilePath, fmt.Sprintf("job %s", conversionID))

		h.sendErrorResponse(w, fmt.Sprintf("Upload failed: File exceeds maximum allowed size (%d MB)", h.Config.MaxFileSize/(1024*1024)), http.StatusRequestEntityTooLarge)
		return
	}
	log.Printf("Successfully saved %s for job %s from upload %s", utils.FormatBytesToMB(written), conversionID, originalFileName)

	// --- Queue the conversion job ---
	status := &models.ConversionStatus{
		InputPath:  uploadedFilePath,
		OutputPath: outputFilePath,
		Format:     targetFormat,
		Quality:    qualitySetting.Name,
		Progress:   0,
		Complete:   false,
	}
	h.Store.SetStatus(conversionID, status)

	job := models.ConversionJob{
		ConversionID:     conversionID,
		FileID:           "",               // No Drive File ID for uploads
		FileName:         originalFileName, // Store original uploaded name
		TargetFormat:     targetFormat,
		Quality:          qualitySetting.Name,
		VideoPreset:      qualitySetting.Preset,
		VideoCRF:         qualitySetting.CRF,
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
		// Replace with safe file removal
		h.safeRemoveFile(h.Config.UploadsDir, uploadedFilePath, fmt.Sprintf("job %s", conversionID))

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
	id := strings.TrimPrefix(r.URL.Path, RouteConversionStatus)
	if id == "" {
		h.sendErrorResponse(w, "Conversion ID not specified", http.StatusBadRequest)
		return
	}

	status, exists := h.Store.GetStatus(id)
	if !exists {
		h.sendErrorResponse(w, "Conversion not found or expired", http.StatusNotFound)
		return
	}

	response := buildStatusResponse(id, status)

	h.sendJSONResponse(w, response, http.StatusOK)
}

// DownloadHandler serves the converted file.
func (h *Handler) DownloadHandler(w http.ResponseWriter, r *http.Request) {
	filePath, filename, err := h.resolveAndValidateConvertedFilePath(r, RouteDownload)
	if err != nil {
		if err.Error() == "internal server configuration error" {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		} else {
			http.Error(w, err.Error(), http.StatusBadRequest)
		}
		return
	}

	fileInfo, err := h.safeAccessFile(h.Config.ConvertedDir, filePath, fmt.Sprintf("download %s", filename))
	if err != nil {
		// Handle different error types with appropriate status codes
		switch err.Error() {
		case "file not found":
			log.Printf("WARN: Requested download file not found: %s", filePath)
			http.Error(w, "File not found", http.StatusNotFound)
		case "invalid file path", "invalid file type":
			log.Printf("WARN: Invalid file requested for download: %s", filePath)
			http.Error(w, "Invalid file request", http.StatusBadRequest)
		default:
			log.Printf("ERROR: Error stating download file %s: %v", filePath, err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
		}
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
				URL:     fmt.Sprintf("%s%s", RouteDownload, entry.Name()),
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

	filePath, filename, err := h.resolveAndValidateConvertedFilePath(r, RouteDeleteFile)
	if err != nil {
		if err.Error() == "internal server configuration error" {
			h.sendErrorResponse(w, err.Error(), http.StatusInternalServerError)
			return
		} else {
			h.sendErrorResponse(w, err.Error(), http.StatusBadRequest)
			return
		}
	}

	// Replace direct os.Remove with safe version
	if !h.safeRemoveFile(h.Config.ConvertedDir, filePath, fmt.Sprintf("delete %s", filename)) {
		h.sendErrorResponse(w, "Failed to delete file", http.StatusInternalServerError)
		return
	}

	log.Printf("Deleted file: %s", filePath)
	h.sendJSONResponse(w, map[string]interface{}{"success": true, "message": fmt.Sprintf("File '%s' deleted successfully", filename)}, http.StatusOK)
}

// AbortConversionHandler handles requests to abort a conversion job.
func (h *Handler) AbortConversionHandler(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, RouteConversionAbort)
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

// ActiveConversionsStreamHandler streams conversion updates to clients via Server-Sent Events (SSE).
func (h *Handler) ActiveConversionsStreamHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		h.sendErrorResponse(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		h.sendErrorResponse(w, "Streaming unsupported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	events := h.Store.Subscribe()
	defer h.Store.Unsubscribe(events)

	ctx := r.Context()

	initialStatuses := h.Store.GetAllStatuses()
	for id, status := range initialStatuses {
		if status.Complete {
			continue
		}

		response := buildStatusResponse(id, status)
		event := conversion.StoreEvent{
			Type:         "status",
			ConversionID: id,
			Status:       &response,
		}
		if err := writeSSEEvent(w, flusher, event.Type, event); err != nil {
			log.Printf("WARN: Failed to send initial SSE status for %s: %v", id, err)
			return
		}
	}

	heartbeat := time.NewTicker(constants.SSEHeartbeatInterval)
	defer heartbeat.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case event, ok := <-events:
			if !ok {
				return
			}
			if err := writeSSEEvent(w, flusher, event.Type, event); err != nil {
				log.Printf("WARN: SSE send error for conversion %s: %v", event.ConversionID, err)
				return
			}
		case <-heartbeat.C:
			if err := writeSSEHeartbeat(w, flusher); err != nil {
				log.Printf("WARN: SSE heartbeat failed: %v", err)
				return
			}
		}
	}
}

func writeSSEEvent(w http.ResponseWriter, flusher http.Flusher, eventType string, payload interface{}) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	if eventType != "" {
		if _, err := fmt.Fprintf(w, "event: %s\n", eventType); err != nil {
			return err
		}
	}
	if _, err := fmt.Fprintf(w, "data: %s\n\n", data); err != nil {
		return err
	}

	flusher.Flush()
	return nil
}

func writeSSEHeartbeat(w http.ResponseWriter, flusher http.Flusher) error {
	if _, err := w.Write([]byte(": keep-alive\n\n")); err != nil {
		return err
	}
	flusher.Flush()
	return nil
}

func buildStatusResponse(id string, status models.ConversionStatus) models.ConversionStatusResponse {
	response := models.ConversionStatusResponse{
		ID:       id,
		FileName: filepath.Base(status.OutputPath),
		Progress: status.Progress,
		Complete: status.Complete,
		Error:    status.Error,
		Format:   status.Format,
		Quality:  status.Quality,
	}

	if status.Complete && status.Error == "" && status.OutputPath != "" {
		response.DownloadURL = fmt.Sprintf("%s%s", RouteDownload, filepath.Base(status.OutputPath))
	}

	return response
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
