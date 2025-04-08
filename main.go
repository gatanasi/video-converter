package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

// Configuration structure for app settings
type Config struct {
	Port         int
	MaxFileSize  int64
	UploadsDir   string
	ConvertedDir string
}

// Global configuration
var config = Config{
	Port:         3000,
	MaxFileSize:  2000 * 1024 * 1024, // 2GB
	UploadsDir:   "uploads",
	ConvertedDir: "converted",
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

// Request struct for Google Drive conversion
type DriveConversionRequest struct {
	FileID       string `json:"fileId"`
	FileName     string `json:"fileName"`
	MimeType     string `json:"mimeType"`
	TargetFormat string `json:"targetFormat"`
	APIKey       string `json:"apiKey"`
}

// Progress tracking
type ConversionStatus struct {
	InputPath  string
	OutputPath string
	Format     string
	Progress   float64
	Complete   bool
	Error      string
}

var (
	conversions = make(map[string]*ConversionStatus)
	mutex       sync.Mutex
)

func main() {
	// Create required directories
	ensureDirectoryExists(config.UploadsDir)
	ensureDirectoryExists(config.ConvertedDir)

	// Set up HTTP handlers
	http.Handle("/", http.FileServer(http.Dir(".")))
	http.HandleFunc("/convert", convertHandler)
	http.HandleFunc("/convert-from-drive", convertFromDriveHandler)
	http.HandleFunc("/download/", downloadHandler)
	http.HandleFunc("/status/", statusHandler)
	http.HandleFunc("/files", listFilesHandler)      // New handler for listing converted files
	http.HandleFunc("/delete-file/", deleteFileHandler) // New handler for deleting files

	// Start file cleanup routine
	setupFileCleanup()

	// Create a new server with a timeout
	server := &http.Server{
		Addr:         fmt.Sprintf(":%d", config.Port),
		ReadTimeout:  60 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	// Create a channel to listen for OS signals
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	// Start the server in a goroutine
	go func() {
		fmt.Printf("Server is running on http://localhost:%d\n", config.Port)
		fmt.Println("Make sure you have FFmpeg installed and accessible in your PATH")
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Error starting server: %v", err)
		}
	}()

	// Wait for interrupt signal
	<-stop

	// Create a deadline context for shutdown
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Attempt graceful shutdown
	fmt.Println("Server is shutting down...")
	if err := server.Shutdown(ctx); err != nil {
		log.Fatalf("Server shutdown failed: %v", err)
	}
	fmt.Println("Server gracefully stopped")
}

// Helper function to ensure a directory exists
func ensureDirectoryExists(dirPath string) {
	if _, err := os.Stat(dirPath); os.IsNotExist(err) {
		err := os.MkdirAll(dirPath, 0755)
		if err != nil {
			log.Fatalf("Failed to create directory %s: %v", dirPath, err)
		}
	}
}

// Handler for the /convert endpoint (for direct uploads)
func convertHandler(w http.ResponseWriter, r *http.Request) {
	// Set CORS headers
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	// Handle preflight requests
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	// Check method
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Parse multipart form with size limit
	err := r.ParseMultipartForm(config.MaxFileSize)
	if err != nil {
		sendErrorResponse(w, "Failed to parse form", err.Error(), http.StatusBadRequest)
		return
	}

	// Get the uploaded file
	file, header, err := r.FormFile("video")
	if err != nil {
		sendErrorResponse(w, "No video file uploaded", err.Error(), http.StatusBadRequest)
		return
	}
	defer file.Close()

	// Get target format
	format := r.FormValue("format")
	if format == "" {
		sendErrorResponse(w, "No target format specified", "", http.StatusBadRequest)
		return
	}
	
	// Validate format (security: prevent command injection)
	validFormats := map[string]bool{
		"mp4": true,
		"mov": true,
		"avi": true,
	}
	
	if !validFormats[format] {
		sendErrorResponse(w, "Invalid format specified", "", http.StatusBadRequest)
		return
	}

	// Create a unique filename for the uploaded file
	timestamp := time.Now().UnixNano()
	uploadedFileName := fmt.Sprintf("%d-%s", timestamp, header.Filename)
	uploadedFilePath := filepath.Join(config.UploadsDir, uploadedFileName)

	// Create the uploaded file
	uploadedFile, err := os.Create(uploadedFilePath)
	if err != nil {
		sendErrorResponse(w, "Failed to save uploaded file", err.Error(), http.StatusInternalServerError)
		return
	}
	defer uploadedFile.Close()

	// Copy uploaded file contents
	_, err = io.Copy(uploadedFile, file)
	if err != nil {
		sendErrorResponse(w, "Failed to save uploaded file", err.Error(), http.StatusInternalServerError)
		return
	}

	// Create output filename
	fileNameWithoutExt := strings.TrimSuffix(filepath.Base(header.Filename), filepath.Ext(header.Filename))
	outputFileName := fmt.Sprintf("%s-%d.%s", fileNameWithoutExt, timestamp, format)
	outputFilePath := filepath.Join(config.ConvertedDir, outputFileName)

	fmt.Printf("Converting %s to %s (%s)\n", uploadedFilePath, outputFilePath, format)

	// Start conversion in a goroutine
	conversionID := strconv.FormatInt(timestamp, 10)
	go convertVideo(conversionID, uploadedFilePath, outputFilePath, format)

	// Create the response
	downloadURL := fmt.Sprintf("/download/%s", outputFileName)
	response := ConversionResponse{
		Success:     true,
		Message:     "Conversion started",
		DownloadURL: downloadURL,
	}

	// Send response
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

// Handler for the /convert-from-drive endpoint
func convertFromDriveHandler(w http.ResponseWriter, r *http.Request) {
	// Set CORS headers
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	// Handle preflight requests
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	// Check method
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Parse JSON request
	var request DriveConversionRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		sendErrorResponse(w, "Failed to parse request", err.Error(), http.StatusBadRequest)
		return
	}

	// Validate input
	if request.FileID == "" {
		sendErrorResponse(w, "No file ID specified", "", http.StatusBadRequest)
		return
	}

	if request.APIKey == "" {
		sendErrorResponse(w, "No API key specified", "", http.StatusBadRequest)
		return
	}

	// Validate format
	validFormats := map[string]bool{
		"mp4": true,
		"mov": true,
		"avi": true,
	}

	if !validFormats[request.TargetFormat] {
		sendErrorResponse(w, "Invalid format specified", "", http.StatusBadRequest)
		return
	}

	// Generate unique ID and create file paths
	timestamp := time.Now().UnixNano()
	conversionID := strconv.FormatInt(timestamp, 10)

	// Clean filename
	fileName := request.FileName
	if fileName == "" {
		fileName = fmt.Sprintf("gdrive-video-%s", conversionID)
	}
	fileNameWithoutExt := strings.TrimSuffix(fileName, filepath.Ext(fileName))
	
	// Create paths
	uploadedFileName := fmt.Sprintf("%d-%s", timestamp, fileName)
	uploadedFilePath := filepath.Join(config.UploadsDir, uploadedFileName)
	
	outputFileName := fmt.Sprintf("%s-%d.%s", fileNameWithoutExt, timestamp, request.TargetFormat)
	outputFilePath := filepath.Join(config.ConvertedDir, outputFileName)

	// Start the download and conversion in a goroutine
	go func() {
		// Create a status entry
		status := &ConversionStatus{
			InputPath:  uploadedFilePath,
			OutputPath: outputFilePath,
			Format:     request.TargetFormat,
			Progress:   0,
			Complete:   false,
		}

		mutex.Lock()
		conversions[conversionID] = status
		mutex.Unlock()

		// Download the file from Google Drive
		err := downloadFromGoogleDrive(request.FileID, request.APIKey, uploadedFilePath)
		if err != nil {
			reportError(status, fmt.Sprintf("Failed to download from Google Drive: %v", err))
			return
		}

		// Convert the video
		convertVideo(conversionID, uploadedFilePath, outputFilePath, request.TargetFormat)
	}()

	// Create the response
	downloadURL := fmt.Sprintf("/download/%s", outputFileName)
	response := ConversionResponse{
		Success:      true,
		Message:      "Download and conversion started",
		DownloadURL:  downloadURL,
		ConversionID: conversionID,
	}

	// Send response
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

// Download a file from Google Drive
func downloadFromGoogleDrive(fileID, apiKey, destinationPath string) error {
	// Google Drive direct download URL
	url := fmt.Sprintf("https://www.googleapis.com/drive/v3/files/%s?alt=media&key=%s", fileID, apiKey)
	
	// Create HTTP request
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return fmt.Errorf("failed to create request: %v", err)
	}
	
	// Create HTTP client with timeout
	client := &http.Client{
		Timeout: 10 * time.Minute, // 10-minute timeout for large files
	}
	
	// Execute request
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to download file: %v", err)
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("failed to download file, status: %s", resp.Status)
	}
	
	// Create destination file
	out, err := os.Create(destinationPath)
	if err != nil {
		return fmt.Errorf("failed to create output file: %v", err)
	}
	defer out.Close()
	
	// Copy data to file
	_, err = io.Copy(out, resp.Body)
	if err != nil {
		return fmt.Errorf("failed to write file: %v", err)
	}
	
	fmt.Printf("Successfully downloaded Google Drive file to %s\n", destinationPath)
	return nil
}

