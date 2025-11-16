# Contributing to Video Converter

Thank you for your interest in contributing to the Video Converter project! This guide will help you set up your development environment and understand our development workflow.

## 📋 Table of Contents

- [Development Prerequisites](#development-prerequisites)
- [Local Development Setup](#local-development-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Testing](#testing)
- [Building Docker Images](#building-docker-images)
- [Code Style and Linting](#code-style-and-linting)
- [Commit Conventions](#commit-conventions)
- [CI/CD Pipeline](#cicd-pipeline)
- [Submitting Pull Requests](#submitting-pull-requests)

## Development Prerequisites

To develop this project locally, you'll need:

- **[Go](https://golang.org/dl/)** v1.18 or newer (tested with v1.25)
- **[Node.js](https://nodejs.org/)** and **[pnpm](https://pnpm.io/installation)** for frontend development
- **[FFmpeg](https://ffmpeg.org/download.html)** - Must be installed and accessible in your system's `PATH`
  - `ffprobe` (usually included with FFmpeg) is also required
- **[ExifTool](https://exiftool.org/install.html)** - Required for metadata preservation
- **[Docker](https://docs.docker.com/get-docker/)** and **[Docker Compose](https://docs.docker.com/compose/install/)** (optional, for container testing)
- **Git** for version control

## Local Development Setup

### 1. Clone the Repository

```bash
git clone https://github.com/gatanasi/video-converter.git
cd video-converter
```

### 2. Set Up Environment Variables

```bash
# Copy the example environment file
cp .env.example .env

# Edit .env and set your development values
vim .env
```

Example `.env` for development:
```dotenv
GOOGLE_DRIVE_API_KEY=your_dev_api_key_here
ALLOWED_ORIGINS=http://localhost:8080,http://127.0.0.1:8080
PORT=3000
WORKER_COUNT=2
MAX_FILE_SIZE_MB=500
```

### 3. Backend Setup

```bash
# Navigate to backend directory
cd backend

# Install Go dependencies
go mod download

# Option 1: Load environment variables and run
set -a; source ../.env; set +a
go run ./cmd/server/main.go

# Option 2: Set variables manually (for testing)
export GOOGLE_DRIVE_API_KEY="YOUR_DEV_API_KEY"
export ALLOWED_ORIGINS="http://localhost:8080"
export PORT="3000"
go run ./cmd/server/main.go
```

The backend server will start at `http://localhost:3000`.

### 4. Install JavaScript Dependencies

```bash
# From the repository root
pnpm install
```

> ℹ️ The workspace uses a single root-level `pnpm-lock.yaml`. Always install dependencies from the repository root so that the shared lockfile stays authoritative. Avoid running `pnpm install` inside `frontend/` or `tests/`.

### 5. Frontend Setup

Open a new terminal:

```bash
# Build the production bundle from the workspace root
pnpm --filter ./frontend run build

# Serve the built files (any static server works)
pnpm --filter ./frontend exec npx serve dist -l 8080
```

Open your browser to `http://localhost:8080`.

### 6. Frontend Development Mode

For active development with hot reload:

```bash
# Rebuild on changes from the workspace root
pnpm --filter ./frontend run build -- --watch
```

## Project Structure

```
video-converter/
├── backend/                 # Go backend
│   ├── cmd/
│   │   └── server/         # Main application entry point
│   ├── internal/
│   │   ├── api/            # HTTP handlers and routes
│   │   ├── config/         # Configuration management
│   │   ├── constants/      # Application constants
│   │   ├── conversion/     # Video conversion logic
│   │   ├── drive/          # Google Drive integration
│   │   ├── filestore/      # File storage management
│   │   ├── middleware/     # HTTP middleware (CORS, etc.)
│   │   ├── models/         # Data models
│   │   └── utils/          # Utility functions
│   └── go.mod             # Go dependencies
├── frontend/               # TypeScript frontend
│   ├── src/
│   │   ├── api/           # API client
│   │   ├── components/    # UI components
│   │   ├── config/        # Frontend configuration
│   │   ├── styles/        # CSS styles
│   │   ├── utils/         # Utility functions
│   │   ├── app.ts         # Main application
│   │   └── types.ts       # TypeScript types
│   ├── public/            # Static assets
│   └── package.json       # Node dependencies
├── docker/                # Docker-related files
├── .github/workflows/     # CI/CD workflows
├── Dockerfile            # Multi-stage Docker build
├── docker-compose.yml    # Docker Compose configuration
└── .env.example         # Environment variable template
```

## Development Workflow

### Running Backend Tests

```bash
cd backend
go test -v ./...

# With coverage
go test -v -cover ./...

# Specific package
go test -v ./internal/conversion
```

### Running Frontend Tests

```bash
cd frontend
pnpm test
```

### Linting

#### Backend (Go)

```bash
cd backend

# Check formatting
gofmt -l .

# Apply formatting
gofmt -w .

# Run golangci-lint (if installed)
golangci-lint run
```

#### Frontend (TypeScript)

```bash
cd frontend

# Run linter
pnpm run lint

# Fix auto-fixable issues
pnpm run lint:fix
```

## Building Docker Images

### Local Build and Test

```bash
# Option 1: Use the development compose file
docker compose -f docker-compose.dev.yml up -d --build

# Option 2: Build with default compose file (edit it first)
docker build -t video-converter:dev .

# Build with specific version
docker build --build-arg VERSION=dev-$(git rev-parse --short HEAD) -t video-converter:dev .

# Run locally built image
docker run -d -p 3000:3000 \
  -e GOOGLE_DRIVE_API_KEY="your_key" \
  -e ALLOWED_ORIGINS="*" \
  -v $(pwd)/uploads:/app/uploads \
  -v $(pwd)/converted:/app/converted \
  video-converter:dev

# Check logs
docker compose -f docker-compose.dev.yml logs -f

# Stop
docker compose -f docker-compose.dev.yml down

# Or with docker compose (if you edited docker-compose.yml)
docker compose build
docker compose up -d
```

### Test Multi-Platform Build

```bash
# Setup buildx (one-time)
docker buildx create --name multiplatform --use

# Build for multiple platforms
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t video-converter:multiplatform \
  --load \
  .
```

## Code Style and Linting

### Go Code Style

- Follow standard Go conventions (use `gofmt`)
- Use meaningful variable and function names
- Add comments for exported functions and types
- Keep functions focused and small
- Use early returns to reduce nesting
- Handle errors explicitly

### TypeScript Code Style

- Use TypeScript strict mode
- Follow consistent naming conventions (camelCase for variables, PascalCase for classes)
- Add JSDoc comments for complex functions
- Keep components modular and reusable
- Use async/await for asynchronous code

## Commit Conventions

This project uses [Conventional Commits](https://www.conventionalcommits.org/) for automated versioning and changelog generation.

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature (triggers minor version bump)
- `fix`: Bug fix (triggers patch version bump)
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Maintenance tasks, dependency updates
- `ci`: CI/CD pipeline changes

### Examples

```bash
feat(conversion): add support for WebM format

fix(drive): handle rate limiting errors correctly

docs(readme): update installation instructions

chore(deps): update Go to v1.25
```

### Breaking Changes

For breaking changes, add `BREAKING CHANGE:` in the footer:

```bash
feat(api): change response format for video list

BREAKING CHANGE: Video list API now returns data in { videos: [] } format
```

## CI/CD Pipeline

### Automated Workflows

1. **CI Workflow** (`.github/workflows/ci.yml`)
   - Runs on every push
   - Lints backend (golangci-lint) and frontend
   - Runs tests for both backend and frontend
   - Builds Docker image (validation only, doesn't push)

2. **Release Workflow** (`.github/workflows/release.yml`)
   - Triggered manually via GitHub Actions UI
   - Determines version using semantic-release
   - Runs full test suite
   - Builds multi-platform Docker images
   - Pushes to GitHub Container Registry (GHCR)
   - Creates GitHub Release with release notes

### Creating a Release

Releases are created by maintainers through GitHub Actions:

1. Go to **Actions** → **Video Converter - Release** → **Run workflow**
2. Configure options:
   - **Branch**: Branch to release from (usually `main`)
   - **Force release**: Override semantic versioning (optional)
   - **Manual version**: Specify version manually (e.g., `1.2.3`, `1.2.3-beta1`)

The workflow will:
- Analyze commits to determine the next version
- Run all tests and linting
- Build Docker images for `linux/amd64` and `linux/arm64`
- Push images to `ghcr.io/gatanasi/video-converter` with multiple tags
- Create a GitHub Release with auto-generated release notes

### Local Testing of CI

You can run CI checks locally before pushing:

```bash
# Backend linting and tests
cd backend
golangci-lint run
go test -v ./...

# Frontend tests
cd frontend
pnpm test

# Build Docker image (as CI does)
docker build -t video-converter:ci-test .
```

## Submitting Pull Requests

### Before Submitting

1. **Create a feature branch**
   ```bash
   git checkout -b feat/your-feature-name
   # or
   git checkout -b fix/your-bug-fix
   ```

2. **Make your changes**
   - Follow code style guidelines
   - Add tests for new features
   - Update documentation if needed

3. **Test your changes**
   ```bash
   # Run backend tests
   cd backend && go test -v ./...
   
   # Run frontend tests
   cd frontend && pnpm test
  
   # Run smoke tests (requires Docker)
   cd .. && pnpm test:smoke
   
   # Build and test Docker image
   docker build -t video-converter:test .
   docker run --rm video-converter:test
   ```

4. **Commit with conventional commit messages**
   ```bash
   git add .
   git commit -m "feat(conversion): add WebM format support"
   ```

5. **Push to your fork**
   ```bash
   git push origin feat/your-feature-name
   ```

### Pull Request Process

1. **Open a PR** against the `main` branch
2. **Fill out the PR template** with:
   - Description of changes
   - Related issues (if any)
   - Testing steps
   - Screenshots (if UI changes)

3. **Wait for CI checks** to pass
4. **Address review feedback** if requested
5. **Squash and merge** once approved

### PR Guidelines

- Keep PRs focused on a single feature or fix
- Write clear PR descriptions
- Include tests for new functionality
- Update documentation as needed
- Respond to review comments promptly
- Rebase on main if conflicts arise

## Getting Help

- **Issues**: [GitHub Issues](https://github.com/gatanasi/video-converter/issues)
- **Discussions**: [GitHub Discussions](https://github.com/gatanasi/video-converter/discussions)
- **Documentation**: Check [README.md](README.md) and [DOCKER.md](DOCKER.md)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
