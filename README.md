# Video Converter Web App

A simple web application that allows users to fetch videos from a specified Google Drive folder, convert them to different formats using FFmpeg, and download the converted files.

## Features

-   Lists videos from a Google Drive folder using the Google Drive API.
-   Converts videos to various formats (MOV, MP4, AVI) using FFmpeg.
-   Special video processing options:
    -   **Reverse video**: Play the video in reverse.
    -   **Remove sound**: Strip audio from the output video (enabled by default).
-   Preserves metadata from original files using exiftool.
-   Displays currently running conversions with accurate progress and abort option.
-   Includes a tab to browse and manage previously converted videos (download or delete).
-   Configuration primarily through environment variables for security and flexibility.
-   Uses a backend worker pool to manage concurrent conversions efficiently.
-   Automatic cleanup of old uploaded and converted files.

## Prerequisites

Before running the application, make sure you have the following installed:

-   [Go](https://golang.org/dl/) (v1.18 or newer recommended, tested with v1.24)
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
    -   **Example:** `ALLOWED_ORIGINS=https://video-converter.example.com,https://video.home.example.com`
    -   **For local development:** You might use `ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000` (adjust port if needed).
    -   **Security:** If this variable is **not set**, the backend will default to allowing **all** origins (`*`), which is **insecure** and should **not** be used in production.

**Optional (Defaults Provided):**

-   `PORT`: The port the Go backend server will listen on. (Default: `3000`)
-   `WORKER_COUNT`: The number of concurrent FFmpeg conversion processes allowed. (Default: Number of CPU cores reported by `runtime.NumCPU()`)
-   `MAX_FILE_SIZE_MB`: Maximum allowed size (in Megabytes) for a video file downloaded from Google Drive. (Default: `2000`)
-   `UPLOADS_DIR`: Directory path for temporary storage of downloaded videos before conversion. (Default: `uploads`)
-   `CONVERTED_DIR`: Directory path for storing successfully converted videos. (Default: `converted`)
-   `DEFAULT_DRIVE_FOLDER_ID`: Pre-configures a default Google Drive folder ID for the application. When set, this folder ID will be automatically used as the default when the application loads, saving users from having to manually enter it. Users can still override this by entering a different folder ID in the UI. This is useful for deployments where most users will be accessing the same folder.

## Running Locally (Development)

1.  **Backend:**
    *   Navigate to the `backend` directory: `cd backend`
    *   Set required environment variables. For local development, you might use a `.env` file in the `backend` directory or export them directly:
        ```bash
        export GOOGLE_DRIVE_API_KEY="YOUR_DEV_API_KEY"
        # Adjust port if your frontend server runs elsewhere
        # Optional: Set other variables like WORKER_COUNT, UPLOADS_DIR etc.
        #export ALLOWED_ORIGINS="http://localhost:8080"
        #export PORT="3000" # Or your preferred backend port
        ```
    *   Run the backend server: `go run ./cmd/server/main.go`
    *   The backend will be accessible at `http://localhost:3000` (or the port you set).

2.  **Frontend:**
    *   Navigate to the `frontend` directory: `cd ../frontend`
    *   Install dependencies: `pnpm install`
    *   Build the frontend assets: `pnpm run build` (This creates the `dist` directory)
    *   Serve the `dist` directory using a simple HTTP server. For example:
        ```bash
        # Make sure you are in the frontend/ directory
        npx serve dist -l 8080
        ```
    *   Open your browser to `http://localhost:8080`.

## Building for Production

1.  **Build Frontend:**
    *   Navigate to the `frontend` directory: `cd frontend`
    *   Install dependencies: `pnpm install`
    *   Build the production assets: `pnpm run build`
    *   The static frontend files will be generated in the `frontend/dist` directory.

2.  **Build Backend:**
    *   Navigate to the `backend` directory: `cd ../backend`
    *   Build the Go executable:
        ```bash
        go build -ldflags="-s -w" -o ../video-converter-app ./cmd/server/main.go
        ```
        This creates an optimized executable named `video-converter-app` in the `root` directory.

## Deploying to Production

Deploying involves placing the built backend executable and the static frontend assets onto your server and running the backend process. Using a reverse proxy (like Nginx or Caddy) is highly recommended.

**Example Steps:**

1.  **Copy Files:**
    *   Copy the backend executable (`backend/video-converter-app`) to your server (e.g., `/opt/video-converter/`).
    *   Copy the entire contents of the frontend build output directory (`frontend/dist/*`) to a location your web server will serve (e.g., `/var/www/video-converter/`).

2.  **Configure Backend Environment:**
    *   Create a `.env` file on the server in the same directory as the executable (e.g., `/opt/video-converter/.env`) with your production settings:
        ```dotenv
        # /opt/video-converter/.env
        GOOGLE_DRIVE_API_KEY=YOUR_PRODUCTION_API_KEY_HERE
        ALLOWED_ORIGINS=https://your-frontend-domain.com # Replace with your actual frontend URL
        PORT=3000 # Or the port the backend should listen on internally
        UPLOADS_DIR=/opt/video-converter/uploads # Ensure this dir exists and is writable
        CONVERTED_DIR=/opt/video-converter/converted # Ensure this dir exists and is writable
        # Add other variables as needed (WORKER_COUNT, MAX_FILE_SIZE_MB, etc.)
        ```
    *   **Important:** Ensure this file has secure permissions (e.g., `chmod 600 .env`) and is owned by the user running the service.

3.  **Run Backend (Example using systemd):**
    *   Create a systemd service file (e.g., `/etc/systemd/system/video-converter.service`):
        ```ini
        [Unit]
        Description=Video Converter Service
        After=network.target

        [Service]
        Type=simple
        # Replace 'converter' with the actual user running the service
        User=converter
        Group=converter
        # Path to the executable and its directory
        WorkingDirectory=/opt/video-converter
        EnvironmentFile=/opt/video-converter/.env
        ExecStart=/opt/video-converter/video-converter-app
        Restart=on-failure
        RestartSec=5
        # Recommended security settings
        PrivateTmp=true
        ProtectSystem=full
        NoNewPrivileges=true

        [Install]
        WantedBy=multi-user.target
        ```
    *   Enable and start the service:
        ```bash
        sudo systemctl daemon-reload
        sudo systemctl enable video-converter
        sudo systemctl start video-converter
        # Check status: sudo systemctl status video-converter
        # View logs: sudo journalctl -u video-converter -f
        ```
