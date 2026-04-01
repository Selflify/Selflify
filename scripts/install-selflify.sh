#!/usr/bin/env bash

set -euo pipefail

INSTALL_DIR="/opt/selflify"
DEFAULT_ARCHIVE_URL="https://github.com/Selflify/Selflify/releases/latest/download/selflify-bootstrap.tar.gz"
ARCHIVE_URL="${SELFLIFY_ARCHIVE_URL:-${DEFAULT_ARCHIVE_URL}}"
AUTH_SECRET_VALUE="${AUTH_SECRET:-}"
SKIP_START="0"
SERVER_IP=""

log() {
  printf '\033[1;35m[selflify-bootstrap]\033[0m %s\n' "$*"
}

fail() {
  printf '\033[1;31m[selflify-bootstrap]\033[0m %s\n' "$*" >&2
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1
}

docker_compose() {
  if [ -n "${SUDO}" ]; then
    $SUDO docker compose "$@"
    return
  fi

  docker compose "$@"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --archive-url)
      ARCHIVE_URL="${2:-}"
      shift 2
      ;;
    --install-dir)
      INSTALL_DIR="${2:-}"
      shift 2
      ;;
    --auth-secret)
      AUTH_SECRET_VALUE="${2:-}"
      shift 2
      ;;
    --skip-start)
      SKIP_START="1"
      shift
      ;;
    *)
      fail "Unknown argument: $1"
      ;;
  esac
done

SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  if need_cmd sudo; then
    SUDO="sudo"
  else
    fail "Run as root or install sudo."
  fi
fi

install_base_packages() {
  if need_cmd apt-get; then
    $SUDO apt-get update
    $SUDO apt-get install -y ca-certificates curl tar python3
    return
  fi

  if need_cmd dnf; then
    $SUDO dnf install -y ca-certificates curl tar python3
    return
  fi

  if need_cmd yum; then
    $SUDO yum install -y ca-certificates curl tar python3
    return
  fi

  fail "Unsupported Linux distribution. Install curl, tar and python3 manually."
}

install_docker() {
  if need_cmd docker; then
    return
  fi

  log "Installing Docker Engine"
  curl -fsSL https://get.docker.com | $SUDO sh
  $SUDO systemctl enable --now docker
}

install_compose_plugin() {
  if docker_compose version >/dev/null 2>&1; then
    return
  fi

  log "Installing Docker Compose plugin"
  local version="v2.39.4"
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"

  $SUDO mkdir -p /usr/local/lib/docker/cli-plugins
  $SUDO curl -fsSL \
    "https://github.com/docker/compose/releases/download/${version}/docker-compose-${os}-${arch}" \
    -o /usr/local/lib/docker/cli-plugins/docker-compose
  $SUDO chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
}

detect_server_ip() {
  if [ -n "${SERVER_IP}" ]; then
    return
  fi

  if need_cmd curl; then
    SERVER_IP="$(curl -fsSL https://api64.ipify.org || true)"
  fi

  if [ -z "${SERVER_IP}" ] && need_cmd hostname; then
    SERVER_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
  fi
}

generate_secret() {
  python3 - <<'PY'
import secrets
print(secrets.token_hex(32))
PY
}

write_runtime_templates() {
  local install_dir="$1"
  local server_ip="$2"
  local auth_secret="$3"
  local args=(
    "${install_dir}/bootstrap/seed-runtime-files.py"
    --root "${install_dir}" \
    --session-secret "${auth_secret}"
  )

  if [ -n "${server_ip}" ]; then
    args+=(--server-ip "${server_ip}")
  fi

  python3 "${args[@]}"
}

write_env_file() {
  local install_dir="$1"
  local auth_secret="$2"

  if [ -f "${install_dir}/.env" ]; then
    return
  fi

  cat > "${install_dir}/.env" <<EOF
AUTH_SECRET=${auth_secret}
SELFLIFY_PREVIEW_TTL_DAYS=30
SELFLIFY_ORPHAN_TTL_DAYS=30
SELFLIFY_CLEANUP_INTERVAL_SECONDS=86400
SELFLIFY_BACKUP_KEEP=20
EOF

  if [ -n "${SELFLIFY_MOCK_CLOUDFLARE:-}" ]; then
    printf 'SELFLIFY_MOCK_CLOUDFLARE=%s\n' "${SELFLIFY_MOCK_CLOUDFLARE}" >> "${install_dir}/.env"
  fi

  if [ -n "${SELFLIFY_SKIP_CADDY_RELOAD:-}" ]; then
    printf 'SELFLIFY_SKIP_CADDY_RELOAD=%s\n' "${SELFLIFY_SKIP_CADDY_RELOAD}" >> "${install_dir}/.env"
  fi

  log "Created ${install_dir}/.env"
}

install_base_packages
install_docker
install_compose_plugin
detect_server_ip

if [ -z "${AUTH_SECRET_VALUE}" ]; then
  AUTH_SECRET_VALUE="$(generate_secret)"
fi

TMP_DIR="$(mktemp -d)"
ARCHIVE_PATH="${TMP_DIR}/selflify-bootstrap.tar.gz"

log "Downloading bootstrap bundle"
curl -fsSL "${ARCHIVE_URL}" -o "${ARCHIVE_PATH}"

$SUDO mkdir -p "${INSTALL_DIR}"
$SUDO chown "$(id -u):$(id -g)" "${INSTALL_DIR}"

log "Extracting bundle to ${INSTALL_DIR}"
tar -xzf "${ARCHIVE_PATH}" --strip-components=1 -C "${INSTALL_DIR}"

mkdir -p \
  "${INSTALL_DIR}/runtime/data" \
  "${INSTALL_DIR}/runtime/config" \
  "${INSTALL_DIR}/runtime/logs"

write_runtime_templates "${INSTALL_DIR}" "${SERVER_IP}" "${AUTH_SECRET_VALUE}"
write_env_file "${INSTALL_DIR}" "${AUTH_SECRET_VALUE}"

rm -rf "${TMP_DIR}"

if [ "${SKIP_START}" = "1" ]; then
  log "Bootstrap files are ready in ${INSTALL_DIR}. Start manually with: docker compose pull && docker compose up -d"
  exit 0
fi

log "Starting Selflify stack"
cd "${INSTALL_DIR}"
docker_compose pull
docker_compose up -d

log "Bootstrap complete"
printf '\n'
if [ -n "${SERVER_IP}" ]; then
  printf 'Open http://%s/setup to finish first launch.\n' "${SERVER_IP}"
else
  printf 'Open http://<server-ip>/setup to finish first launch.\n'
fi
printf 'Next step in UI: create the first account, enter the domain, server IP, Caddy email and paste your Cloudflare API token.\n'
