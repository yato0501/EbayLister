#!/usr/bin/env bash
# Wrapper — delegates to PowerShell script (handles zip + paths on Windows)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
powershell.exe -ExecutionPolicy Bypass -File "$SCRIPT_DIR/deploy-lambda.ps1"
