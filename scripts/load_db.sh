#!/bin/bash

set -euo pipefail

SSH_HOST="monkesay-deploy"
CONTAINER_NAME="monke-say-db-1"

if [ $# -eq 0 ]; then
	echo "Usage: $0 <sql_file>"
	exit 1
fi

SQL_FILE="$1"

if [ ! -f "$SQL_FILE" ]; then
	echo "Error: file '$SQL_FILE' not found"
	exit 1
fi

# Read DB credentials from production .env
DB_USER=$(ssh "$SSH_HOST" "grep '^POSTGRES_USER=' ~/monke-say/.env | cut -d= -f2 | tr -d '[:space:]'")
DB_NAME=$(ssh "$SSH_HOST" "grep '^POSTGRES_DB=' ~/monke-say/.env | cut -d= -f2 | tr -d '[:space:]'")

if [ -z "$DB_USER" ] || [ -z "$DB_NAME" ]; then
	echo "Error: could not read POSTGRES_USER or POSTGRES_DB from production .env"
	exit 1
fi

echo "Target: ${SSH_HOST} → ${CONTAINER_NAME} (user: ${DB_USER}, db: ${DB_NAME})"

echo "Dropping and recreating database ${DB_NAME}..."
ssh "$SSH_HOST" "docker exec $CONTAINER_NAME psql -U $DB_USER -d postgres -c 'DROP DATABASE IF EXISTS ${DB_NAME};'"
ssh "$SSH_HOST" "docker exec $CONTAINER_NAME psql -U $DB_USER -d postgres -c 'CREATE DATABASE ${DB_NAME};'"

echo "Loading ${SQL_FILE} into production database..."
ssh "$SSH_HOST" "docker exec -i $CONTAINER_NAME psql -U $DB_USER -d $DB_NAME" < "$SQL_FILE"

echo "Done. Loaded $(du -h "$SQL_FILE" | cut -f1) into ${DB_NAME} on ${SSH_HOST}."
