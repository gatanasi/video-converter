# **GitHub Copilot / Agent Instructions — Video Converter Project**

This document provides short, actionable knowledge for an AI agent to be productive in this repository.

### **1\. Project Overview & Big Picture**

This is a fullstack web application for converting videos.

* **Backend (backend/):** A Go server with a worker pool for concurrent FFmpeg conversions. It serves a JSON API and the static frontend assets.  
* **Frontend (frontend/):** A vanilla TypeScript single-page application (SPA) bundled with esbuild. It communicates with the backend via REST and Server-Sent Events (SSE).  
* **Deployment:** A multi-stage Docker build that creates a minimal, secure container running as a non-root user.

Core Data Flow:  
API Request (Upload/Drive) → File saved to /uploads → Job queued in conversion.Store → Worker picks up job → FFmpeg process runs → Progress sent via SSE → Output saved to /converted → Metadata copied with exiftool

### **2\. Key Files for Common Changes**

| Change Type | Essential Files to Read / Modify |
| :---- | :---- |
| **Add Conversion Option** | models/models.go, conversion/conversion.go, conversion/quality.go |
| **Modify FFmpeg Logic** | conversion/conversion.go (FFmpeg args, progress parsing) |
| **Add a New API Endpoint** | api/routes.go (add route), api/handlers.go (add handler), frontend/src/api/apiService.ts (add client method) |
| **Change Worker Behavior** | conversion/conversion.go (worker()/QueueJob()), conversion/store.go |
| **Alter Docker/Deployment** | Dockerfile, docker/entrypoint.sh, docker-compose.dev.yml |
| **Adjust UI State** | frontend/src/app.ts, frontend/src/components/ActiveConversionsComponent.ts |

### **3\. Developer Workflow & Commands**

**External Dependencies:** ffmpeg, ffprobe, and exiftool must be in the system's PATH for local development.

| Task | Command |
| :---- | :---- |
| **Run Backend Locally** | \`cd backend && export $(grep \-v '^\#' ../.env |
| **Run Frontend Locally** | cd frontend && pnpm install && pnpm run build \-- \--watch |
| **Serve Frontend** | cd frontend && npx serve dist \-l 8080 (requires backend to be running) |
| **Run with Docker (Dev)** | docker compose \-f docker-compose.dev.yml up \-d \--build |
| **Run Backend Tests** | cd backend && go test \-v ./... |

### **4\. API Contract & Examples**

Always use these exact endpoints.

* POST /api/convert/upload (multipart/form-data)  
  * **Description:** Upload a local video file for conversion.  
  * **Example:** curl \-F "videoFile=@/path/to/video.mp4" \-F "targetFormat=mp4" http://localhost:3000/api/convert/upload  
* POST /api/convert/drive (application/json)  
  * **Description:** Start a conversion from a Google Drive file.  
  * **Example:** curl \-X POST \-H "Content-Type: application/json" \-d '{"fileId":"...","fileName":"video.mov","targetFormat":"mp4"}' http://localhost:3000/api/convert/drive  
* GET /api/conversions/stream (text/event-stream)  
  * **Description:** A long-lived SSE connection for real-time status updates.  
  * **Example:** curl \-N http://localhost:3000/api/conversions/stream  
* POST /api/conversion/abort/{id}  
  * **Description:** Abort an in-progress conversion.  
  * **Example:** curl \-X POST http://localhost:3000/api/conversion/abort/\<conversionId\>  
* GET /api/conversion/status/{id}  
  * **Description:** Get the status of a single conversion.

### **5\. Critical Patterns & Invariants**

**MUST READ before modifying core logic.**

* **State Management:** conversion.Store is the **single source of truth** for all conversion statuses and is thread-safe. All status updates must go through its methods (SetStatus, UpdateProgress, etc.).  
* **Process Management:** To enable the abort feature, any long-running exec.Cmd (like FFmpeg) **must** be registered via Store.RegisterActiveCmd() and unregistered with Store.UnregisterActiveCmd().  
* **Error Handling:** The backend returns errors as { "error": "message" }. All public Go functions should return an error. Use fmt.Errorf with %w for wrapping.  
* **File Safety:** Always use filestore.SanitizeFilename() for user-provided filenames and validateFileSafety helpers in handlers to prevent path traversal vulnerabilities.  
* **SSE Heartbeats:** The SSE stream sends periodic heartbeats to keep connections alive. The server write deadline is disabled for this endpoint.  
* **Progress Clamping:** The server clamps progress updates to a maximum of 99.0 during conversion. Only upon successful completion is the status set to 100.0. Do not assume incremental updates will ever exceed 99\.

### **6\. Known Gaps & Gotchas**

* **No Frontend Tests:** The frontend/package.json test script is a placeholder. Do not attempt to run it or assume frontend tests exist.  
* **FFprobe Dependency:** Progress calculation relies on ffprobe successfully reading the video duration first. If this fails, progress reporting will be inaccurate.  
* **File Cleanup:** Input files are only cleaned up *after* a successful conversion because exiftool needs the source file to copy metadata.

### **7\. External Documentation**

Before using or modifying integrations with external libraries (FFmpeg, exiftool, Google Drive API), **always use the Context7 MCP server** to fetch the latest documentation and code examples. This ensures you are working with up-to-date information.