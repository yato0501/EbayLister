#!/usr/bin/env bash
# Deploy Web Frontend — thin bash wrapper that calls the PowerShell script on Windows
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

powershell.exe -ExecutionPolicy Bypass -File "$SCRIPT_DIR/deploy-web.ps1"
