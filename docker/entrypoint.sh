#!/bin/sh
set -eu

UPLOADS_DIR=${UPLOADS_DIR:-/app/uploads}
CONVERTED_DIR=${CONVERTED_DIR:-/app/converted}

# Validate and setup directories
for dir in "$UPLOADS_DIR" "$CONVERTED_DIR"; do
	# Resolve to absolute path and validate it's within /app/
	absdir=$(cd / && cd "$(dirname "$dir")" && pwd)/$(basename "$dir")
	case "$absdir" in
		/app/*)
			;;
		*)
			echo "Error: Directory '$absdir' is outside /app/. Aborting for security." >&2
			exit 1
			;;
	esac
	mkdir -p "$absdir"
	chown converter:converter "$absdir"
done

exec su-exec converter "$@"