# Docker Reference

This document provides Docker-specific commands and troubleshooting tips for the Video Converter application.

## For End Users

If you're just looking to run the application, see the [README.md](README.md) for simple deployment instructions.

## For Developers

If you're contributing to the project, see [CONTRIBUTING.md](CONTRIBUTING.md) for local development setup.

---

## Using Pre-built Images

The application is distributed via GitHub Container Registry (GHCR). Published images target the `linux/amd64` platform.

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
# Recommended: docker compose builds from source and tags it as the
# image configured in compose.yaml (see below)
docker compose up -d --build

# Or build manually
docker build -t video-converter:local .

# Build with specific version
docker build --build-arg VERSION=1.0.0 -t video-converter:1.0.0 .
```

## Switching Between Pre-built and Local Images

`compose.yaml` defines both `image` and `build`, which Docker Compose supports
simultaneously:

- `docker compose up -d` (no flag) uses the pre-built image from GHCR,
  pulling it if it isn't already present locally. This is what the Quick
  Start in [README.md](README.md) relies on.
- `docker compose up -d --build` (or `docker compose build`) always builds
  from the local source tree instead, tagging the result with the same
  `image:` name so the rest of the compose file (container name, health
  check, etc.) behaves identically either way.

No editing of `compose.yaml` is required to switch between the two.

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
Add to `compose.yaml`:
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

## Published Image Platform

Published images are built for:
- `linux/amd64` (Intel/AMD x86_64)

ARM64 systems need to run the amd64 image through platform emulation or build a local image for their architecture.

## Image Details

- **Base**: Alpine Linux (minimal footprint)
- **Size**: ~150-200MB (includes FFmpeg and ExifTool)
- **User**: Non-root user `converter` (UID 1000, GID 1000)
- **Ports**: 3000 (configurable via PORT env var)
- **Health Check**: Pings `/api/config` every 30s
