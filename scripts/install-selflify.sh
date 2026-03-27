#!/usr/bin/env bash

set -euo pipefail

INSTALL_DIR="/opt/selflify"
ARCHIVE_URL="${SELFLIFY_ARCHIVE_URL:-}"
DOMAIN="${SELFLIFY_DOMAIN:-}"
SERVER_IP="${SELFLIFY_SERVER_IP:-}"
CADDY_EMAIL="${SELFLIFY_CADDY_EMAIL:-}"
AUTH_SECRET_VALUE="${AUTH_SECRET:-}"
SKIP_START="0"

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
    --domain)
      DOMAIN="${2:-}"
      shift 2
      ;;
    --server-ip)
      SERVER_IP="${2:-}"
      shift 2
      ;;
    --email)
      CADDY_EMAIL="${2:-}"
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

if [ -z "${ARCHIVE_URL}" ]; then
  fail "Pass --archive-url or set SELFLIFY_ARCHIVE_URL."
fi

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
  local domain="$2"
  local server_ip="$3"
  local caddy_email="$4"
  local auth_secret="$5"

  if [ ! -f "${install_dir}/selflify.config.json" ]; then
    python3 - <<'PY' "${install_dir}/bootstrap/selflify.config.template.json" "${install_dir}/selflify.config.json" "${domain}" "${server_ip}" "${caddy_email}" "${auth_secret}"
from pathlib import Path
import sys

template_path = Path(sys.argv[1])
output_path = Path(sys.argv[2])
domain = sys.argv[3]
server_ip = sys.argv[4]
caddy_email = sys.argv[5]
auth_secret = sys.argv[6]

payload = template_path.read_text("utf-8")
payload = payload.replace("__SELFLIFY_DOMAIN__", domain)
payload = payload.replace("__SELFLIFY_SERVER_IP__", server_ip)
payload = payload.replace("__SELFLIFY_CADDY_EMAIL__", caddy_email)
payload = payload.replace("__SELFLIFY_SESSION_SECRET__", auth_secret)
output_path.write_text(payload, encoding="utf-8")
PY
    log "Created ${install_dir}/selflify.config.json"
  fi

  if [ ! -f "${install_dir}/Caddyfile" ]; then
    python3 - <<'PY' "${install_dir}/bootstrap/Caddyfile.template" "${install_dir}/Caddyfile" "${domain}" "${caddy_email}"
from pathlib import Path
import sys

template_path = Path(sys.argv[1])
output_path = Path(sys.argv[2])
domain = sys.argv[3]
caddy_email = sys.argv[4]

payload = template_path.read_text("utf-8")
payload = payload.replace("__SELFLIFY_DOMAIN__", domain)
payload = payload.replace("__SELFLIFY_CADDY_EMAIL__", caddy_email)
output_path.write_text(payload, encoding="utf-8")
PY
    log "Created ${install_dir}/Caddyfile"
  fi
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

  log "Created ${install_dir}/.env"
}

install_base_packages
install_docker
install_compose_plugin
detect_server_ip

if [ -z "${DOMAIN}" ]; then
  fail "Pass --domain or set SELFLIFY_DOMAIN."
fi

if [ -z "${SERVER_IP}" ]; then
  fail "Pass --server-ip or set SELFLIFY_SERVER_IP."
fi

if [ -z "${CADDY_EMAIL}" ]; then
  CADDY_EMAIL="admin@${DOMAIN}"
fi

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

mkdir -p "${INSTALL_DIR}/data" "${INSTALL_DIR}/config" "${INSTALL_DIR}/logs"

write_runtime_templates "${INSTALL_DIR}" "${DOMAIN}" "${SERVER_IP}" "${CADDY_EMAIL}" "${AUTH_SECRET_VALUE}"
write_env_file "${INSTALL_DIR}" "${AUTH_SECRET_VALUE}"

rm -rf "${TMP_DIR}"

if [ "${SKIP_START}" = "1" ]; then
  log "Bootstrap files are ready in ${INSTALL_DIR}. Start manually with: docker compose up -d --build"
  exit 0
fi

log "Starting Selflify stack"
cd "${INSTALL_DIR}"
docker_compose up -d --build

log "Bootstrap complete"
printf '\n'
printf 'Open https://%s/setup after your DNS points to %s\n' "${DOMAIN}" "${SERVER_IP}"
printf 'Next step in UI: create the first account and paste your Cloudflare API token.\n'
