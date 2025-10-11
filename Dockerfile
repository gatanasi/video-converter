# Multi-stage Dockerfile for Video Converter Application
# This builds both frontend and backend in a single container leveraging BuildKit caching

# Stage 1: Build Frontend
FROM node:22-alpine@sha256:dbcedd8aeab47fbc0f4dd4bffa55b7c3c729a707875968d467aaaea42d6225af AS frontend-builder

# ARG is scoped to this build stage for clarity
ARG PNPM_VERSION="10.18.2"

WORKDIR /app/frontend

# Install pnpm
RUN --mount=type=cache,target=/root/.npm npm install -g pnpm@${PNPM_VERSION}

# Cache directory used by pnpm to avoid re-downloading packages across builds
ENV PNPM_HOME=/root/.local/share/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"

# Copy frontend package files to leverage Docker layer caching
COPY frontend/package.json frontend/pnpm-lock.yaml ./

# Install dependencies using the lockfile
RUN --mount=type=cache,target=/root/.local/share/pnpm/store/v3 pnpm install --frozen-lockfile

# Copy frontend source
COPY frontend/ ./

# Build frontend
RUN pnpm run build

# Stage 2: Build Backend
FROM golang:1.25-alpine@sha256:06cdd34bd531b810650e47762c01e025eb9b1c7eadd191553b91c9f2d549fae8 AS backend-builder

# ARG is scoped to this build stage
ARG VERSION="docker"

WORKDIR /app/backend

# Set build environment for a static binary
ENV CGO_ENABLED=0
ENV GOOS=linux

# Copy go mod files to leverage layer caching
COPY backend/go.mod backend/go.sum* ./

# Download dependencies
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go mod download

# Copy backend source
COPY backend/ ./

# Build the Go binary, stripping debug info for a smaller size
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go build \
    -ldflags="-s -w -X main.version=${VERSION}" \
    -o /video-converter-app \
    ./cmd/server/main.go

# Stage 3: Final Runtime Image
FROM alpine:latest@sha256:4b7ce07002c69e8f3d704a9c5d6fd3053be500b7f1c69fc0d80990c2ad8dd412

# Install only necessary runtime dependencies
RUN apk add --no-cache \
    ffmpeg \
    exiftool \
    ca-certificates \
    tzdata \
    wget \
    su-exec

# Create a non-root user and group for running the application
RUN addgroup -g 1000 converter && \
    adduser -D -u 1000 -G converter converter

WORKDIR /app

# Create necessary directories and set permissions in a single layer
RUN mkdir -p /app/static /app/uploads /app/converted && \
    chown -R converter:converter /app

# Copy the built backend binary from backend-builder stage
COPY --from=backend-builder --chown=converter:converter /video-converter-app /app/video-converter-app

# Copy the built frontend assets from frontend-builder stage
COPY --from=frontend-builder --chown=converter:converter /app/frontend/dist /app/static

# Copy entrypoint script
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Expose the application port
EXPOSE 3000

# Set default environment variables
ENV PORT=3000 \
    UPLOADS_DIR=/app/uploads \
    CONVERTED_DIR=/app/converted

# Run the application via entrypoint (drops privileges to converter)
ENTRYPOINT ["/entrypoint.sh"]
CMD ["/app/video-converter-app"]
