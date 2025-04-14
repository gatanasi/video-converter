# Video Converter Web App

A simple web application that allows users to fetch videos from a specified Google Drive folder, convert them to different formats using FFmpeg, and download the converted files.

## Features

-   Lists videos from a Google Drive folder using the Google Drive API.
-   Converts videos to various formats (MOV, MP4, AVI) using FFmpeg.
-   Special video processing options:
    -   **Reverse video**: Play the video in reverse.
    -   **Remove sound**: Strip audio from the output video (enabled by default).
-   Preserves metadata from original files using exiftool.
-   Displays currently running conversions with progress and abort option.
-   Includes a tab to browse and manage previously converted videos (download or delete).
-   Configuration primarily through environment variables for security and flexibility.
-   Uses a backend worker pool to manage concurrent conversions efficiently.
-   Automatic cleanup of old uploaded and converted files.

## Prerequisites

Before running the application, make sure you have the following installed:

-   [Go](https://golang.org/dl/) (v1.18 or newer recommended, tested with v1.24)
-   [FFmpeg](https://ffmpeg.org/download.html) - Must be installed and accessible in your system's `PATH`.
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

## Running the Application

### 1. Building for Production

```bash
go build -o video-converter-app ./cmd/server/main.go
```

This creates an executable named `video-converter-app`.

### 2. Deployment (Example using systemd)

**a) Create `.env` file:**

Place a `.env` file in your deployment directory (e.g., `/home/converter/.env`) with your production settings:

```dotenv
# /home/converter/.env
GOOGLE_DRIVE_API_KEY=YOUR_SECRET_API_KEY_HERE
ALLOWED_ORIGINS=https://video-converter.example.com,https://video.home.example.com
# Add other variables as needed (PORT, WORKER_COUNT, MAX_FILE_SIZE_MB, etc.)
```

**Important:** Ensure this file has secure permissions (e.g., `chmod 600 .env`) and is owned by the user running the service.

**b) Create systemd service file:**

Save the following as `/etc/systemd/system/video-converter.service`:

```ini
[Unit]
Description=Video Converter Webapp
After=network.target

[Service]
Type=simple
# Replace 'converter' with the actual user running the service
User=converter
# Replace with the actual path to your built application and .env file
WorkingDirectory=/home/converter/video-converter
EnvironmentFile=/home/converter/.env
ExecStart=/home/converter/video-converter-app
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

**c) Enable and Start the Service:**

```bash
sudo systemctl daemon-reload
sudo systemctl enable video-converter
sudo systemctl start video-converter

# Check status:
sudo systemctl status video-converter
# View logs:
sudo journalctl -u video-converter -f
```

**Note:** For production, it's highly recommended to run this application behind a reverse proxy like Nginx or Caddy to handle HTTPS, load balancing, and potentially serve static files more efficiently.
