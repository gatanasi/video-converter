// Package conversion handles video conversion operations
package conversion

import (
	"bufio"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time" // Add missing import

	"github.com/gatanasi/video-converter/internal/models"
)

// VideoConverter manages the conversion worker pool and queue.
type VideoConverter struct {
	workersCount int
	queue        chan models.ConversionJob
	wg           sync.WaitGroup
}

// NewVideoConverter creates a new VideoConverter.
func NewVideoConverter(workerCount int) *VideoConverter {
	return &VideoConverter{
		workersCount: workerCount,
		// Buffer size can be tuned based on expected load
		queue: make(chan models.ConversionJob, workerCount*2),
	}
}

// Start initializes and starts the conversion workers.
func (c *VideoConverter) Start() {
	c.wg.Add(c.workersCount)
	for i := 0; i < c.workersCount; i++ {
		go c.worker(i + 1)
	}
	log.Printf("Started %d conversion workers", c.workersCount)
}

// Stop signals workers to stop and waits for them to finish.
func (c *VideoConverter) Stop() {
	close(c.queue) // Signal workers no more jobs are coming
	c.wg.Wait()    // Wait for all worker goroutines to exit
	log.Println("All conversion workers stopped")
}

// worker processes jobs from the queue until the queue is closed.
func (c *VideoConverter) worker(id int) {
	defer c.wg.Done()
	log.Printf("Worker %d started", id)
	for job := range c.queue {
		log.Printf("Worker %d: Processing job %s (File: %s)", id, job.ConversionID, filepath.Base(job.UploadedFilePath))
		c.convertVideo(job) // Directly call conversion logic
		log.Printf("Worker %d: Finished job %s", id, job.ConversionID)
	}
	log.Printf("Worker %d stopped", id)
}

// QueueJob adds a job to the conversion queue. Returns error if queue is full.
func (c *VideoConverter) QueueJob(job models.ConversionJob) error {
	select {
	case c.queue <- job:
		log.Printf("Job %s queued (File: %s)", job.ConversionID, filepath.Base(job.UploadedFilePath))
		return nil
	default:
		// Non-blocking check if queue is full
		return fmt.Errorf("conversion queue is full, cannot accept job %s", job.ConversionID)
	}
}

