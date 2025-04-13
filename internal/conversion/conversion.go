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

	"github.com/gatanasi/video-converter/internal/models"
)

// VideoConverter encapsulates video conversion operations
type VideoConverter struct {
	workersCount int
	queue        chan models.ConversionJob
	wg           sync.WaitGroup
}

// NewVideoConverter creates a new VideoConverter with the specified number of workers
func NewVideoConverter(workerCount int) *VideoConverter {
	converter := &VideoConverter{
		workersCount: workerCount,
		queue:        make(chan models.ConversionJob, workerCount*2), // Buffer for 2x workers
	}
	return converter
}

// Start initializes and starts the conversion workers
func (c *VideoConverter) Start() {
	c.wg.Add(c.workersCount)
	for i := 0; i < c.workersCount; i++ {
		go c.worker(i + 1)
	}
	log.Printf("Started %d conversion workers", c.workersCount)
}

// Stop waits for all workers to finish and stops the converter
func (c *VideoConverter) Stop() {
	close(c.queue)
	c.wg.Wait()
	log.Println("All conversion workers stopped")
}

// worker is a goroutine that processes jobs from the queue
func (c *VideoConverter) worker(id int) {
	defer c.wg.Done()
	log.Printf("Worker %d started", id)
	
	for job := range c.queue {
		log.Printf("Worker %d: Processing job %s (File ID: %s)", id, job.ConversionID, job.FileID)
		c.processConversionJob(job)
		log.Printf("Worker %d: Finished job %s", id, job.ConversionID)
	}
	
	log.Printf("Worker %d stopped", id)
}

// QueueJob adds a job to the conversion queue
func (c *VideoConverter) QueueJob(job models.ConversionJob) error {
	select {
	case c.queue <- job:
		log.Printf("Job %s queued for file ID %s", job.ConversionID, job.FileID)
		return nil
	default:
		// Queue is full
		return fmt.Errorf("conversion queue is full")
	}
}

// processConversionJob handles the actual conversion process
func (c *VideoConverter) processConversionJob(job models.ConversionJob) {
	// Skip download step as that's now handled by the drive package
	// Just handle conversion
	c.convertVideo(job)
}

// convertVideo performs the actual video conversion
func (c *VideoConverter) convertVideo(job models.ConversionJob) {
	status := job.Status
	inputPath := status.InputPath
	outputPath := status.OutputPath
	format := status.Format
	reverseVideo := job.ReverseVideo
	removeSound := job.RemoveSound
	conversionID := job.ConversionID

	// Set optimal thread count for the hardware
	threadCount := runtime.NumCPU() - 2
	if threadCount < 1 {
		threadCount = 1
	}

	// Build FFmpeg arguments
	ffmpegArgs := []string{
		"-i", inputPath,
		"-threads", strconv.Itoa(threadCount),
		"-progress", "pipe:1", // Send progress info to stdout
		"-nostats",            // Do not print verbose encoding stats to stderr
		"-v", "warning",       // Reduce log verbosity on stderr
	}

	// Add video filters
	if reverseVideo {
		ffmpegArgs = append(ffmpegArgs, "-vf", "reverse")
	}

	// Handle audio options
	if removeSound {
		ffmpegArgs = append(ffmpegArgs, "-an") // Remove audio
	} else {
		if reverseVideo {
			ffmpegArgs = append(ffmpegArgs, "-af", "areverse") // Reverse audio if video is reversed
		} else {
			ffmpegArgs = append(ffmpegArgs, "-c:a", "copy") // Keep original audio
		}
	}

	// Add format-specific args
	switch format {
	case "mov":
		ffmpegArgs = append(ffmpegArgs, "-tag:v", "hvc1", "-c:v", "libx265", "-preset", "slow", "-crf", "22")
	case "mp4":
		ffmpegArgs = append(ffmpegArgs, "-c:v", "libx265", "-preset", "slow", "-crf", "22", "-movflags", "+faststart")
	case "avi":
		ffmpegArgs = append(ffmpegArgs, "-c:v", "libxvid", "-q:v", "3")
	default:
		reportError(status, fmt.Sprintf("Unsupported target format '%s'", format))
		return
	}

	ffmpegArgs = append(ffmpegArgs, outputPath)

	ffmpegCmd := fmt.Sprintf("ffmpeg %s", strings.Join(ffmpegArgs, " "))
	log.Printf("Executing FFmpeg: %s", ffmpegCmd)

	cmd := exec.Command("ffmpeg", ffmpegArgs...)

	// Register the command with the conversion ID to allow for aborting
	registerActiveConversion(conversionID, cmd)
	defer unregisterActiveConversion(conversionID)

	// Get pipes for progress and error reporting
	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		reportError(status, fmt.Sprintf("Failed to create stderr pipe: %v", err))
		return
	}
	
	stdoutPipe, err := cmd.StdoutPipe() // For progress
	if err != nil {
		reportError(status, fmt.Sprintf("Failed to create stdout pipe: %v", err))
		return
	}

	// Start FFmpeg
	if err := cmd.Start(); err != nil {
		reportError(status, fmt.Sprintf("Failed to start FFmpeg: %v", err))
		return
	}

	// Read stderr in a separate goroutine
	var ffmpegErrOutput strings.Builder
	stderrDone := make(chan struct{})
	go func() {
		defer close(stderrDone)
		scanner := bufio.NewScanner(stderrPipe)
		for scanner.Scan() {
			line := scanner.Text()
			log.Printf("FFmpeg stderr (%s): %s", filepath.Base(inputPath), line)
			ffmpegErrOutput.WriteString(line + "\n")
		}
	}()

	// Process stdout progress
	processFFmpegProgress(stdoutPipe, status)

	// Wait for stderr processing to finish
	<-stderrDone

	// Wait for FFmpeg command to complete
	err = cmd.Wait()
	if err != nil {
		errMsg := fmt.Sprintf("FFmpeg execution failed: %v. FFmpeg output:\n%s",
			err, ffmpegErrOutput.String())
		reportError(status, errMsg)
		return
	}

	// Verify output file
	outputInfo, statErr := os.Stat(outputPath)
	if statErr != nil {
		errMsg := fmt.Sprintf("FFmpeg finished but output file could not be accessed: %v", statErr)
		reportError(status, errMsg)
		return
	}
	
	if outputInfo.Size() == 0 {
		errMsg := fmt.Sprintf("FFmpeg finished but output file is empty (0 bytes)")
		reportError(status, errMsg)
		os.Remove(outputPath)
		return
	}

	// Run exiftool to copy metadata
	log.Printf("Copying metadata from %s to %s using exiftool", filepath.Base(inputPath), filepath.Base(outputPath))
	exifCmd := exec.Command("exiftool", "-tagsFromFile", inputPath, outputPath, "-overwrite_original", "-preserve")
	_, exifErr := exifCmd.CombinedOutput()
	if exifErr != nil {
		log.Printf("Warning: exiftool failed to copy metadata: %v", exifErr)
	} else {
		log.Printf("Successfully copied metadata with exiftool")
	}

	// Mark as complete
	models.ConversionMutex.Lock()
	if status.Error == "" {
		status.Complete = true
		status.Progress = 100.0
		log.Printf("Conversion successful: %s -> %s (%d bytes)",
			filepath.Base(inputPath), filepath.Base(outputPath), outputInfo.Size())
	}
	models.ConversionMutex.Unlock()

	// Clean up the original downloaded file
	if status.Complete && status.Error == "" {
		err := os.Remove(inputPath)
		if err != nil {
			log.Printf("Warning: Failed to remove original downloaded file: %v", err)
		} else {
			log.Printf("Removed original downloaded file: %s", inputPath)
		}
	}
}

