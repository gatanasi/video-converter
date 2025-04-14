// Package drive provides Google Drive API integration
package drive

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"time"
)

const (
	driveAPIBaseURL = "https://www.googleapis.com/drive/v3/files"
	requestTimeout  = 30 * time.Second
	downloadTimeout = 20 * time.Minute // Longer timeout for potentially large file downloads
)

// DownloadFile downloads a file from Google Drive, respecting size limits.
func DownloadFile(fileID, apiKey, destinationPath string, maxFileSize int64) error {
	log.Printf("Attempting download: File ID %s to %s", fileID, destinationPath)
	downloadURL := fmt.Sprintf("%s/%s?alt=media&key=%s", driveAPIBaseURL, fileID, apiKey)

	req, err := http.NewRequest("GET", downloadURL, nil)
	if err != nil {
		return fmt.Errorf("failed to create download request for file ID %s: %w", fileID, err)
	}

	client := &http.Client{Timeout: downloadTimeout}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("download request failed for file ID %s: %w", fileID, err)
	}
	defer func() {
		if closeErr := resp.Body.Close(); closeErr != nil {
			log.Printf("WARN: Error closing response body for file ID %s download: %v", fileID, closeErr)
		}
	}()

	if resp.StatusCode != http.StatusOK {
		return handleDriveAPIError(resp, fmt.Sprintf("download failed for file ID %s", fileID))
	}

	// Check Content-Length header against max size *before* writing to disk
	contentLength := resp.ContentLength // Can be -1 if unknown
	if contentLength > 0 && contentLength > maxFileSize {
		return fmt.Errorf("file ID %s exceeds maximum size: %d bytes > %d bytes (reported by Content-Length)",
			fileID, contentLength, maxFileSize)
	}

	// Create the destination file
	out, err := os.Create(destinationPath)
	if err != nil {
		return fmt.Errorf("failed to create output file %s: %w", destinationPath, err)
	}
	defer func() {
		if closeErr := out.Close(); closeErr != nil { // Ensure file handle is closed
			log.Printf("WARN: Error closing output file %s for file ID %s: %v", destinationPath, fileID, closeErr)
		}
	}()

	// Use io.LimitedReader to enforce maxFileSize during download, even if Content-Length was wrong/missing
	limitedReader := &io.LimitedReader{R: resp.Body, N: maxFileSize + 1} // Read one extra byte to detect oversize

	written, err := io.Copy(out, limitedReader)
	if err != nil {
		// Clean up partially written file on copy error
		if removeErr := os.Remove(destinationPath); removeErr != nil && !os.IsNotExist(removeErr) {
			log.Printf("WARN: Failed to remove partially written file %s: %v", destinationPath, removeErr)
		}
		return fmt.Errorf("failed to write file %s during download: %w", destinationPath, err)
	}

	// Check if the limit was hit
	if limitedReader.N <= 0 {
		// Clean up oversized file
		if removeErr := os.Remove(destinationPath); removeErr != nil && !os.IsNotExist(removeErr) {
			log.Printf("WARN: Failed to remove oversized file %s: %v", destinationPath, removeErr)
		}
		return fmt.Errorf("file ID %s download exceeded maximum size of %d bytes", fileID, maxFileSize)
	}

	log.Printf("Successfully downloaded %d bytes for file ID %s to %s", written, fileID, destinationPath)
	return nil
}

// ListVideos lists video files within a specific Google Drive folder.
func ListVideos(folderID string, apiKey string) ([]byte, error) {
	queryParams := url.Values{}
	// Query for video mime types within the specified parent folder
	queryParams.Set("q", fmt.Sprintf("'%s' in parents and mimeType contains 'video'", folderID))
	// Request specific fields to minimize response size
	queryParams.Set("fields", "files(id,name,mimeType,modifiedTime,size)")
	queryParams.Set("orderBy", "name") // Order results by name
	queryParams.Set("key", apiKey)

	listURL := driveAPIBaseURL + "?" + queryParams.Encode()

	req, err := http.NewRequest("GET", listURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create list request for folder %s: %w", folderID, err)
	}

	client := &http.Client{Timeout: requestTimeout}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("list request failed for folder %s: %w", folderID, err)
	}
	defer func() {
		if closeErr := resp.Body.Close(); closeErr != nil {
			log.Printf("WARN: Error closing response body for folder %s list: %v", folderID, closeErr)
		}
	}()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read list response body for folder %s: %w", folderID, err)
	}

	if resp.StatusCode != http.StatusOK {
		// Reuse error handling logic, passing the raw body bytes
		return nil, handleDriveAPIErrorResponse(resp.StatusCode, resp.Status, bodyBytes, fmt.Sprintf("list videos failed for folder %s", folderID))
	}

	return bodyBytes, nil
}

// handleDriveAPIError parses Google Drive API error responses.
func handleDriveAPIError(resp *http.Response, contextMsg string) error {
	bodyBytes, _ := io.ReadAll(resp.Body) // Read body even on error
	return handleDriveAPIErrorResponse(resp.StatusCode, resp.Status, bodyBytes, contextMsg)
}

// handleDriveAPIErrorResponse processes status code and body for errors.
func handleDriveAPIErrorResponse(statusCode int, status string, bodyBytes []byte, contextMsg string) error {
	var googleError struct {
		Error struct {
			Message string `json:"message"`
			Code    int    `json:"code"`
		} `json:"error"`
	}

	// Attempt to parse Google's specific error format
	if err := json.Unmarshal(bodyBytes, &googleError); err != nil {
		log.Printf("Failed to parse Google API error response: %v", err)
	}

	errMsg := fmt.Sprintf("%s: %s", contextMsg, status)
	if googleError.Error.Message != "" {
		errMsg = fmt.Sprintf("%s: %s (Code: %d)", contextMsg, googleError.Error.Message, googleError.Error.Code)
	} else if len(bodyBytes) > 0 {
		// Include raw body snippet if JSON parsing failed but body exists
		bodySnippet := string(bodyBytes)
		if len(bodySnippet) > 100 { // Limit snippet length
			bodySnippet = bodySnippet[:100] + "..."
		}
		errMsg += fmt.Sprintf(" - Response: %s", bodySnippet)
	}

	// Log the detailed error
	log.Printf("Google Drive API Error: %s", errMsg)

	return fmt.Errorf("%s", errMsg) // Use a constant format string with the variable as argument
}
