# GitHub Actions Workflows

Automated CI/CD workflows that build and publish Docker images to GitHub Container Registry (GHCR).

## Workflows Overview

### CI Workflow (`ci.yml`)
- **Trigger**: Every push to a branch other than `main`, and every pull request targeting `main`. There is no `paths:` filter: `main` requires these checks, and a required check that never reports blocks a PR forever. `build-jobs.yml` does the filtering instead, skipping the frontend and backend suites when nothing relevant changed.
- **Actions**: Lints, tests, and validates Docker build (doesn't push to registry)

### Release Workflow (`release.yml`)
- **Trigger**: Push to `main`, or manual dispatch from the GitHub Actions UI
- **Actions**: Builds `linux/amd64` Docker images and pushes to GHCR, creates GitHub Release

**To create a release:**
1. Go to **Actions** → **Video Converter - Release** → **Run workflow**
2. Choose branch and version options
3. Workflow builds, tests, tags, and publishes Docker images

### Build Jobs (`build-jobs.yml`)
Reusable workflow used by CI and Release workflows.
It now verifies package installs via the root `pnpm-lock.yaml`, so every caller benefits from the single workspace lockfile and avoids drift from per-package installs.

## Docker Images

Published to: `ghcr.io/gatanasi/video-converter`

**Tags created per release:**
- `latest` - Latest stable
- `1.0.0` - Specific version
- `1.0` - Latest 1.0.x patch
- `1` - Latest 1.x.x

**Platforms:** `linux/amd64`

## Permissions

Workflows require:
- `contents: write` - Create releases and tags
- `packages: write` - Push to GHCR

## Making Images Public

By default, GHCR images are private:
1. Go to: `github.com/gatanasi/video-converter/pkgs/container/video-converter`
2. Package settings → Change visibility to Public