// Helper functions for tracking active conversions
func registerActiveConversion(conversionID string, cmd *exec.Cmd) {
	models.ActiveMutex.Lock()
	defer models.ActiveMutex.Unlock()
	models.ActiveConversions[conversionID] = cmd
	log.Printf("Registered active conversion: %s", conversionID)
}

func unregisterActiveConversion(conversionID string) {
	models.ActiveMutex.Lock()
	defer models.ActiveMutex.Unlock()
	delete(models.ActiveConversions, conversionID)
	log.Printf("Unregistered conversion: %s", conversionID)
}

// processFFmpegProgress parses FFmpeg progress output
func processFFmpegProgress(stdout io.ReadCloser, status *models.ConversionStatus) {
	defer stdout.Close()
	scanner := bufio.NewScanner(stdout)

	for scanner.Scan() {
		line := scanner.Text()
		parts := strings.SplitN(strings.TrimSpace(line), "=", 2)
		if len(parts) != 2 {
			continue
		}
		
		key := strings.TrimSpace(parts[0])
		value := strings.TrimSpace(parts[1])

		switch key {
		case "out_time_us":
			// Handle progress update based on time
			// This is simplified as we'd typically need the total duration
			// Just update some progress to show activity
			models.ConversionMutex.Lock()
			if !status.Complete && status.Error == "" {
				// Just increment progress as we can't calculate percentage without duration
				status.Progress += 5
				if status.Progress > 95 {
					status.Progress = 95 // Cap at 95% until complete
				}
			}
			models.ConversionMutex.Unlock()
			
		case "progress":
			if value == "end" {
				log.Printf("FFmpeg progress stream ended for %s", filepath.Base(status.InputPath))
				models.ConversionMutex.Lock()
				if !status.Complete && status.Error == "" {
					status.Progress = 100.0
				}
				models.ConversionMutex.Unlock()
				return
			}
		}
	}

	if err := scanner.Err(); err != nil && err != io.EOF {
		log.Printf("Error reading FFmpeg progress: %v", err)
	}
}

// reportError updates the status with an error message and cleans up
func reportError(status *models.ConversionStatus, errorMsg string) {
	// Truncate overly long error messages
	const maxErrorLength = 500
	trimmedErrorMsg := errorMsg
	if len(trimmedErrorMsg) > maxErrorLength {
		trimmedErrorMsg = trimmedErrorMsg[:maxErrorLength] + "... (truncated)"
	}

	log.Printf("ERROR for job %s -> %s: %s", 
		filepath.Base(status.InputPath), filepath.Base(status.OutputPath), errorMsg)

	models.ConversionMutex.Lock()
	if status.Error == "" {
		status.Error = trimmedErrorMsg
	}
	status.Complete = true
	models.ConversionMutex.Unlock()

	// Clean up the input file on error
	if status.InputPath != "" {
		os.Remove(status.InputPath)
	}

	// Remove potentially incomplete output file
	if status.OutputPath != "" {
		if _, err := os.Stat(status.OutputPath); err == nil {
			os.Remove(status.OutputPath)
		}
	}
}