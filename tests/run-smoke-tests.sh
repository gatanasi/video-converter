#!/bin/bash

# Smoke Test Runner Script
# This script manages the Docker container lifecycle and runs smoke tests

set -euo pipefail

# Resolve repository root to keep path handling consistent
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$REPO_ROOT"

# Configuration
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.dev.yml}"
CONTAINER_NAME="${CONTAINER_NAME:-video-converter-dev}"
BASE_URL="${BASE_URL:-http://localhost:3000}"
CLEANUP="${CLEANUP:-true}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

cleanup() {
  if [ "$CLEANUP" = "true" ]; then
    log_info "Cleaning up Docker resources..."
    docker compose -f "$COMPOSE_FILE" down -v || true
    log_success "Cleanup complete"
  else
    log_warn "Skipping cleanup (CLEANUP=false)"
  fi
}

# Set up trap for cleanup on exit
trap cleanup EXIT

main() {
  log_info "Starting Video Converter Smoke Tests"
  log_info "Using compose file: $COMPOSE_FILE"
  log_info "Base URL: $BASE_URL"
  echo ""

  # Ensure required env defaults are present for the container
  export GOOGLE_DRIVE_API_KEY="${GOOGLE_DRIVE_API_KEY:-test-api-key}"
  export ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-*}"

  if ! command -v pnpm >/dev/null 2>&1; then
    log_error "pnpm is required but not installed."
    exit 1
  fi

  # Check if Docker is running
  if ! docker info > /dev/null 2>&1; then
    log_error "Docker is not running. Please start Docker and try again."
    exit 1
  fi

  # Stop any existing containers
  log_info "Stopping any existing containers..."
  docker compose -f "$COMPOSE_FILE" down -v || true

  # Build and start the container
  log_info "Building and starting Docker container..."
  if ! docker compose -f "$COMPOSE_FILE" up -d --build; then
    log_error "Failed to start Docker container"
    exit 1
  fi

  log_success "Docker container started"
  echo ""

  # Wait for the container to be healthy
  log_info "Waiting for container to become healthy..."
  MAX_WAIT=120
  INTERVAL=2
  ELAPSED=0
  while ! curl -sf "$BASE_URL/api/config" > /dev/null; do
    if [ $ELAPSED -ge $MAX_WAIT ]; then
      log_error "Container did not become healthy within $MAX_WAIT seconds."
      log_info "Container logs:"
      docker compose -f "$COMPOSE_FILE" logs --tail=50
      exit 1
    fi
    sleep $INTERVAL
    ELAPSED=$((ELAPSED + INTERVAL))
    echo -n "."
  done
  echo ""
  log_success "Container is healthy and ready for tests."
  echo ""

  # Check if container is running
  if ! docker ps -q --filter "name=^/${CONTAINER_NAME}$" | grep -q .; then
    log_error "Container is not running"
    log_info "Container logs:"
    docker compose -f "$COMPOSE_FILE" logs
    exit 1
  fi

  log_success "Container is running"
  echo ""

  # Install test dependencies to match lockfile exactly
  log_info "Installing smoke test workspace dependencies..."
  pnpm install --filter smoke-tests --frozen-lockfile
  log_success "Dependencies installed"
  echo ""

  # Run smoke tests
  log_info "Running smoke tests..."
  echo ""
  
  export BASE_URL
  if pnpm --filter smoke-tests test; then
    log_success "All smoke tests passed!"
    exit 0
  else
    log_error "Smoke tests failed"
    echo ""
    log_info "Container logs:"
    docker compose -f "$COMPOSE_FILE" logs --tail=50
    exit 1
  fi
}

# Run main function
main
