#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
CONFIG="${SELFLIFY_CONFIG_PATH:-${SCRIPT_DIR}/selflify.config.json}"
PREVIEW_TTL_DAYS="${SELFLIFY_PREVIEW_TTL_DAYS:-30}"
ORPHAN_TTL_DAYS="${SELFLIFY_ORPHAN_TTL_DAYS:-30}"

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required"
  exit 1
fi

if [[ ! -f "$CONFIG" ]]; then
  echo "Config not found: $CONFIG"
  exit 1
fi

mapfile -t SITES < <(jq -c '.sites[]' "$CONFIG")

for site_json in "${SITES[@]}"; do
  site_slug="$(jq -r '.slug' <<<"$site_json")"
  site_dir="$(jq -r --arg slug "$site_slug" '.server.previewRootDir + "/" + $slug' "$CONFIG")"
  main_branch="$(jq -r '.mainBranch' <<<"$site_json")"

  if [[ ! -d "$site_dir" ]]; then
    continue
  fi

  find "$site_dir" \
    -mindepth 1 -maxdepth 1 -type d \
    ! -name "$main_branch" \
    -mtime +"$PREVIEW_TTL_DAYS" \
    -print \
    -exec rm -rf {} \;
done

orphan_root="$(jq -r '.server.orphanedRootDir' "$CONFIG")"

if [[ -d "$orphan_root" ]]; then
  find "$orphan_root" \
    -mindepth 1 -maxdepth 1 -type d \
    -mtime +"$ORPHAN_TTL_DAYS" \
    -print \
    -exec rm -rf {} \;
fi
