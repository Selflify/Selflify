#!/usr/bin/env python3
"""Disable MPTCP on the host and Docker namespaces without changing images or data."""
import json
import os
from pathlib import Path
import shlex
import subprocess


def command(*args):
    return subprocess.check_output(args, text=True).strip()


def configure_host_network():
    if os.geteuid() != 0:
        raise RuntimeError("Run the network policy as root.")
    path = Path("/etc/sysctl.d/99-disable-mptcp.conf")
    path.write_text("# MPTCP mitigation; an updated kernel is still required.\nnet.mptcp.enabled = 0\n")
    subprocess.run(["sysctl", "-w", "net.mptcp.enabled=0"], check=True)
    changed = False
    restart = []
    for unit in ("containerd", "docker"):
        raw = command("systemctl", "show", unit, "-p", "Environment", "--value")
        environment = dict(value.split("=", 1) for value in shlex.split(raw) if "=" in value)
        options = [value for value in environment.get("GODEBUG", "").split(",")
                   if value and not value.startswith("multipathtcp=")]
        options.append("multipathtcp=0")
        value = ",".join(options)
        directory = Path("/etc/systemd/system") / (unit + ".service.d")
        directory.mkdir(parents=True, exist_ok=True)
        dropin = directory / "99-disable-mptcp.conf"
        quoted = value.replace("\\", "\\\\").replace('"', '\\"').replace("%", "%%")
        content = '[Service]\nEnvironment="GODEBUG=' + quoted + '"\n'
        if not dropin.exists() or dropin.read_text() != content:
            dropin.write_text(content)
            changed = True
        pid = command("systemctl", "show", unit, "-p", "MainPID", "--value")
        if pid.isdigit() and int(pid):
            entries = Path("/proc") / pid / "environ"
            active = dict(item.split(b"=", 1) for item in entries.read_bytes().split(b"\0") if b"=" in item)
            if b"multipathtcp=0" not in active.get(b"GODEBUG", b"").split(b","):
                restart.append(unit)
    before = command("docker", "ps", "--format", "{{.Names}}").splitlines()
    if changed:
        subprocess.run(["systemctl", "daemon-reload"], check=True)
    for unit in restart:
        subprocess.run(["systemctl", "restart", unit], check=True)
    if "docker" in restart:
        after = set(command("docker", "ps", "--format", "{{.Names}}").splitlines())
        for name in before:
            if name not in after:
                subprocess.run(["docker", "start", name], check=True)
    for row in command("lsns", "-t", "net", "-n", "-o", "PID").splitlines():
        pid = row.strip()
        result = subprocess.run(["nsenter", "--target", pid, "--net", "--",
                                 "sysctl", "-w", "net.mptcp.enabled=0"],
                                stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        if result.returncode and (Path("/proc") / pid).exists():
            raise RuntimeError("Cannot disable MPTCP in a running network namespace.")
    print("Host and Docker MPTCP policy applied.")


if __name__ == "__main__":
    configure_host_network()
