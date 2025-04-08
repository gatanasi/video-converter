# Video Converter Web App

A simple web application that allows users to fetch videos from Google Drive, convert them to different formats using FFmpeg, and download the converted files.

## Features

- Import videos from Google Drive using the Google Drive API
- Convert videos to various formats (MP4, MOV, AVI)
- Download the converted videos
- Browse and manage previously converted videos
- Real-time conversion progress tracking

## Prerequisites

Before running the application, make sure you have the following installed:

- [Go](https://golang.org/dl/) (v1.18 or newer)
- [FFmpeg](https://ffmpeg.org/download.html) - Must be available in your system PATH

## Installation

1. Clone the repository or download the source code
2. No external dependencies needed beyond the Go standard library

## Running the Application

1. Build and start the server:

```bash
go build -o video-converter main.go
./video-converter
```

2. Open your browser and navigate to:

```
http://localhost:3000
```

## How to Use

1. Configure Google Drive access:
   - Create a project in the [Google Cloud Console](https://console.cloud.google.com/)
   - Enable the Google Drive API
   - Create an API key with access to the Google Drive API
   - Enter your API key in the application

2. Enter your Google Drive folder ID or URL
   - The folder must be publicly shared with "Anyone with the link"

3. Click "Fetch Videos" to list videos from your Google Drive folder

4. Select a video from the list

5. Choose your desired output format (MOV, MP4, or AVI)

6. Click "Convert Video" to start the conversion process

7. Monitor real-time conversion progress

8. When conversion is complete, click "Download Converted Video" to save the file

9. Use the "Previous Conversions" tab to access or delete previously converted videos

## Technical Details

- Frontend: HTML, CSS, JavaScript
- Backend: Go
- Video conversion: FFmpeg (executed as subprocess)
- Google Drive integration: Google Drive API v3

## Folder Structure

- `/uploads` - Temporary storage for downloaded videos from Google Drive
- `/converted` - Storage for converted videos (automatically cleaned up after 24 hours)

## Limitations

- By default, the maximum file size is limited to 2GB
- The application currently doesn't support advanced FFmpeg conversion options
- Videos must be publicly accessible from Google Drive

## License

This project is licensed under the MIT License - see the LICENSE file for details.