// Handler for the /download/:filename endpoint
func downloadHandler(w http.ResponseWriter, r *http.Request) {
	// Set CORS headers
	w.Header().Set("Access-Control-Allow-Origin", "*")

	// Extract filename from the URL path
	filename := strings.TrimPrefix(r.URL.Path, "/download/")
	if filename == "" {
		http.Error(w, "Filename not specified", http.StatusBadRequest)
		return
	}

	// Build the file path
	filePath := filepath.Join(config.ConvertedDir, filename)

	// Check if file exists
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}

	// Serve the file for download
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))
	http.ServeFile(w, r, filePath)

	// Note: If we wanted to delete the file after download (like in the Node.js version),
	// we would need to use a middleware or defer the deletion, which is more complex in Go
	// For simplicity, we're keeping the files
}

// Handler for the /status/:id endpoint
func statusHandler(w http.ResponseWriter, r *http.Request) {
	// Set CORS headers
	w.Header().Set("Access-Control-Allow-Origin", "*")

	// Extract conversion ID from the URL path
	id := strings.TrimPrefix(r.URL.Path, "/status/")
	if id == "" {
		http.Error(w, "Conversion ID not specified", http.StatusBadRequest)
		return
	}

	// Retrieve the conversion status
	mutex.Lock()
	status, exists := conversions[id]
	mutex.Unlock()

	if !exists {
		http.Error(w, "Conversion not found", http.StatusNotFound)
		return
	}

	// Create response object
	response := struct {
		ID       string  `json:"id"`
		Progress float64 `json:"progress"`
		Complete bool    `json:"complete"`
		Error    string  `json:"error,omitempty"`
		Format   string  `json:"format"`
	}{
		ID:       id,
		Progress: status.Progress,
		Complete: status.Complete,
		Error:    status.Error,
		Format:   status.Format,
	}

	// Send the status as JSON response
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

// Handler for the /files endpoint
func listFilesHandler(w http.ResponseWriter, r *http.Request) {
	// Set CORS headers
	w.Header().Set("Access-Control-Allow-Origin", "*")

	// List files in the converted directory
	files, err := os.ReadDir(config.ConvertedDir)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to list files: %v", err), http.StatusInternalServerError)
		return
	}

	// Collect file names
	var fileNames []string
	for _, file := range files {
		if !file.IsDir() {
			fileNames = append(fileNames, file.Name())
		}
	}

	// Send response
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(fileNames)
}

