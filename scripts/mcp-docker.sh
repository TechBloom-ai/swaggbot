#!/bin/bash

# Swaggbot MCP Docker Wrapper
# This script is called by opencode to start the Swaggbot MCP server via Docker
# It handles the stdio transport required by the MCP protocol

set -e

# Colors for output (to stderr)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PROJECT_NAME="swaggbot"
SERVICE_NAME="swaggbot-mcp"

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Function to log messages to stderr
log() {
    echo -e "${GREEN}[Swaggbot MCP]${NC} $1" >&2
}

error() {
    echo -e "${RED}[Swaggbot MCP Error]${NC} $1" >&2
}

warn() {
    echo -e "${YELLOW}[Swaggbot MCP Warning]${NC} $1" >&2
}

# Check if Docker is running
check_docker() {
    if ! docker info >/dev/null 2>&1; then
        error "Docker is not running. Please start Docker and try again."
        exit 1
    fi
}

# Check if the image exists
check_image() {
    # Image name set explicitly in docker-compose.yml
    local image_name="swaggbot-mcp"
    if ! docker image inspect "${image_name}" >/dev/null 2>&1; then
        error "Docker image not found: ${image_name}"
        error "Please build the image first with: docker-compose build swaggbot-mcp"
        exit 1
    fi
}

# Load environment variables from .env file if it exists
load_env() {
    if [ -f "$PROJECT_ROOT/.env" ]; then
        log "Loading environment from .env file..."
        # Export variables from .env, ignoring comments and empty lines
        set -a
        source "$PROJECT_ROOT/.env"
        set +a
    else
        warn ".env file not found at $PROJECT_ROOT/.env"
        warn "Make sure environment variables are set manually"
    fi
}

# Main execution
main() {
    log "Starting Swaggbot MCP Server..."
    
    # Pre-flight checks
    check_docker
    
    # Load environment
    load_env
    
    # Check for required environment variables
    if [ -z "$MOONSHOT_API_KEY" ]; then
        error "MOONSHOT_API_KEY is not set"
        error "Please set it in your .env file or environment"
        exit 1
    fi
    
    check_image
    
    log "Connecting to Docker container..."
    
    # Run the MCP server
    # --rm: Remove container after exit
    # -i: Interactive mode (keep stdin open for MCP protocol)
    # --init: Use tini as init system for proper signal handling
    exec docker run \
        --rm \
        -i \
        --init \
        --name "${SERVICE_NAME}-$$" \
        --add-host host.docker.internal:host-gateway \
        -e MOONSHOT_API_KEY="$MOONSHOT_API_KEY" \
        -e MOONSHOT_MODEL="${MOONSHOT_MODEL:-kimi-k2.5}" \
        -e LLM_PROVIDER="${LLM_PROVIDER:-moonshot}" \
        -e DATABASE_URL="file:/app/data/swaggbot.db" \
        -e RUNNING_IN_DOCKER=true \
        -v "${PROJECT_NAME}_swaggbot-data:/app/data" \
        "swaggbot-mcp"
}

# Handle signals for clean shutdown
cleanup() {
    log "Shutting down Swaggbot MCP Server..."
    exit 0
}

trap cleanup SIGINT SIGTERM

# Run main
main "$@"
