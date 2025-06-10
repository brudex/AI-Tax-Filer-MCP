#!/bin/bash

# Robust MCP Server Launcher
# Ensures proper Node.js environment and module resolution

set -e  # Exit on any error

# Get the directory of this script
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Export NODE_PATH to help with module resolution
export NODE_PATH="$DIR/node_modules:$NODE_PATH"

# Ensure we're in the right directory
cd "$DIR"

# Use the specific Node.js path that works
NODE_BINARY="/opt/homebrew/bin/node"

# Fallback to system node if homebrew node doesn't exist
if [ ! -f "$NODE_BINARY" ]; then
    NODE_BINARY="$(which node)"
fi

# Execute the MCP server with proper environment
exec "$NODE_BINARY" "$DIR/mcp-minimal.cjs" 