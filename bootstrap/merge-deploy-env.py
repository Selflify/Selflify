#!/usr/bin/env python3
"""Refresh deployment secrets while preserving explicit host boundary settings."""
import os
from pathlib import Path

PRESERVED = {"SELFLIFY_HTTP_BIND", "SELFLIFY_DOCKER_DATA_ROOT"}


def merge(root: Path) -> None:
    env = root / ".env"
    incoming = root / ".env.production"
    lines = incoming.read_text().splitlines()
    supplied = {line.partition("=")[0].strip() for line in lines if not line.lstrip().startswith("#")}
    preserved = {}
    for line in env.read_text().splitlines():
        key = line.partition("=")[0].strip()
        if key in PRESERVED and key not in supplied:
            preserved[key] = line
    metadata = env.stat()
    temporary = env.with_suffix(".env-deploy-tmp")
    try:
        with temporary.open("x") as output:
            os.chmod(temporary, 0o600)
            output.write("\n".join(lines + list(preserved.values())) + "\n")
        current = temporary.stat()
        if (current.st_uid, current.st_gid) != (metadata.st_uid, metadata.st_gid):
            os.chown(temporary, metadata.st_uid, metadata.st_gid)
        temporary.replace(env)
        incoming.unlink()
    finally:
        temporary.unlink(missing_ok=True)


if __name__ == "__main__":
    merge(Path.cwd())
