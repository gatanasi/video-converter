# Video Converter

Convert videos from Google Drive to different formats with a simple web interface.

> 📖 **[User Guide](#)** (you're here) · **[Development Setup](CONTRIBUTING.md)** · **[Docker Reference](DOCKER.md)**

## ✨ Features

- 📁 Browse and select videos from Google Drive folders
- 🎬 Convert to MP4 or MOV formats with quality presets
- 🔄 Reverse videos and remove audio
- 📊 Real-time conversion progress tracking
- 💾 Download and manage converted files
- 🐳 Ready-to-deploy Docker images

## 🚀 Quick Start

### Prerequisites

- Docker and Docker Compose ([install here](https://docs.docker.com/get-docker/))
- Google Drive API key ([get one here](#getting-a-google-drive-api-key))

### Deploy on Your Server

```bash
# 1. Create a directory for the app
mkdir video-converter && cd video-converter

# 2. Download docker-compose.yml
curl -LO https://github.com/gatanasi/video-converter/releases/latest/download/docker-compose.yml

# 3. Create .env file with your settings
cat > .env << 'EOF'
GOOGLE_DRIVE_API_KEY=your_api_key_here
ALLOWED_ORIGINS=http://your-server-ip:3000
VERSION=latest
EOF

# 4. Start the application
docker compose up -d

# 5. Access at http://your-server-ip:3000
```

### View Logs

```bash
docker compose logs -f
```

### Stop the Application

```bash
docker compose down
```

### Update to Latest Version

```bash
docker compose pull
docker compose up -d
```

## ⚙️ Configuration

Create a `.env` file with these settings:

### Required

| Variable | Description |
|----------|-------------|
| `GOOGLE_DRIVE_API_KEY` | Your Google Drive API key (see below) |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed URLs (e.g., `http://localhost:3000,https://converter.example.com`) |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `VERSION` | `latest` | Docker image version (e.g., `1.2.3`) |
| `HOST_PORT` | `3000` | Port to expose on host machine |
| `WORKER_COUNT` | CPU cores | Number of concurrent conversions |
| `MAX_FILE_SIZE_MB` | `2000` | Maximum file size in MB |
| `DEFAULT_DRIVE_FOLDER_ID` | - | Pre-fill a default Google Drive folder |

### Example .env

```bash
GOOGLE_DRIVE_API_KEY=AIzaSyD...your-key-here
ALLOWED_ORIGINS=https://converter.example.com
VERSION=latest
WORKER_COUNT=4
```

## 🔑 Getting a Google Drive API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable the **Google Drive API**:
   - Go to "APIs & Services" → "Library"
   - Search for "Google Drive API"
   - Click "Enable"
4. Create credentials:
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "API Key"
   - Copy the generated key
5. **(Recommended)** Restrict the API key:
   - Click on the key to edit
   - Under "API restrictions", select "Restrict key"
   - Choose "Google Drive API"
   - Optionally add IP restrictions

## 🌐 Production Deployment

### With HTTPS (Recommended)

For production, use a reverse proxy like nginx or Caddy:

**Example nginx config:**
```nginx
server {
    listen 443 ssl;
    server_name converter.example.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Then update your `.env`:
```bash
ALLOWED_ORIGINS=https://converter.example.com
```

### Specify Version

Instead of `latest`, pin to a specific version:

```bash
VERSION=1.2.3 docker compose up -d
```

View all versions: [Releases](https://github.com/gatanasi/video-converter/releases)

## 🛠️ Advanced Usage

### Using Docker Directly (without compose)

```bash
docker run -d \
  --name video-converter \
  -p 3000:3000 \
  -e GOOGLE_DRIVE_API_KEY="your_api_key" \
  -e ALLOWED_ORIGINS="http://localhost:3000" \
  -v ./uploads:/app/uploads \
  -v ./converted:/app/converted \
  ghcr.io/gatanasi/video-converter:latest
```

## 📚 Additional Documentation

- **[CONTRIBUTING.md](CONTRIBUTING.md)** - Development setup, building from source, submitting PRs
- **[DOCKER.md](DOCKER.md)** - Advanced Docker commands and troubleshooting
- **[Releases](https://github.com/gatanasi/video-converter/releases)** - Version history and changelogs

## 🤝 Contributing

Want to contribute? Check out [CONTRIBUTING.md](CONTRIBUTING.md) for:
- Local development setup
- Building from source
- Testing and code style
- Submitting pull requests

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🔗 Links

- **Issues**: [Report bugs or request features](https://github.com/gatanasi/video-converter/issues)
- **Docker Images**: [ghcr.io/gatanasi/video-converter](https://github.com/gatanasi/video-converter/pkgs/container/video-converter)
