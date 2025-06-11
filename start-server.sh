#!/bin/bash

# Ensure MongoDB is running
echo "🔄 Checking MongoDB status..."
if ! mongod --version > /dev/null 2>&1; then
    echo "❌ MongoDB is not installed. Please install MongoDB first."
    exit 1
fi

# Start MongoDB if not running
if ! pgrep mongod > /dev/null; then
    echo "🔄 Starting MongoDB..."
    mongod --dbpath ./data/db &
    sleep 2
fi

# Start the MCP server
echo "🔄 Starting MCP server..."
node dist/mcp-simple.mjs 