// Handler for the /delete-file/:filename endpoint
func deleteFileHandler(w http.ResponseWriter, r *http.Request) {
	// Set CORS headers
	w.Header().Set("Access-Control-Allow-Origin", "*")

	// Extract filename from the URL path
	filename := strings.TrimPrefix(r.URL.Path, "/delete-file/")
	if filename == "" {
		http.Error(w, "Filename not specified", http.StatusBadRequest)
		return
	}

	// Build the file path
	filePath := filepath.Join(config.ConvertedDir, filename)

	// Check if file exists
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}

	// Delete the file
	if err := os.Remove(filePath); err != nil {
		http.Error(w, fmt.Sprintf("Failed to delete file: %v", err), http.StatusInternalServerError)
		return
	}

	// Send response
	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, "File %s deleted successfully", filename)
}

// Function to convert video using FFmpeg
func convertVideo(id, inputPath, outputPath, format string) {
	// Create a new conversion status if it doesn't exist
	mutex.Lock()
	status, exists := conversions[id]
	if !exists {
		status = &ConversionStatus{
			InputPath:  inputPath,
			OutputPath: outputPath,
			Format:     format,
			Progress:   0,
			Complete:   false,
		}
		conversions[id] = status
	}
	mutex.Unlock()

	// Base FFmpeg arguments
	ffmpegArgs := []string{
		"-i", inputPath,
		"-progress", "pipe:1", // Send progress info to stdout
		"-nostats",            // Do not print encoding stats
	}

	// Add format-specific optimizations
	switch format {
	case "mp4":
		// High quality MP4 with H.264 codec
		ffmpegArgs = append(ffmpegArgs,
			"-c:v", "libx264",
			"-preset", "medium",
			"-crf", "23",
			"-c:a", "aac",
			"-b:a", "128k",
		)
	case "mov":
		// MOV with H.264 codec
		ffmpegArgs = append(ffmpegArgs,
			"-c:v", "libx264",
			"-preset", "medium",
			"-crf", "23",
			"-c:a", "aac",
			"-b:a", "192k",
		)
	case "avi":
		// AVI with MPEG-4 codec
		ffmpegArgs = append(ffmpegArgs,
			"-c:v", "mpeg4",
			"-q:v", "6",
			"-c:a", "libmp3lame",
			"-q:a", "4",
		)
	}

	// Add output path as the final argument
	ffmpegArgs = append(ffmpegArgs, outputPath)

	// Log the full ffmpeg command
	ffmpegCmd := fmt.Sprintf("ffmpeg %s", strings.Join(ffmpegArgs, " "))
	fmt.Printf("Executing: %s\n", ffmpegCmd)

	// Prepare FFmpeg command with the assembled arguments
	cmd := exec.Command("ffmpeg", ffmpegArgs...)

	// Create pipes for stdout and stderr
	stderr, err := cmd.StderrPipe()
	if err != nil {
		reportError(status, fmt.Sprintf("Failed to create stderr pipe: %v", err))
		return
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		reportError(status, fmt.Sprintf("Failed to create stdout pipe: %v", err))
		return
	}

	// Start the command
	if err := cmd.Start(); err != nil {
		reportError(status, fmt.Sprintf("Failed to start FFmpeg: %v", err))
		return
	}

	// Process stderr in a goroutine to avoid blocking
	go processFFmpegLogs(stderr)

	// Process stdout to track progress
	processFFmpegProgress(stdout, status)

	// Wait for the command to finish
	if err := cmd.Wait(); err != nil {
		reportError(status, fmt.Sprintf("FFmpeg failed: %v", err))
		return
	}

	// Mark as complete
	mutex.Lock()
	status.Complete = true
	status.Progress = 100.0
	mutex.Unlock()

	fmt.Printf("Conversion complete: %s -> %s\n", inputPath, outputPath)

	// Delete the original uploaded file
	os.Remove(inputPath)
}

