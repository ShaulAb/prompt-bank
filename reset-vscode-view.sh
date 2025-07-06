#!/bin/bash

echo "Resetting VS Code view state for Prompt Bank extension..."

# Close VS Code first
echo "Please close VS Code completely before running this script."
read -p "Press Enter when VS Code is closed..."

# Find and remove workspace storage that might contain view state
WORKSPACE_PATH="/home/shaulab/shaul_bp/projects/prompt-bank"
WORKSPACE_HASH=$(echo -n "$WORKSPACE_PATH" | sha1sum | cut -d' ' -f1)

echo "Workspace hash: $WORKSPACE_HASH"

# Remove workspace storage
STORAGE_PATH="$HOME/.config/Code/User/workspaceStorage"
if [ -d "$STORAGE_PATH" ]; then
    echo "Looking for workspace storage..."
    find "$STORAGE_PATH" -name "*$WORKSPACE_HASH*" -type d -exec rm -rf {} \; 2>/dev/null
    echo "Workspace storage cleared."
fi

# Also try to find any storage that might match our project
find "$STORAGE_PATH" -name "*prompt-bank*" -type d -exec rm -rf {} \; 2>/dev/null
find "$STORAGE_PATH" -name "*promptbank*" -type d -exec rm -rf {} \; 2>/dev/null

echo "VS Code view state reset complete."
echo "Now restart VS Code and test the extension." 