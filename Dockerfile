# Multi-stage Dockerfile for Video Converter Application
# This builds both frontend and backend in a single container leveraging BuildKit caching

# Stage 1: Build Frontend
FROM node:lts-alpine@sha256:4f696fbf39f383c1e486030ba6b289a5d9af541642fc78ab197e584a113b9c03 AS frontend-builder

# ARG is scoped to this build stage for clarity
ARG PNPM_VERSION="10.28.2"

WORKDIR /app

# Install pnpm
RUN --mount=type=cache,target=/root/.npm npm install -g pnpm@${PNPM_VERSION}

# Cache directory used by pnpm to avoid re-downloading packages across builds
ENV PNPM_HOME=/root/.local/share/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"

# Copy workspace manifests first to leverage Docker layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json ./frontend/

# Install only the frontend workspace dependencies using the single lockfile
RUN --mount=type=cache,target=/root/.local/share/pnpm/store/v3 \
    pnpm install --filter ./frontend --frozen-lockfile

# Copy frontend source
COPY frontend/ ./frontend/

# Build frontend from the workspace root
RUN pnpm --filter ./frontend run build

# Stage 2: Build Backend
FROM golang:1.26.0-alpine@sha256:d4c4845f5d60c6a974c6000ce58ae079328d03ab7f721a0734277e69905473e5 AS backend-builder

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
FROM alpine:3.23.3@sha256:25109184c71bdad752c8312a8623239686a9a2071e8825f20acb8f2198c3f659

# Install only necessary runtime dependencies
RUN apk add --no-cache \
    ffmpeg \
    exiftool \
    ca-certificates \
    tzdata \
    curl \
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

# Copy entrypoint script with explicit root ownership for security
COPY --chown=root:root docker/entrypoint.sh /entrypoint.sh
RUN chmod 755 /entrypoint.sh

# Expose the application port
EXPOSE 3000

# Set default environment variables
ENV PORT=3000 \
    UPLOADS_DIR=/app/uploads \
    CONVERTED_DIR=/app/converted

# Run the application via entrypoint (drops privileges to converter)
ENTRYPOINT ["/entrypoint.sh"]
CMD ["/app/video-converter-app"]
