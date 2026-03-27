#!/usr/bin/env python3

from __future__ import annotations

import argparse
import sys
from pathlib import Path


def render_template(template_path: Path, replacements: dict[str, str]) -> str:
    payload = template_path.read_text("utf-8")

    for placeholder, value in replacements.items():
        payload = payload.replace(placeholder, value)

    return payload


def write_if_missing(output_path: Path, content: str) -> bool:
    if output_path.exists():
        return False

    output_path.write_text(content, encoding="utf-8")
    return True


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Seed missing Selflify runtime files from bootstrap templates.",
    )
    parser.add_argument("--root", default=".", help="Project root where runtime files should exist.")
    parser.add_argument("--domain", required=True, help="Primary Selflify domain.")
    parser.add_argument(
        "--server-ip",
        default="",
        help="Server public IP. Required only when runtime/selflify.config.json is missing.",
    )
    parser.add_argument(
        "--caddy-email",
        default="",
        help="Caddy contact email. Defaults to admin@<domain>.",
    )
    parser.add_argument(
        "--session-secret",
        default="",
        help="Session secret. Required only when runtime/selflify.config.json is missing.",
    )
    return parser


def main() -> int:
    args = build_parser().parse_args()
    root = Path(args.root).resolve()
    bootstrap_dir = root / "bootstrap"
    config_template = bootstrap_dir / "selflify.config.template.json"
    caddy_template = bootstrap_dir / "Caddyfile.template"
    runtime_dir = root / "runtime"
    config_output = runtime_dir / "selflify.config.json"
    caddy_output = runtime_dir / "Caddyfile"
    caddy_email = args.caddy_email or f"admin@{args.domain}"

    if not config_template.is_file():
        raise SystemExit(f"Missing bootstrap template: {config_template}")

    if not caddy_template.is_file():
        raise SystemExit(f"Missing bootstrap template: {caddy_template}")

    runtime_dir.mkdir(parents=True, exist_ok=True)

    if not config_output.exists():
        if not args.server_ip:
            raise SystemExit("--server-ip is required when runtime/selflify.config.json is missing.")

        if not args.session_secret:
            raise SystemExit(
                "--session-secret is required when runtime/selflify.config.json is missing."
            )

        config_payload = render_template(
            config_template,
            {
                "__SELFLIFY_DOMAIN__": args.domain,
                "__SELFLIFY_SERVER_IP__": args.server_ip,
                "__SELFLIFY_CADDY_EMAIL__": caddy_email,
                "__SELFLIFY_SESSION_SECRET__": args.session_secret,
            },
        )
        if write_if_missing(config_output, config_payload):
            print(f"Created {config_output}")

    if not caddy_output.exists():
        caddy_payload = render_template(
            caddy_template,
            {
                "__SELFLIFY_DOMAIN__": args.domain,
                "__SELFLIFY_CADDY_EMAIL__": caddy_email,
            },
        )
        if write_if_missing(caddy_output, caddy_payload):
            print(f"Created {caddy_output}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
