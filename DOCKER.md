# Docker Reference

This document provides Docker-specific commands and troubleshooting tips for the Video Converter application.

## For End Users

If you're just looking to run the application, see the [README.md](README.md) for simple deployment instructions.

## For Developers

If you're contributing to the project, see [CONTRIBUTING.md](CONTRIBUTING.md) for local development setup.

---

## Using Pre-built Images

The application is distributed via GitHub Container Registry (GHCR). Images are available for `linux/amd64` and `linux/arm64` platforms.

```bash
# Pull latest version
docker pull ghcr.io/gatanasi/video-converter:latest

# Pull specific version
docker pull ghcr.io/gatanasi/video-converter:1.2.3

# Run with docker compose (recommended)
docker compose up -d
```

## Building Images Locally

For development or customization:

```bash
For development or customization:

```bash
# Use the development compose file (recommended for developers)
docker compose -f docker-compose.dev.yml up -d --build

# Or build manually
docker build -t video-converter:local .

# Build with specific version
docker build --build-arg VERSION=1.0.0 -t video-converter:1.0.0 .

# Build with docker compose
# First, edit docker-compose.yml to uncomment the 'build' section
docker compose build

# Or use the --build flag
docker compose up -d --build
```

## Switching Between Pre-built and Local Images

The `docker-compose.yml` file is configured to use pre-built images by default. To build locally:

1. **Edit `docker-compose.yml`**:
   ```yaml
   # Comment out the image line
   # image: ghcr.io/gatanasi/video-converter:${VERSION:-latest}
   
   # Uncomment the build section
   build:
     context: .
     args:
       VERSION: ${VERSION:-docker}
   ```

2. **Build and run**:
   ```bash
   docker compose up -d --build
   ```

## Running Containers

```bash
# Using docker compose (recommended)
docker compose up -d          # Start in background
docker compose logs -f        # View logs
docker compose ps             # Check status
docker compose down           # Stop and remove
docker compose down -v        # Stop and remove with volumes

# Using docker directly
docker run -d \
  --name video-converter \
  -p 3000:3000 \
  -e GOOGLE_DRIVE_API_KEY="your_key" \
  -e ALLOWED_ORIGINS="*" \
  -v $(pwd)/uploads:/app/uploads \
  -v $(pwd)/converted:/app/converted \
  video-converter:local
```

## Troubleshooting

### Volume Permissions

The application runs as a non-root user (`converter`, UID 1000) for security. The entrypoint script automatically ensures the volume directories have the correct ownership.

**You don't need to manually create directories** - the entrypoint will handle this automatically when the container starts.

If you've manually created the `uploads` or `converted` directories and encounter permission errors:

```bash
# Fix ownership (Linux/macOS)
sudo chown -R 1000:1000 uploads converted

# Or let Docker recreate them
docker compose down -v
docker compose up -d
```

### View Container Logs
```bash
docker compose logs -f video-converter
# or
docker logs -f video-converter
```

### Execute Commands Inside Container
```bash
docker compose exec video-converter sh
# or
docker exec -it video-converter sh
```

### Verify Dependencies
```bash
# Check FFmpeg
docker compose exec video-converter ffmpeg -version

# Check ExifTool
docker compose exec video-converter exiftool -ver
```

### Check Health Status
```bash
docker ps                     # Shows health status
docker compose ps             # Shows health status
docker inspect video-converter --format='{{.State.Health.Status}}'
```

### Restart Application
```bash
docker compose restart
# or
docker restart video-converter
```

### Rebuild After Code Changes
```bash
docker compose up -d --build
```

### Clean Up
```bash
# Remove container and volumes
docker compose down -v

# Remove unused images
docker image prune -a

# Full cleanup
docker system prune -a --volumes
```

## Production Considerations

### Resource Limits
Add to `docker-compose.yml`:
```yaml
services:
  video-converter:
    deploy:
      resources:
        limits:
          cpus: '4'
          memory: 4G
```

### Reverse Proxy Setup
Example nginx configuration:
```nginx
server {
    listen 80;
    server_name converter.example.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Multi-Platform Images

Images are built for:
- `linux/amd64` (Intel/AMD x86_64)
- `linux/arm64` (ARM64/Apple Silicon)

Docker automatically pulls the correct architecture for your system.

## Image Details

- **Base**: Alpine Linux (minimal footprint)
- **Size**: ~150-200MB (includes FFmpeg and ExifTool)
- **User**: Non-root user `converter` (UID 1000, GID 1000)
- **Ports**: 3000 (configurable via PORT env var)
- **Health Check**: Pings `/api/config` every 30s
