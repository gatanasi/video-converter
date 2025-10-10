# Multi-stage Dockerfile for Video Converter Application
# This builds both frontend and backend in a single container

# Stage 1: Build Frontend
FROM node:20-alpine@sha256:1ab6fc5a31d515dc7b6b25f6acfda2001821f2c2400252b6cb61044bd9f9ad48 AS frontend-builder

WORKDIR /app/frontend

# Install pnpm
RUN npm install -g pnpm@10.18.1

# Copy frontend package files
COPY frontend/package.json frontend/pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy frontend source
COPY frontend/ ./

# Build frontend
RUN pnpm run build

# Stage 2: Build Backend
FROM golang:1.24-alpine@sha256:7342d2571d7e5f75ba18b0adba39a62bac193642548a0d59c23c4ec46f82a01d AS backend-builder

WORKDIR /app/backend

# Install build dependencies
RUN apk add --no-cache git

# Copy go mod files
COPY backend/go.mod backend/go.sum* ./

# Download dependencies
RUN go mod download

# Copy backend source
COPY backend/ ./

# Build the Go binary
RUN CGO_ENABLED=0 GOOS=linux go build \
    -ldflags="-s -w -X main.version=${VERSION:-docker}" \
    -o /video-converter-app \
    ./cmd/server/main.go

# Stage 3: Final Runtime Image
FROM alpine:latest@sha256:4b7ce07002c69e8f3d704a9c5d6fd3053be500b7f1c69fc0d80990c2ad8dd412

# Install runtime dependencies: FFmpeg, ExifTool, and CA certificates
RUN apk add --no-cache \
    ffmpeg \
    exiftool \
    ca-certificates \
    tzdata

# Create a non-root user for running the application
RUN addgroup -g 1000 converter && \
    adduser -D -u 1000 -G converter converter

# Set working directory
WORKDIR /app

# Create necessary directories
RUN mkdir -p /app/static /app/uploads /app/converted && \
    chown -R converter:converter /app

# Copy the built backend binary from backend-builder stage
COPY --from=backend-builder --chown=converter:converter /video-converter-app /app/video-converter-app

# Copy the built frontend assets from frontend-builder stage
COPY --from=frontend-builder --chown=converter:converter /app/frontend/dist /app/static

# Switch to non-root user
USER converter

# Expose the application port (default 3000)
EXPOSE 3000

# Set default environment variables
ENV PORT=3000 \
    UPLOADS_DIR=/app/uploads \
    CONVERTED_DIR=/app/converted

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/api/config || exit 1

# Run the application
CMD ["/app/video-converter-app"]
