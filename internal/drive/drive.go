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

// DownloadFile downloads a file from Google Drive
func DownloadFile(fileID, apiKey, destinationPath string, maxFileSize int64) error {
	log.Printf("Attempting download: File ID %s to %s", fileID, destinationPath)
	downloadURL := fmt.Sprintf("https://www.googleapis.com/drive/v3/files/%s?alt=media&key=%s", fileID, apiKey)

	req, err := http.NewRequest("GET", downloadURL, nil)
	if err != nil {
		return fmt.Errorf("failed to create download request: %v", err)
	}

	// Use a client with a potentially longer timeout for large files
	client := &http.Client{
		Timeout: 30 * time.Minute,
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
		var googleError struct {
			Error struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		json.Unmarshal(bodyBytes, &googleError)
		errMsg := fmt.Sprintf("download failed, status: %s", resp.Status)
		if googleError.Error.Message != "" {
			errMsg += " - " + googleError.Error.Message
		}
		return fmt.Errorf("%s", errMsg)
	}

	// Check Content-Length against MaxFileSize BEFORE writing
	contentLength := resp.ContentLength
	if contentLength > 0 && contentLength > maxFileSize {
		return fmt.Errorf("file size (%d bytes) exceeds maximum allowed size (%d bytes)", contentLength, maxFileSize)
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
	if (contentLength <= 0 || contentLength > maxFileSize) && written > maxFileSize {
		os.Remove(destinationPath)
		return fmt.Errorf("downloaded file size (%d bytes) exceeds maximum allowed size (%d bytes)", written, maxFileSize)
	}

	log.Printf("Successfully downloaded %d bytes for file ID %s to %s", written, fileID, destinationPath)
	return nil
}

// ListVideos lists videos in a Google Drive folder
func ListVideos(folderID string, apiKey string) ([]byte, error) {
	// Construct Google Drive API URL with proper query escaping
	queryParams := url.Values{}
	queryParams.Set("q", fmt.Sprintf("'%s' in parents and mimeType contains 'video'", folderID))
	queryParams.Set("fields", "files(id,name,mimeType,modifiedTime,size)")
	queryParams.Set("orderBy", "name")
	queryParams.Set("key", apiKey)

	listURL := "https://www.googleapis.com/drive/v3/files?" + queryParams.Encode()

	// Create request
	req, err := http.NewRequest("GET", listURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request to Google Drive: %v", err)
	}

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to contact Google Drive API: %v", err)
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response from Google Drive: %v", err)
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
		return nil, fmt.Errorf(errMsg)
	}

	return bodyBytes, nil
}