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
	"github.com/gatanasi/video-converter/internal/conversion"
	"github.com/gatanasi/video-converter/internal/filestore"
	"github.com/gatanasi/video-converter/internal/middleware"
)

func main() {
	// Load configuration
	conf := config.New()

	// Ensure required directories exist
	if err := filestore.EnsureDirectoryExists(conf.UploadsDir); err != nil {
		log.Fatalf("Failed to create uploads directory: %v", err)
	}
	if err := filestore.EnsureDirectoryExists(conf.ConvertedDir); err != nil {
		log.Fatalf("Failed to create converted directory: %v", err)
	}

	// Initialize CORS middleware
	middleware.InitCORS(conf.AllowedOrigins)

	// Create and start the video converter
	converter := conversion.NewVideoConverter(conf.WorkerCount)
	converter.Start()
	defer converter.Stop() // Ensure graceful shutdown of workers

	// Create API handlers
	handler := api.NewHandler(conf, converter)

	// Set up HTTP router with endpoints
	mux := http.NewServeMux()
	handler.SetupRoutes(mux)

	// Configure server with timeouts and middleware
	server := &http.Server{
		Addr:         ":" + conf.Port,
		Handler:      middleware.CORS(mux),
		ReadTimeout:  60 * time.Second,
		WriteTimeout: 120 * time.Second,
		IdleTimeout:  180 * time.Second,
	}

	// Set up periodic file cleanup
	go setupFileCleanup(conf)

	// Graceful shutdown setup
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	
	// Start the server in a goroutine
	go func() {
		fmt.Printf("Server starting on http://localhost:%s\n", conf.Port)
		fmt.Printf("Using %d conversion workers.\n", conf.WorkerCount)
		fmt.Println("Allowed Origins:", conf.AllowedOrigins)
		fmt.Println("Make sure FFmpeg is installed and accessible in your PATH.")
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Error starting server: %v", err)
		}
	}()

	// Wait for shutdown signal
	<-stop

	// Create a context with timeout for graceful shutdown
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Attempt graceful shutdown
	fmt.Println("Server shutting down...")
	if err := server.Shutdown(ctx); err != nil {
		log.Fatalf("Server shutdown failed: %v", err)
	}
	fmt.Println("Server gracefully stopped")
}

// setupFileCleanup creates a goroutine to periodically clean up old files
func setupFileCleanup(conf config.Config) {
	go func() {
		// Initial cleanup shortly after start
		log.Println("Scheduling initial file cleanup in 5 minutes...")
		time.Sleep(5 * time.Minute)
		cleanupFiles(conf)

		// Run periodically
		ticker := time.NewTicker(1 * time.Hour)
		defer ticker.Stop()
		log.Println("Starting periodic cleanup task (every 1 hour)...")
		for range ticker.C {
			cleanupFiles(conf)
		}
	}()
}

// cleanupFiles removes old files from the uploads and converted directories
func cleanupFiles(conf config.Config) {
	maxAge := 24 * time.Hour // Files older than 24 hours
	log.Println("Running cleanup for old files...")
	
	uploadsRemoved := filestore.CleanupOldFiles(conf.UploadsDir, maxAge)
	convertedRemoved := filestore.CleanupOldFiles(conf.ConvertedDir, maxAge)
	
	if uploadsRemoved > 0 || convertedRemoved > 0 {
		log.Printf("File cleanup finished. Removed %d uploaded and %d converted files.", 
			uploadsRemoved, convertedRemoved)
	} else {
		log.Println("File cleanup finished. No files needed removal.")
	}
}