#!/bin/bash

set -euo pipefail

CONTAINER_NAME="monke-say-db-1"
DB_USER="postgres"
DB_NAME="monke_say"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUTPUT_FILE="local_dump_${TIMESTAMP}.sql"

echo "Dumping local database from container ${CONTAINER_NAME}..."
docker exec "$CONTAINER_NAME" pg_dump -U "$DB_USER" -d "$DB_NAME" > "$OUTPUT_FILE"

echo "Saved to ${OUTPUT_FILE} ($(du -h "$OUTPUT_FILE" | cut -f1))"
