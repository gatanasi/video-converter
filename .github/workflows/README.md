# GitHub Actions Workflows

Automated CI/CD workflows that build and publish Docker images to GitHub Container Registry (GHCR).

## Workflows Overview

### CI Workflow (`ci.yml`)
- **Trigger**: Push to any branch (when frontend, backend, or Docker files change)
- **Actions**: Lints, tests, and validates Docker build (doesn't push to registry)

### Release Workflow (`release.yml`)
- **Trigger**: Manual dispatch from GitHub Actions UI
- **Actions**: Builds multi-platform Docker images and pushes to GHCR, creates GitHub Release

**To create a release:**
1. Go to **Actions** → **Video Converter - Release** → **Run workflow**
2. Choose branch and version options
3. Workflow builds, tests, tags, and publishes Docker images

### Build Jobs (`build-jobs.yml`)
Reusable workflow used by CI and Release workflows.

## Docker Images

Published to: `ghcr.io/gatanasi/video-converter`

**Tags created per release:**
- `latest` - Latest stable
- `1.0.0` - Specific version
- `1.0` - Latest 1.0.x patch
- `1` - Latest 1.x.x

**Platforms:** `linux/amd64`, `linux/arm64`

## Permissions

Workflows require:
- `contents: write` - Create releases and tags
- `packages: write` - Push to GHCR

## Making Images Public

By default, GHCR images are private:
1. Go to: `github.com/gatanasi/video-converter/pkgs/container/video-converter`
2. Package settings → Change visibility to Public
