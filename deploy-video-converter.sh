#!/bin/bash

# === Configuration ===
# --- GitHub ---
GITHUB_URL="https://github.com"
GITHUB_REPO="gatanasi/video-converter"

# --- Application ---
INSTALL_DIR="/opt/video-converter"
BINARY_NAME="video-converter-app"
FRONTEND_ZIP_NAME="frontend-dist.zip"
FRONTEND_DIR="$INSTALL_DIR/static"

# --- System ---
SERVICE_NAME="video-converter.service"    # Name of the systemd service
SERVICE_USER="converter"                  # User the service runs as (must exist)
SERVICE_GROUP="converter"                 # Group the service runs as (must exist, often same as user)
# === End Configuration ===

# --- Script Safety ---
set -e # Exit immediately if a command exits with a non-zero status.
set -o pipefail # Causes pipelines to fail on the first command that fails

# --- Check for required tools ---
command -v wget >/dev/null 2>&1 || { echo >&2 "Error: 'wget' is required but not installed. Aborting."; exit 1; }
command -v sudo >/dev/null 2>&1 || { echo >&2 "Error: 'sudo' is required but not installed. Aborting."; exit 1; }
command -v systemctl >/dev/null 2>&1 || { echo >&2 "Error: 'systemctl' is required but not installed. Aborting."; exit 1; }
command -v unzip >/dev/null 2>&1 || { echo >&2 "Error: 'unzip' is required but not installed. Aborting."; exit 1; }
command -v mktemp >/dev/null 2>&1 || { echo >&2 "Error: 'mktemp' is required but not installed. Aborting."; exit 1; }

# --- Argument Check ---
if [ -z "$1" ]; then
  echo "Usage: $0 <version_tag>"
  echo "Example: $0 v1.0.1"
  exit 1
fi

VERSION_TAG="$1"
BINARY_PATH="$INSTALL_DIR/$BINARY_NAME"
DOWNLOAD_DIR=""

# --- Cleanup Function ---
# Ensures the temporary download directory is removed on script exit (success or failure)
cleanup() {
  if [ -n "$DOWNLOAD_DIR" ] && [ -d "$DOWNLOAD_DIR" ]; then
    echo "Cleaning up temporary directory: $DOWNLOAD_DIR"
    rm -rf "$DOWNLOAD_DIR"
  fi
}
trap cleanup EXIT

# --- Create Temporary Directory ---
DOWNLOAD_DIR=$(mktemp -d -t video-converter-deploy-XXXXXX)
echo "Created temporary directory: $DOWNLOAD_DIR"

echo "--- Starting Deployment for Version: $VERSION_TAG ---"

# --- Construct Download URLs ---
BASE_RELEASE_URL="$GITHUB_URL/$GITHUB_REPO/releases/download/$VERSION_TAG"
BINARY_URL="$BASE_RELEASE_URL/$BINARY_NAME"
FRONTEND_ZIP_URL="$BASE_RELEASE_URL/$FRONTEND_ZIP_NAME"

# --- Download Release Artifacts using wget ---
echo "Downloading artifacts for tag '$VERSION_TAG' from repo '$GITHUB_REPO' using wget..."

# Download Backend Binary
echo "Downloading backend: '$BINARY_NAME' from $BINARY_URL"
if ! wget -q -O "$DOWNLOAD_DIR/$BINARY_NAME" "$BINARY_URL"; then
    echo >&2 "Error: Failed to download backend artifact '$BINARY_NAME' using wget. Check URL, tag, artifact name, and network connection."
    # Clean up potentially partially downloaded file
    rm -f "$DOWNLOAD_DIR/$BINARY_NAME"
    exit 1
fi
echo "Backend downloaded successfully."

# Download Frontend Archive
echo "Downloading frontend: '$FRONTEND_ZIP_NAME' from $FRONTEND_ZIP_URL"
if ! wget -q -O "$DOWNLOAD_DIR/$FRONTEND_ZIP_NAME" "$FRONTEND_ZIP_URL"; then
    echo >&2 "Error: Failed to download frontend artifact '$FRONTEND_ZIP_NAME' using wget. Check URL, tag, artifact name, and network connection."
    # Clean up potentially partially downloaded file
    rm -f "$DOWNLOAD_DIR/$FRONTEND_ZIP_NAME"
    exit 1
fi
echo "Frontend downloaded successfully."

# Verify downloads
if [ ! -f "$DOWNLOAD_DIR/$BINARY_NAME" ]; then
    echo >&2 "Error: Backend binary '$BINARY_NAME' not found in download directory after wget attempt."
    exit 1
fi
if [ ! -f "$DOWNLOAD_DIR/$FRONTEND_ZIP_NAME" ]; then
    echo >&2 "Error: Frontend zip '$FRONTEND_ZIP_NAME' not found in download directory after wget attempt."
    exit 1
fi

# --- Stop Service ---
echo "Stopping service '$SERVICE_NAME'..."
sudo systemctl stop "$SERVICE_NAME"

# --- Deploy Backend ---
echo "Replacing old backend binary at '$BINARY_PATH'..."
sudo mv -f "$DOWNLOAD_DIR/$BINARY_NAME" "$BINARY_PATH"
echo "Setting backend permissions..."
sudo chown "$SERVICE_USER":"$SERVICE_GROUP" "$BINARY_PATH"
sudo chmod 755 "$BINARY_PATH"

# --- Deploy Frontend ---
echo "Updating frontend assets in '$FRONTEND_DIR'..."
if [ ! -d "$FRONTEND_DIR" ]; then
    echo "Frontend directory '$FRONTEND_DIR' does not exist. Creating it..."
    sudo mkdir -p "$FRONTEND_DIR"
    sudo chown "$SERVICE_USER":"$SERVICE_GROUP" "$FRONTEND_DIR"
fi

echo "Removing old frontend files..."
if [ -n "$(ls -A $FRONTEND_DIR)" ]; then
    sudo find "$FRONTEND_DIR" -mindepth 1 -delete
else
    echo "Frontend directory is already empty. Skipping removal."
fi

echo "Unzipping new frontend files..."
sudo unzip -o "$DOWNLOAD_DIR/$FRONTEND_ZIP_NAME" -d "$FRONTEND_DIR"

echo "Setting frontend permissions..."
sudo chown -R "$SERVICE_USER":"$SERVICE_GROUP" "$FRONTEND_DIR"

sudo find "$FRONTEND_DIR" -type d -exec chmod 755 {} \;
sudo find "$FRONTEND_DIR" -type f -exec chmod 644 {} \;

# --- Start Service ---
echo "Starting service '$SERVICE_NAME'..."
sudo systemctl start "$SERVICE_NAME"

# --- Check Status (Optional but Recommended) ---
echo "Checking service status (waiting 3 seconds)..."
sleep 3
if ! sudo systemctl is-active --quiet "$SERVICE_NAME"; then
    echo >&2 "Warning: Service '$SERVICE_NAME' failed to start or is not active after deployment."
    sudo systemctl status "$SERVICE_NAME" --no-pager || true
    exit 1
else
    echo "Service '$SERVICE_NAME' started successfully."
    sudo systemctl status "$SERVICE_NAME" --no-pager
fi


echo "--- Deployment of Version $VERSION_TAG Completed ---"

exit 0