// Process FFmpeg progress output
func processFFmpegProgress(stdout io.ReadCloser, status *ConversionStatus) {
	scanner := bufio.NewScanner(stdout)
	
	// Variable to store file duration
	var totalDurationMs int64 = 0
	
	// Read FFmpeg output line by line
	for scanner.Scan() {
		line := scanner.Text()
		
		// Debug progress output
		// fmt.Println("FFmpeg progress:", line)
		
		// Try to extract the total duration if we don't have it yet
		if totalDurationMs == 0 && strings.HasPrefix(line, "Duration:") {
			// Extract duration in format HH:MM:SS.MS
			parts := strings.Split(line, "Duration: ")
			if len(parts) > 1 {
				timeStr := strings.Split(parts[1], ",")[0]
				hours, _ := strconv.ParseInt(timeStr[0:2], 10, 64)
				minutes, _ := strconv.ParseInt(timeStr[3:5], 10, 64)
				seconds, _ := strconv.ParseInt(timeStr[6:8], 10, 64)
				milliseconds, _ := strconv.ParseInt(timeStr[9:], 10, 64) 
				
				totalDurationMs = (hours*3600 + minutes*60 + seconds)*1000 + milliseconds*10
				fmt.Printf("Video duration: %02d:%02d:%02d.%02d (%d ms)\n", 
					hours, minutes, seconds, milliseconds, totalDurationMs)
			}
		}
		
		// Process out_time_ms for progress updates
		if strings.HasPrefix(line, "out_time_ms=") {
			timeStr := strings.TrimPrefix(line, "out_time_ms=")
			currentTimeMs, err := strconv.ParseInt(timeStr, 10, 64)
			
			if err == nil && totalDurationMs > 0 {
				// Calculate progress percentage
				progress := float64(currentTimeMs) / float64(totalDurationMs) * 100
				if progress > 100 {
					progress = 100
				}
				
				// Update the status with the new progress
				mutex.Lock()
				status.Progress = progress
				mutex.Unlock()
				
				// Log progress update (every ~10%)
				if int(progress)%10 == 0 {
					fmt.Printf("Conversion progress: %.2f%% (time: %dms / %dms)\n", 
						progress, currentTimeMs, totalDurationMs)
				}
			}
		}
		
		// Check for frame= output which also indicates progress
		if strings.HasPrefix(line, "frame=") {
			// This is a progress indicator but we're using out_time_ms as primary source
			// However it helps to identify if conversion is actually running
			frameInfo := strings.Fields(line)
			if len(frameInfo) > 1 {
				fmt.Printf("Processing frames: %s\n", line)
			}
		}
	}
	
	// Check for scanner errors
	if err := scanner.Err(); err != nil {
		reportError(status, fmt.Sprintf("Error reading FFmpeg progress: %v", err))
	}
}

