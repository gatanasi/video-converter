# Docker Reference

This document provides Docker-specific commands and troubleshooting tips. For deployment instructions, see the main [README.md](README.md).

## Building Images Locally

```bash
# Build with default settings
docker build -t video-converter:local .

# Build with specific version
docker build --build-arg VERSION=1.0.0 -t video-converter:1.0.0 .

# Build with docker compose
docker compose build
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

### Data Persistence
The following volumes should be backed up regularly:
- `./uploads` - Temporary uploaded files
- `./converted` - Converted video files

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
