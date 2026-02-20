#!/bin/sh
set -e

# Create data directory if it doesn't exist
mkdir -p /app/data

# Run database migrations
echo "Running database migrations..."
cd /app && pnpm db:migrate

# Start the application
echo "Starting application..."
exec node server.js
