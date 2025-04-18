// Package conversion handles video conversion operations
package conversion

import (
	"bufio"
	"context" // Import context package
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
	"time"

	"github.com/gatanasi/video-converter/internal/models"
)

// VideoConverter manages the conversion worker pool and queue.
type VideoConverter struct {
	workersCount int
	queue        chan models.ConversionJob
	wg           sync.WaitGroup
	store        *Store
}

// NewVideoConverter creates a new VideoConverter.
func NewVideoConverter(workerCount int, store *Store) *VideoConverter {
	return &VideoConverter{
		workersCount: workerCount,
		queue:        make(chan models.ConversionJob, workerCount*2),
		store:        store,
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
		c.convertVideo(job)
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
		err := fmt.Errorf("conversion queue is full, cannot accept job %s", job.ConversionID)
		log.Printf("ERROR: Failed to queue job %s: %v", job.ConversionID, err)
		return err
	}
}

// getVideoDuration uses ffprobe to get the duration of a video file in seconds.
func getVideoDuration(filePath string) (float64, error) {
	// Use a context with timeout for ffprobe
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second) // 15-second timeout for ffprobe
	defer cancel()

	cmd := exec.CommandContext(ctx, "ffprobe",
		"-v", "error", // Only show errors
		"-show_entries", "format=duration", // Get duration from format section
		"-of", "default=noprint_wrappers=1:nokey=1", // Output only the value
		filePath,
	)

	outputBytes, err := cmd.Output()
	if ctx.Err() == context.DeadlineExceeded {
		return 0, fmt.Errorf("ffprobe timed out getting duration for %s", filepath.Base(filePath))
	}
	if err != nil {
		// Log the specific ffprobe error if available
		if exitErr, ok := err.(*exec.ExitError); ok {
			return 0, fmt.Errorf("ffprobe failed for %s: %v, stderr: %s", filepath.Base(filePath), err, string(exitErr.Stderr))
		}
		return 0, fmt.Errorf("ffprobe failed for %s: %w", filepath.Base(filePath), err)
	}

	durationStr := strings.TrimSpace(string(outputBytes))
	duration, err := strconv.ParseFloat(durationStr, 64)
	if err != nil {
		return 0, fmt.Errorf("failed to parse ffprobe duration output '%s': %w", durationStr, err)
	}

	if duration <= 0 {
		return 0, fmt.Errorf("invalid duration %f reported by ffprobe for %s", duration, filepath.Base(filePath))
	}

	log.Printf("Detected duration for %s: %.2f seconds", filepath.Base(filePath), duration)
	return duration, nil
}

