# Video Converter Web App

A simple web application that allows users to fetch videos from a specified Google Drive folder, convert them to different formats using FFmpeg, and download the converted files.

## Features

-   Lists videos from a Google Drive folder using the Google Drive API.
-   Converts videos to various formats (MOV, MP4) using FFmpeg.
-   Special video processing options:
    -   **Reverse video**: Play the video in reverse.
    -   **Remove sound**: Strip audio from the output video (enabled by default).
    -   **Quality presets**: Choose between Default (CRF 22 · slow), High (CRF 20 · slower), or Fast (CRF 23 · medium) encoding profiles.
-   Preserves metadata from original files using exiftool.
-   Displays currently running conversions with accurate progress and abort option.
-   Includes a tab to browse and manage previously converted videos (download or delete).
-   Configuration primarily through environment variables for security and flexibility.
-   Uses a backend worker pool to manage concurrent conversions efficiently.
-   Automatic cleanup of old uploaded and converted files.
-   Containerized deployment with Docker for easy setup and consistent environments.

## Quick Start with Docker (Recommended)

The easiest way to run the application is using Docker:

```bash
# 1. Copy environment template
cp .env.example .env

# 2. Edit .env and add your Google Drive API key
# GOOGLE_DRIVE_API_KEY=your_key_here
# VERSION=latest # You can specify a version like 1.2.3

# 3. Run with docker compose
docker compose up -d

# 4. Access at http://localhost:3000
```

For Docker-specific commands and troubleshooting, see [DOCKER.md](DOCKER.md).

## Prerequisites

**For Docker Deployment (Recommended):**
-   [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/)