// convertVideo performs the actual video conversion using FFmpeg.
func (c *VideoConverter) convertVideo(job models.ConversionJob) {
	status := job.Status // Use the status pointer from the job
	inputPath := job.UploadedFilePath
	outputPath := job.OutputFilePath
	conversionID := job.ConversionID

	// Ensure output directory exists (should be handled at startup, but good practice)
	if err := os.MkdirAll(filepath.Dir(outputPath), 0755); err != nil {
		models.UpdateStatusWithError(conversionID, fmt.Sprintf("Failed to ensure output directory exists: %v", err))
		return
	}

	// Determine optimal thread count (can be adjusted)
	threadCount := runtime.NumCPU() - 2
	if threadCount < 1 {
		threadCount = 1
	}

	// Build FFmpeg arguments
	ffmpegArgs := []string{
		"-i", inputPath,
		"-threads", strconv.Itoa(threadCount),
		"-progress", "pipe:1", // Send progress info to stdout
		"-nostats",            // Suppress encoding stats on stderr
		"-v", "warning",       // Log level for FFmpeg messages on stderr
	}

	// Add video filters if requested
	if job.ReverseVideo {
		ffmpegArgs = append(ffmpegArgs, "-vf", "reverse")
	}

	// Handle audio options
	if job.RemoveSound {
		ffmpegArgs = append(ffmpegArgs, "-an") // No audio
	} else {
		if job.ReverseVideo {
			ffmpegArgs = append(ffmpegArgs, "-af", "areverse") // Reverse audio to match video
		} else {
			// Default: copy audio stream without re-encoding if possible
			ffmpegArgs = append(ffmpegArgs, "-c:a", "copy")
		}
	}

	// Add format-specific arguments (consider making these configurable)
	switch job.TargetFormat {
	case "mov":
		ffmpegArgs = append(ffmpegArgs, "-tag:v", "hvc1", "-c:v", "libx265", "-preset", "slow", "-crf", "22")
	case "mp4":
		ffmpegArgs = append(ffmpegArgs, "-c:v", "libx265", "-preset", "slow", "-crf", "22", "-movflags", "+faststart")
	case "avi":
		ffmpegArgs = append(ffmpegArgs, "-c:v", "libxvid", "-q:v", "3")
	default:
		// This case should ideally be caught by validation in the handler
		models.UpdateStatusWithError(conversionID, fmt.Sprintf("Unsupported target format '%s'", job.TargetFormat))
		return
	}

	ffmpegArgs = append(ffmpegArgs, outputPath)

	log.Printf("Executing FFmpeg for job %s: ffmpeg %s", conversionID, strings.Join(ffmpegArgs, " "))
	cmd := exec.Command("ffmpeg", ffmpegArgs...)

	// Register command for potential abort
	models.RegisterActiveConversion(conversionID, cmd)
	defer models.UnregisterActiveConversion(conversionID) // Ensure unregister happens

	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		models.UpdateStatusWithError(conversionID, fmt.Sprintf("Failed to create stderr pipe: %v", err))
		return
	}
	stdoutPipe, err := cmd.StdoutPipe() // For progress
	if err != nil {
		models.UpdateStatusWithError(conversionID, fmt.Sprintf("Failed to create stdout pipe: %v", err))
		return
	}

	if err := cmd.Start(); err != nil {
		models.UpdateStatusWithError(conversionID, fmt.Sprintf("Failed to start FFmpeg: %v", err))
		return
	}

	// Read stderr and stdout concurrently
	var wg sync.WaitGroup
	var ffmpegErrOutput strings.Builder
	wg.Add(2)

	// Goroutine to read stderr (FFmpeg logs/errors)
	go func() {
		defer wg.Done()
		scanner := bufio.NewScanner(stderrPipe)
		for scanner.Scan() {
			line := scanner.Text()
			// Log FFmpeg output for debugging, associate with job ID
			log.Printf("FFmpeg stderr [%s]: %s", conversionID, line)
			ffmpegErrOutput.WriteString(line + "\n") // Capture for error reporting
		}
	}()

	// Goroutine to read stdout (FFmpeg progress)
	go func() {
		defer wg.Done()
		processFFmpegProgress(stdoutPipe, conversionID, status)
	}()

	// Wait for FFmpeg command to complete
	err = cmd.Wait()

	// Wait for stderr/stdout reading goroutines to finish
	wg.Wait()

	// Check FFmpeg exit code *after* reading pipes
	if err != nil {
		// Check if the error is due to the process being killed (aborted)
		status, _ := models.GetConversionStatus(conversionID) // Re-fetch status
		if status.Error != "Conversion aborted by user" && !strings.Contains(status.Error, "process termination failed") {
			errMsg := fmt.Sprintf("FFmpeg execution failed: %v. Output:\n%s", err, ffmpegErrOutput.String())
			models.UpdateStatusWithError(conversionID, errMsg)
		}
		// Cleanup potentially incomplete output file if error occurred (and not aborted)
		if status.Error != "Conversion aborted by user" {
			os.Remove(outputPath)
		}
		// Input file cleanup happens regardless of error type if conversion failed/aborted
		os.Remove(inputPath)
		return
	}

	// Verify output file exists and is not empty
	outputInfo, statErr := os.Stat(outputPath)
	if statErr != nil {
		errMsg := fmt.Sprintf("FFmpeg finished but output file error: %v", statErr)
		models.UpdateStatusWithError(conversionID, errMsg)
		os.Remove(inputPath) // Clean up input
		return
	}
	if outputInfo.Size() == 0 {
		errMsg := "FFmpeg finished but output file is empty (0 bytes)"
		models.UpdateStatusWithError(conversionID, errMsg)
		os.Remove(outputPath) // Clean up empty output
		os.Remove(inputPath)  // Clean up input
		return
	}

	// Attempt to copy metadata using exiftool (optional, log warning on failure)
	log.Printf("Attempting metadata copy for job %s using exiftool...", conversionID)
	// -overwrite_original modifies the output file directly
	// -preserve keeps original file modification time if possible
	// -P preserves filesystem timestamp
	exifCmd := exec.Command("exiftool", "-tagsFromFile", inputPath, "-all:all>all:all", "-preserve", "-overwrite_original", outputPath)
	exifOutput, exifErr := exifCmd.CombinedOutput()
	if exifErr != nil {
		// Log warning, don't fail the conversion
		log.Printf("Warning [job %s]: exiftool failed to copy metadata: %v. Output: %s", conversionID, exifErr, string(exifOutput))
	} else {
		log.Printf("Successfully copied metadata for job %s", conversionID)
	}

	// Mark as complete
	models.UpdateStatusOnSuccess(conversionID)
	log.Printf("Conversion successful for job %s: %s -> %s (%d bytes)",
		conversionID, filepath.Base(inputPath), filepath.Base(outputPath), outputInfo.Size())

	// Clean up the original downloaded file *after* successful conversion and metadata copy
	err = os.Remove(inputPath)
	if err != nil {
		log.Printf("Warning [job %s]: Failed to remove original downloaded file %s: %v", conversionID, inputPath, err)
	} else {
		log.Printf("Removed original downloaded file for job %s: %s", conversionID, inputPath)
	}
}

// processFFmpegProgress parses FFmpeg progress output from stdout.
// NOTE: Accurate percentage requires total duration, which is complex to get reliably beforehand.
// This provides a basic indication of activity rather than precise percentage.
func processFFmpegProgress(stdout io.ReadCloser, conversionID string, status *models.ConversionStatus) {
	defer stdout.Close()
	scanner := bufio.NewScanner(stdout)
	var lastProgressUpdate time.Time

	for scanner.Scan() {
		line := scanner.Text()
		parts := strings.SplitN(strings.TrimSpace(line), "=", 2)
		if len(parts) != 2 {
			continue
		}
		key := strings.TrimSpace(parts[0])
		value := strings.TrimSpace(parts[1])

		// Update progress based on 'out_time_us' or similar key if available
		// This is a very rough estimate as total duration isn't known easily
		if key == "out_time_us" || key == "frame" {
			// Update progress periodically to avoid excessive locking
			if time.Since(lastProgressUpdate) > 500*time.Millisecond {
				// Use the helper function from models package
				models.UpdateProgress(conversionID, 0.5) // Increment by 0.5%
				lastProgressUpdate = time.Now()
			}
		} else if key == "progress" && value == "end" {
			log.Printf("FFmpeg progress stream ended for job %s", conversionID)
			// Final progress update will be handled after cmd.Wait() succeeds
			return // Stop processing progress stream
		}
	}

	if err := scanner.Err(); err != nil && err != io.EOF {
		log.Printf("Error reading FFmpeg progress for job %s: %v", conversionID, err)
	}
}

// Note: reportError logic is now integrated into convertVideo and uses model helpers.