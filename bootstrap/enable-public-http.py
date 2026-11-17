#!/usr/bin/env python3
"""Enable public HTTP only after the panel switches to its configured HTTPS host."""
import json
import os
from pathlib import Path


def enable(root: Path) -> None:
    config = json.loads((root / "runtime/selflify.config.json").read_text())
    admin = config.get("admin", {})
    if not admin.get("login") or not admin.get("passwordHash") or not admin.get("configuredAt"):
        raise ValueError("Complete setup through the SSH tunnel before enabling public HTTP")
    if not config.get("server", {}).get("domain"):
        raise ValueError("Configure the HTTPS domain first")
    env = root / ".env"
    rows = [line for line in env.read_text().splitlines() if not line.startswith("SELFLIFY_HTTP_BIND=")]
    rows.append("SELFLIFY_HTTP_BIND=0.0.0.0")
    temporary = env.with_suffix(".env-http-tmp")
    try:
        with temporary.open("x") as output:
            os.chmod(temporary, 0o600)
            output.write("\n".join(rows) + "\n")
        temporary.replace(env)
    finally:
        temporary.unlink(missing_ok=True)


if __name__ == "__main__":
    enable(Path.cwd())
    print("Public HTTP redirects enabled; recreate Caddy with docker compose up -d caddy")
