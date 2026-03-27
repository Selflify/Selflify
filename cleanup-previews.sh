#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

exec yarn tsx "${SCRIPT_DIR}/src/bin/cleanup.ts"
