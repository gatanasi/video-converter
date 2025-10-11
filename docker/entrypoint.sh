#!/bin/sh
set -eu

UPLOADS_DIR=${UPLOADS_DIR:-/app/uploads}
CONVERTED_DIR=${CONVERTED_DIR:-/app/converted}

for dir in "$UPLOADS_DIR" "$CONVERTED_DIR"; do
	mkdir -p "$dir"
	chown converter:converter "$dir"
done

exec su-exec converter "$@"