# Video Converter Web App

A simple web application that allows users to fetch videos from a specified Google Drive folder, convert them to different formats using FFmpeg, and download the converted files.

## Features

-   Lists videos from a Google Drive folder using the Google Drive API (via a secure backend endpoint).
-   Converts videos to various formats (MP4, MOV, AVI) using FFmpeg.
-   Provides real-time conversion progress tracking.
-   Allows downloading of converted videos.
-   Includes a tab to browse and manage previously converted videos (download or delete).
-   Configuration primarily through environment variables for security and flexibility.
-   Uses a backend worker pool to manage concurrent conversions efficiently.

## Prerequisites

Before running the application, make sure you have the following installed:

-   [Go](https://golang.org/dl/) (v1.18 or newer recommended, tested with v1.24)
-   [FFmpeg](https://ffmpeg.org/download.html) - Must be installed and accessible in your system's `PATH`.

## Configuration (Environment Variables)

This application is configured primarily via environment variables for security and ease of deployment.

**Required:**

-   `GOOGLE_DRIVE_API_KEY`: **(Required)** Your Google Drive API Key.
    -   Create a project in the [Google Cloud Console](https://console.cloud.google.com/).
    -   Enable the **Google Drive API**.
    -   Create an **API Key** under "APIs & Services" -> "Credentials".
    -   **Important:** Restrict the API key if possible. For this application's needs (listing files with `alt=media` and downloading `alt=media`), it primarily needs read access to the Drive files it will process. Consider restricting it to the Drive API and potentially by IP address if feasible.
    -   This key is used **only on the backend** for listing and downloading files from Google Drive.
-   `ALLOWED_ORIGINS`: **(Required for Production)** A comma-separated list of frontend URLs (origins) that are allowed to access the backend API via CORS.
    -   **Example:** `export ALLOWED_ORIGINS='https://video-converter.example.com,https://video.home.example.com'`
    -   **For local development:** You might use `export ALLOWED_ORIGINS='http://localhost:3000,http://127.0.0.1:3000'` (adjust port if needed).
    -   **Security:** If this variable is **not set**, the backend will default to allowing **all** origins (`*`), which is **insecure** and should **not** be used in production.

**Optional (Defaults Provided):**

-   `PORT`: The port the Go backend server will listen on. (Default: `3000`)
-   `WORKER_COUNT`: The number of concurrent FFmpeg conversion processes allowed. (Default: Number of CPU cores)
-   `MAX_FILE_SIZE_MB`: Maximum allowed size (in Megabytes) for a video file downloaded from Google Drive. (Default: `2000`)
-   `UPLOADS_DIR`: Directory path for temporary storage of downloaded videos before conversion. (Default: `uploads`)
-   `CONVERTED_DIR`: Directory path for storing successfully converted videos. (Default: `converted`)

**Setting Environment Variables:**

(Examples for Linux/macOS)
```bash
export GOOGLE_DRIVE_API_KEY='YOUR_ACTUAL_API_KEY'
export ALLOWED_ORIGINS='https://your-frontend-domain.com,http://localhost:3000' # Adjust as needed
export PORT='8080' # Optional: Override default port
# Add others as needed...
```
