#!/usr/bin/env bash
set -euo pipefail

# Pass the same global Compose options used by the deployment.
as_root() {
  if [ "$(id -u)" = 0 ]; then
    "$@"
  else
    sudo -n "$@"
  fi
}

containers=$(as_root docker compose "$@" --profile '*' ps --quiet --status running)
if [ -z "$containers" ]; then
  echo "Cannot verify MPTCP: no running Compose containers." >&2
  exit 1
fi

count=0
for container in $containers; do
  name=$(as_root docker inspect --format '{{.Name}}' "$container")
  configured=$(as_root docker inspect --format '{{index .HostConfig.Sysctls "net.mptcp.enabled"}}' "$container")
  if [ "$configured" != 0 ]; then
    echo "MPTCP is not persistently disabled in $name." >&2
    exit 1
  fi

  pid=$(as_root docker inspect --format '{{.State.Pid}}' "$container")
  if ! [[ "$pid" =~ ^[1-9][0-9]*$ ]]; then
    echo "Cannot inspect the network namespace of $name." >&2
    exit 1
  fi
  enabled=$(as_root nsenter --target "$pid" --net -- sysctl -n net.mptcp.enabled)
  if [ "$enabled" != 0 ]; then
    echo "MPTCP is enabled in the network namespace of $name." >&2
    exit 1
  fi
  count=$((count + 1))
done

echo "MPTCP is disabled in all $count running Compose containers."