**For Local Development:**
-   [Go](https://golang.org/dl/) (v1.18 or newer recommended, tested with v1.25)
-   [Node.js](https://nodejs.org/) and [pnpm](https://pnpm.io/installation) (for building the frontend)
-   [FFmpeg](https://ffmpeg.org/download.html) - Must be installed and accessible in your system's `PATH`. `ffprobe` (usually included with FFmpeg) is also required for accurate progress calculation.
-   [ExifTool](https://exiftool.org/install.html) - Required for metadata preservation. Must be installed and accessible in your system's `PATH`.

## Configuration (Environment Variables)

This application is configured primarily via environment variables for security and ease of deployment. You can set these directly in your environment or use a `.env` file (see examples below).

**Required:**

-   `GOOGLE_DRIVE_API_KEY`: **(Required)** Your Google Drive API Key.
    -   Create a project in the [Google Cloud Console](https://console.cloud.google.com/).
    -   Enable the **Google Drive API**.
    -   Create an **API Key** under "APIs & Services" -> "Credentials".
    -   **Important:** Restrict the API key if possible. For this application's needs (listing files with `alt=media` and downloading `alt=media`), it primarily needs read access to the Drive files it will process. Consider restricting it to the Drive API and potentially by IP address if feasible.
    -   This key is used **only on the backend** for listing and downloading files from Google Drive.
-   `ALLOWED_ORIGINS`: **(Required for Production)** A comma-separated list of frontend URLs (origins) that are allowed to access the backend API via CORS.
    -   **Example:** `ALLOWED_ORIGINS=https://converter.example.com,https://converter.home.example.com`
    -   **Security:** If this variable is **not set**, the backend will default to allowing **all** origins (`*`), which is **insecure** and should **not** be used in production.

**Optional (Defaults Provided):**
-   `VERSION`: A version string to bake into the application binary during the Docker build. (Default: `docker`)
-   `PORT`: The port the Go backend server will listen on. (Default: `3000`)
-   `WORKER_COUNT`: The number of concurrent FFmpeg conversion processes allowed. (Default: Number of CPU cores reported by `runtime.NumCPU()`)
-   `MAX_FILE_SIZE_MB`: Maximum allowed size (in Megabytes) for a video file downloaded from Google Drive or uploaded directly. (Default: `2000`)
-   `UPLOADS_DIR`: Directory path for temporary storage of downloaded/uploaded videos before conversion. (Default: `uploads`)
-   `CONVERTED_DIR`: Directory path for storing successfully converted videos. (Default: `converted`)
-   `DEFAULT_DRIVE_FOLDER_ID`: Pre-configures a default Google Drive folder ID for the application. When set, this folder ID will be automatically used as the default when the application loads, saving users from having to manually enter it. Users can still override this by entering a different folder ID in the UI. This is useful for deployments where most users will be accessing the same folder.

## CI/CD and Releases

This project uses GitHub Actions for continuous integration and deployment:

### Automated Workflows

- **CI**: Runs on every push - lints, tests, and builds Docker image (validates only, doesn't push)
- **Release**: Creates versioned releases with Docker images pushed to GitHub Container Registry

### Creating a Release

Releases are created via GitHub Actions workflow:

1. Go to **Actions** → **Video Converter - Release** → **Run workflow**
2. Choose options:
   - **Branch**: Branch to release from (default: `main`)
   - **Force release**: Override semantic versioning
   - **Manual version**: Specify version manually (e.g., `1.0.0`, `1.0.0-beta1`)

The workflow will:
- Determine version using semantic-release (or use manual version)
- Run all tests and linting
- Build multi-platform Docker image (amd64, arm64)
- Push to GitHub Container Registry with multiple tags
- Create GitHub Release with Docker pull instructions

### Version Tags

Each release creates multiple Docker image tags:
- `ghcr.io/gatanasi/video-converter:latest` - Latest stable release
- `ghcr.io/gatanasi/video-converter:1.0.0` - Specific version
- `ghcr.io/gatanasi/video-converter:1.0` - Latest 1.0.x patch
- `ghcr.io/gatanasi/video-converter:1` - Latest 1.x.x minor/patch

See [.github/workflows/README.md](.github/workflows/README.md) for detailed workflow documentation.

## Deploying to Production

### Docker Deployment (Recommended)

The application is distributed as a Docker image via GitHub Container Registry (GHCR). This is the recommended deployment method as it includes all dependencies (FFmpeg, ExifTool) and ensures consistent behavior across environments.

#### Using Pre-built Images

**Prerequisites:**
- Docker and Docker Compose installed on your server
- A `.env` file with your configuration (see [Configuration](#configuration-environment-variables))

**Quick Deploy:**

```bash
# 1. Create docker-compose.yml and .env files on your server
# 2. Set your environment variables in .env
# 3. Pull and run the latest release
docker compose pull
docker compose up -d

# Check logs
docker compose logs -f

# Stop the application
docker compose down
```

**Deploy Specific Version:**

```bash
# In your .env file
# VERSION=1.2.3

# Or on the command line
VERSION=1.2.3 docker compose up -d
```

### Alternative: Direct Docker Run

```bash
docker run -d \
  --name video-converter \
  -p 3000:3000 \
  -e GOOGLE_DRIVE_API_KEY="your_api_key" \
  -e ALLOWED_ORIGINS="https://yourdomain.com" \
  -v $(pwd)/uploads:/app/uploads \
  -v $(pwd)/converted:/app/converted \
  ghcr.io/gatanasi/video-converter:latest
```

## Local Development

### Running Locally (Without Docker)

1.  **Set up environment variables:**
    *   Copy the example file: `cp .env.example .env`
    *   Edit `.env` and set your `GOOGLE_DRIVE_API_KEY` and other configuration

2.  **Backend:**
    *   Navigate to the `backend` directory: `cd backend`
    *   Load environment variables from the root `.env` file:
        ```bash
        # Option 1: Export variables from .env (zsh/bash)
        export $(grep -v '^#' ../.env | xargs)
        
        # Option 2: Use env command
        env $(cat ../.env | grep -v '^#' | xargs) go run ./cmd/server/main.go
        ```
    *   Or set them manually:
        ```bash
        export GOOGLE_DRIVE_API_KEY="YOUR_DEV_API_KEY"
        export ALLOWED_ORIGINS="http://localhost:8080"
        export PORT="3000"
        ```
    *   Run the backend server: `go run ./cmd/server/main.go`
    *   The backend will be accessible at `http://localhost:3000`

3.  **Frontend:**
    *   Navigate to the `frontend` directory: `cd frontend`
    *   Install dependencies: `pnpm install`
    *   Build the frontend assets: `pnpm run build`
    *   Serve the `dist` directory:
        ```bash
        npx serve dist -l 8080
        ```
    *   Open your browser to `http://localhost:8080`

### Building Docker Image Locally

```bash
# Build the image
docker build -t video-converter:local .

# Run it
docker run -d -p 3000:3000 \
  -e GOOGLE_DRIVE_API_KEY="your_key" \
  -e ALLOWED_ORIGINS="*" \
  video-converter:local
```
