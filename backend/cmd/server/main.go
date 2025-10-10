// Package main provides the entry point for the video converter server
package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gatanasi/video-converter/internal/api"
	"github.com/gatanasi/video-converter/internal/config"
	"github.com/gatanasi/video-converter/internal/constants"
	"github.com/gatanasi/video-converter/internal/conversion"
	"github.com/gatanasi/video-converter/internal/filestore"
	"github.com/gatanasi/video-converter/internal/middleware"
	"github.com/gatanasi/video-converter/internal/models"
)

// version is set during build time using ldflags
var version string = "dev"

func main() {
	conf := config.New()

	// Ensure required directories exist
	for _, dir := range []string{conf.UploadsDir, conf.ConvertedDir} {
		if err := filestore.EnsureDirectoryExists(dir); err != nil {
			log.Fatalf("Failed to ensure directory %s exists: %v", dir, err)
		}
	}

	middleware.InitCORS(conf.AllowedOrigins)

	// Create conversion store for tracking active conversions
	store := conversion.NewStore()

	converter := conversion.NewVideoConverter(conf.WorkerCount, store)
	converter.Start()
	defer converter.Stop()

	handler := api.NewHandler(conf, converter, store)

	mux := http.NewServeMux()
	handler.SetupRoutes(mux)

	// Wrap handler to disable write timeout for SSE stream endpoint
	wrappedHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == api.RouteActiveConversionsStream {
			// Disable write timeout for SSE stream
			if conn, ok := w.(interface{ SetWriteDeadline(time.Time) error }); ok {
				conn.SetWriteDeadline(time.Time{})
			}
		}
		middleware.CORS(mux).ServeHTTP(w, r)
	})

	server := &http.Server{
		Addr:         ":" + conf.Port,
		Handler:      wrappedHandler,
		ReadTimeout:  constants.HTTPReadTimeout,
		WriteTimeout: constants.HTTPWriteTimeout,
		IdleTimeout:  constants.HTTPIdleTimeout,
	}

	go setupFileCleanup(conf)

	// Graceful shutdown setup
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	go func() {
		fmt.Printf("Video Converter Server version: %s\n", version)
		fmt.Printf("Server starting on http://localhost:%s\n", conf.Port)
		fmt.Printf("Using %d conversion workers.\n", conf.WorkerCount)
		fmt.Println("Allowed Origins:", conf.AllowedOrigins)
		fmt.Println("Make sure FFmpeg and exiftool are installed and accessible in your PATH.")
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Error starting server: %v", err)
		}
	}()

	<-stop // Wait for interrupt signal

	// Initiate graceful shutdown
	ctx, cancel := context.WithTimeout(context.Background(), constants.ShutdownTimeout)
	defer cancel()

	fmt.Println("Server shutting down...")
	if err := server.Shutdown(ctx); err != nil {
		log.Fatalf("Server shutdown failed: %v", err)
	}
	fmt.Println("Server gracefully stopped")
}

// setupFileCleanup schedules periodic cleanup of old files.
func setupFileCleanup(conf models.Config) {
	// Run cleanup shortly after start and then periodically
	initialDelay := constants.FileCleanupInitialDelay
	cleanupInterval := constants.FileCleanupInterval

	log.Printf("Scheduling initial file cleanup in %v...", initialDelay)
	time.AfterFunc(initialDelay, func() {
		cleanupFiles(conf)
		// Start periodic cleanup after the initial run
		ticker := time.NewTicker(cleanupInterval)
		log.Printf("Starting periodic cleanup task (every %v)...", cleanupInterval)
		for range ticker.C {
			cleanupFiles(conf)
		}
		// Note: This ticker goroutine will exit when the program exits.
		// If more robust lifecycle management is needed, consider using context cancellation.
	})
}

// cleanupFiles removes old files from configured directories.
func cleanupFiles(conf models.Config) {
	maxAge := constants.FileMaxAge
	log.Println("Running cleanup for old files...")

	uploadsRemoved := filestore.CleanupOldFiles(conf.UploadsDir, maxAge)
	convertedRemoved := filestore.CleanupOldFiles(conf.ConvertedDir, maxAge)

	totalRemoved := uploadsRemoved + convertedRemoved
	if totalRemoved > 0 {
		log.Printf("File cleanup finished. Removed %d total old files (%d uploaded, %d converted).",
			totalRemoved, uploadsRemoved, convertedRemoved)
	} else {
		log.Println("File cleanup finished. No old files needed removal.")
	}
}
