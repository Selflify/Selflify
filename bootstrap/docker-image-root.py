#!/usr/bin/env python3
"""Print the host directory that Compose should mount for the runner's disk check."""
import json
import subprocess


def docker_json(*args):
    return json.loads(subprocess.check_output(["docker", *args], text=True))


def image_root(info, configured, legacy):
    if configured:
        return configured
    if ["driver-type", "io.containerd.snapshotter.v1"] in (info.get("DriverStatus") or []):
        return "/var/lib/containerd"
    return legacy or info["DockerRootDir"]


def main():
    config = docker_json("compose", "--profile", "containers", "config", "--format", "json")
    runner = config["services"]["container-runner"]
    configured = runner["environment"]["SELFLIFY_DOCKER_IMAGE_ROOT"]
    if configured:
        print(configured)
        return
    mounts = {volume["target"]: volume["source"] for volume in runner["volumes"]}
    info = docker_json("--host", "unix://" + mounts["/var/run/docker.sock"], "info", "--format", "{{json .}}")
    legacy = runner["environment"]["SELFLIFY_DOCKER_DATA_ROOT"]
    print(image_root(info, configured, legacy))


if __name__ == "__main__":
    main()