// convertVideo performs the actual video conversion using FFmpeg.
func (c *VideoConverter) convertVideo(job models.ConversionJob) {
	status := job.Status // Use the status pointer from the job
	inputPath := job.UploadedFilePath
	outputPath := job.OutputFilePath
	conversionID := job.ConversionID

	// --- Get Video Duration ---
	duration, durationErr := getVideoDuration(inputPath)
	if durationErr != nil {
		// Log warning but continue, progress will be less accurate
		log.Printf("WARN [job %s]: Could not get video duration: %v. Progress estimation will be inaccurate.", conversionID, durationErr)
		status.DurationSeconds = 0 // Ensure it's zero if error occurred
	} else {
		status.DurationSeconds = duration
	}
	// Update status in store immediately with duration info
	c.store.SetStatus(conversionID, status)
	// --- End Get Video Duration ---

	// Ensure output directory exists
	if err := os.MkdirAll(filepath.Dir(outputPath), 0755); err != nil {
		errMsg := fmt.Sprintf("Failed to ensure output directory exists: %v", err)
		log.Printf("ERROR [job %s]: %s", conversionID, errMsg)
		c.store.UpdateStatusWithError(conversionID, errMsg)
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
		"-nostats",      // Suppress encoding stats on stderr
		"-v", "warning", // Log level for FFmpeg messages on stderr
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
		errMsg := fmt.Sprintf("Unsupported target format '%s'", job.TargetFormat)
		log.Printf("ERROR [job %s]: %s", conversionID, errMsg)
		c.store.UpdateStatusWithError(conversionID, errMsg)
		return
	}

	ffmpegArgs = append(ffmpegArgs, outputPath)

	log.Printf("Executing FFmpeg for job %s: ffmpeg %s", conversionID, strings.Join(ffmpegArgs, " "))
	cmd := exec.Command("ffmpeg", ffmpegArgs...)

	// Register command for potential abort
	c.store.RegisterActiveCmd(conversionID, cmd)
	defer c.store.UnregisterActiveCmd(conversionID)

	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		errMsg := fmt.Sprintf("Failed to create stderr pipe: %v", err)
		log.Printf("ERROR [job %s]: %s", conversionID, errMsg)
		c.store.UpdateStatusWithError(conversionID, errMsg)
		return
	}
	stdoutPipe, err := cmd.StdoutPipe() // For progress
	if err != nil {
		errMsg := fmt.Sprintf("Failed to create stdout pipe: %v", err)
		log.Printf("ERROR [job %s]: %s", conversionID, errMsg)
		c.store.UpdateStatusWithError(conversionID, errMsg)
		return
	}

	if err := cmd.Start(); err != nil {
		errMsg := fmt.Sprintf("Failed to start FFmpeg: %v", err)
		log.Printf("ERROR [job %s]: %s", conversionID, errMsg)
		c.store.UpdateStatusWithError(conversionID, errMsg)
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
			// Log FFmpeg output for debugging
			log.Printf("FFmpeg stderr [%s]: %s", conversionID, line)
			ffmpegErrOutput.WriteString(line + "\n") // Capture for error reporting
		}
	}()

	// Goroutine to read stdout (FFmpeg progress)
	go func() {
		defer wg.Done()
		// Pass the original status pointer, which includes the duration if found.
		// processFFmpegProgress needs a pointer to potentially read DurationSeconds.
		c.processFFmpegProgress(stdoutPipe, conversionID, status)
	}()

	// Wait for FFmpeg command to complete
	err = cmd.Wait()

	// Wait for stderr/stdout reading goroutines to finish
	wg.Wait()

	// Check FFmpeg exit code *after* reading pipes
	if err != nil {
		// Fetch status *once* after command completion to check for abort/errors
		currentStatus, exists := c.store.GetStatus(conversionID)
		if !exists {
			// This is unexpected if the command ran, log a warning.
			// The job might have been deleted concurrently?
			log.Printf("WARN [job %s]: Status not found after FFmpeg command finished.", conversionID)
			// Attempt cleanup anyway, assuming an error occurred.
			if removeErr := os.Remove(outputPath); removeErr != nil && !os.IsNotExist(removeErr) {
				log.Printf("WARN [job %s]: Failed to remove potentially incomplete output file %s after status missing: %v", conversionID, outputPath, removeErr)
			}
			if removeErr := os.Remove(inputPath); removeErr != nil && !os.IsNotExist(removeErr) {
				log.Printf("WARN [job %s]: Failed to remove input file %s after status missing: %v", conversionID, inputPath, removeErr)
			}
			return // Cannot proceed without status
		}

		// Check if the error is due to the process being killed (aborted)
		isAbortError := currentStatus.Error == "Conversion aborted by user"
		// Check if the FFmpeg error itself indicates a kill signal (less reliable)
		isKilledError := strings.Contains(err.Error(), "signal: killed") || strings.Contains(err.Error(), "exit status -1") // OS-dependent

		if !isAbortError && !isKilledError {
			// Genuine FFmpeg execution error
			errMsg := fmt.Sprintf("FFmpeg execution failed: %v", err)
			log.Printf("ERROR [job %s]: %s\nFFmpeg Output:\n%s", conversionID, errMsg, ffmpegErrOutput.String())
			// Update status only if it wasn't already marked by abort
			if currentStatus.Error == "" { // Avoid overwriting specific abort message
				c.store.UpdateStatusWithError(conversionID, errMsg+": "+ffmpegErrOutput.String())
			}
		} else if !isAbortError {
			// If it was killed but not via our specific abort message, log it.
			// The status might have already been set by the abort handler, or we set a generic one now.
			log.Printf("WARN [job %s]: FFmpeg process killed unexpectedly: %v", conversionID, err)
			if currentStatus.Error == "" { // Avoid overwriting specific abort message
				c.store.UpdateStatusWithError(conversionID, "Conversion process terminated unexpectedly")
			}
		}
		// Cleanup potentially incomplete output file if error occurred (and not aborted cleanly)
		// We check isAbortError based on the status we fetched.
		if !isAbortError {
			if removeErr := os.Remove(outputPath); removeErr != nil && !os.IsNotExist(removeErr) {
				log.Printf("WARN [job %s]: Failed to remove incomplete output file %s: %v", conversionID, outputPath, removeErr)
			}
		}
		// Input file cleanup happens regardless of error type if conversion failed/aborted
		if removeErr := os.Remove(inputPath); removeErr != nil && !os.IsNotExist(removeErr) {
			log.Printf("WARN [job %s]: Failed to remove input file %s after error/abort: %v", conversionID, inputPath, removeErr)
		}
		return
	}

	// Verify output file exists and is not empty
	outputInfo, statErr := os.Stat(outputPath)
	if statErr != nil {
		errMsg := fmt.Sprintf("FFmpeg finished but output file error: %v", statErr)
		log.Printf("ERROR [job %s]: %s", conversionID, errMsg)
		c.store.UpdateStatusWithError(conversionID, errMsg)
		if removeErr := os.Remove(inputPath); removeErr != nil && !os.IsNotExist(removeErr) {
			log.Printf("WARN [job %s]: Failed to remove input file %s after output file error: %v", conversionID, inputPath, removeErr)
		}
		return
	}
	if outputInfo.Size() == 0 {
		errMsg := "FFmpeg finished but output file is empty (0 bytes)"
		log.Printf("ERROR [job %s]: %s", conversionID, errMsg)
		c.store.UpdateStatusWithError(conversionID, errMsg)
		if removeErr := os.Remove(outputPath); removeErr != nil && !os.IsNotExist(removeErr) { // Clean up empty output
			log.Printf("WARN [job %s]: Failed to remove empty output file %s: %v", conversionID, outputPath, removeErr)
		}
		if removeErr := os.Remove(inputPath); removeErr != nil && !os.IsNotExist(removeErr) { // Clean up input
			log.Printf("WARN [job %s]: Failed to remove input file %s after empty output: %v", conversionID, inputPath, removeErr)
		}
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
	c.store.UpdateStatusOnSuccess(conversionID)
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
// It now uses the duration stored in the status for more accurate calculation.
func (c *VideoConverter) processFFmpegProgress(stdout io.ReadCloser, conversionID string, status *models.ConversionStatus) {
	defer func() {
		if err := stdout.Close(); err != nil {
			log.Printf("WARN [job %s]: Error closing FFmpeg stdout pipe: %v", conversionID, err)
		}
	}()
	scanner := bufio.NewScanner(stdout)
	var lastProgressUpdate time.Time
	// Check duration directly from the passed status pointer
	hasDuration := status != nil && status.DurationSeconds > 0

	for scanner.Scan() {
		line := scanner.Text()
		parts := strings.SplitN(strings.TrimSpace(line), "=", 2)
		if len(parts) != 2 {
			continue
		}
		key := strings.TrimSpace(parts[0])
		value := strings.TrimSpace(parts[1])

		if hasDuration && key == "out_time_us" {
			outTimeUs, err := strconv.ParseFloat(value, 64)
			// Ensure status pointer is not nil before accessing DurationSeconds
			if err == nil && outTimeUs >= 0 && status != nil {
				outTimeSec := outTimeUs / 1_000_000.0
				progress := (outTimeSec / status.DurationSeconds) * 100.0
				// Update progress using the calculated percentage
				c.store.SetProgressPercentage(conversionID, progress)
				lastProgressUpdate = time.Now() // Update timestamp even for accurate progress
			}
		} else if !hasDuration && (key == "out_time_us" || key == "frame") {
			// Fallback: Increment progress periodically if duration is unknown
			if time.Since(lastProgressUpdate) > 500*time.Millisecond {
				// Fetch current progress to increment it
				// Handle the 'exists' boolean correctly
				currentStatus, exists := c.store.GetStatus(conversionID)
				if exists {
					newProgress := currentStatus.Progress + 0.5 // Simple increment
					c.store.SetProgressPercentage(conversionID, newProgress)
					lastProgressUpdate = time.Now() // Corrected typo: Now() instead of now()
				} else {
					// Log if status is unexpectedly missing during fallback progress update
					log.Printf("WARN [job %s]: Status not found during fallback progress update.", conversionID)
					// Optionally break or return if this indicates a problem
				}
			}
		} else if key == "progress" && value == "end" {
			log.Printf("FFmpeg progress stream ended for job %s", conversionID)
			// Optionally set progress to 99% here if using duration,
			// but UpdateStatusOnSuccess handles the final 100%
			// c.store.SetProgressPercentage(conversionID, 99.0)
			return // Stop processing progress stream
		}
	}

	if err := scanner.Err(); err != nil && err != io.EOF {
		log.Printf("Error reading FFmpeg progress for job %s: %v", conversionID, err)
	}
}
