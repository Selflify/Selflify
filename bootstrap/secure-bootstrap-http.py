#!/usr/bin/env python3
"""Keep incomplete setups off the public HTTP listener, including old env files."""
import json
import os
from pathlib import Path


def secure(root: Path) -> None:
    config = json.loads((root / "runtime/selflify.config.json").read_text())
    admin = config.get("admin", {})
    if admin.get("login") and admin.get("passwordHash") and admin.get("configuredAt"):
        return
    env = root / ".env"
    rows = [line for line in env.read_text().splitlines() if not line.startswith("SELFLIFY_HTTP_BIND=")]
    rows.append("SELFLIFY_HTTP_BIND=127.0.0.1")
    temporary = env.with_suffix(".env-http-tmp")
    try:
        with temporary.open("x") as output:
            os.chmod(temporary, 0o600)
            output.write("\n".join(rows) + "\n")
        temporary.replace(env)
    finally:
        temporary.unlink(missing_ok=True)


if __name__ == "__main__":
    secure(Path.cwd())