// Process FFmpeg log output
func processFFmpegLogs(stderr io.ReadCloser) {
	scanner := bufio.NewScanner(stderr)
	
	// Regular expression to extract duration from FFmpeg output
	durationRegex := regexp.MustCompile(`Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})`)
	
	for scanner.Scan() {
		line := scanner.Text()
		
		// Log errors and important information
		if strings.Contains(line, "Error") {
			fmt.Printf("FFmpeg error: %s\n", line)
		}
		
		// Extract duration information for tracking progress
		if matches := durationRegex.FindStringSubmatch(line); matches != nil && len(matches) >= 4 {
			fmt.Printf("Video duration detected: %s:%s:%s\n", matches[1], matches[2], matches[3])
		}
	}
}

// Report error and update status
func reportError(status *ConversionStatus, errorMsg string) {
	fmt.Println(errorMsg)
	
	mutex.Lock()
	status.Error = errorMsg
	mutex.Unlock()
	
	// Clean up the input file on error
	os.Remove(status.InputPath)
}

// Helper function to send error responses
func sendErrorResponse(w http.ResponseWriter, errMsg, details string, statusCode int) {
	response := ConversionResponse{
		Success: false,
		Error:   errMsg,
		Details: details,
	}
	
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(response)
}

// FileCleanup represents a file for potential cleanup
type FileCleanup struct {
	Path    string
	ModTime time.Time
}

// Setup periodic cleanup of old files
func setupFileCleanup() {
	go func() {
		for {
			// Run cleanup every hour
			time.Sleep(1 * time.Hour)
			cleanupOldFiles()
		}
	}()
}

// Cleanup files older than 24 hours
func cleanupOldFiles() {
	// Max age for files (24 hours)
	maxAge := 24 * time.Hour
	now := time.Now()
	
	// Check both directories
	cleanupDir(config.UploadsDir, maxAge, now)
	cleanupDir(config.ConvertedDir, maxAge, now)
}

// Cleanup files in a specific directory
func cleanupDir(dirPath string, maxAge time.Duration, now time.Time) {
	files, err := os.ReadDir(dirPath)
	if err != nil {
		fmt.Printf("Error reading directory %s: %v\n", dirPath, err)
		return
	}
	
	for _, file := range files {
		if file.IsDir() {
			continue
		}
		
		info, err := file.Info()
		if err != nil {
			continue
		}
		
		// Check if file is older than maxAge
		if now.Sub(info.ModTime()) > maxAge {
			filePath := filepath.Join(dirPath, file.Name())
			err := os.Remove(filePath)
			if err != nil {
				fmt.Printf("Error removing old file %s: %v\n", filePath, err)
			} else {
				fmt.Printf("Removed old file: %s\n", filePath)
			}
		}
	}
}