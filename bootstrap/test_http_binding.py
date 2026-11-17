import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path


def load(name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


secure = load("secure-bootstrap-http").secure
enable = load("enable-public-http").enable
merge = load("merge-deploy-env").merge


class BootstrapHttpTests(unittest.TestCase):
    def test_loopback_until_setup_and_preserve_secrets(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "runtime").mkdir()
            config = {"admin": {}, "server": {"domain": "panel.example.test"}}
            path = root / "runtime/selflify.config.json"
            path.write_text(json.dumps(config))
            (root / ".env").write_text("AUTH_SECRET=local-test-value\nSELFLIFY_HTTP_BIND=0.0.0.0\n")
            secure(root)
            self.assertEqual((root / ".env").read_text(), "AUTH_SECRET=local-test-value\nSELFLIFY_HTTP_BIND=127.0.0.1\n")
            with self.assertRaises(ValueError):
                enable(root)
            config["admin"] = {"login": "owner", "passwordHash": "fixture", "configuredAt": "now"}
            path.write_text(json.dumps(config))
            enable(root)
            public = (root / ".env").read_text()
            self.assertIn("SELFLIFY_HTTP_BIND=0.0.0.0", public)
            secure(root)
            self.assertEqual((root / ".env").read_text(), public)
            self.assertEqual(os.stat(root / ".env").st_mode & 0o777, 0o600)

    def test_never_opens_http_without_domain(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "runtime").mkdir()
            (root / "runtime/selflify.config.json").write_text(json.dumps({"admin": {"login": "owner", "passwordHash": "fixture", "configuredAt": "now"}, "server": {}}))
            with self.assertRaises(ValueError):
                enable(root)

    def test_deployment_preserves_host_policy_and_does_not_open_incomplete_setup(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "runtime").mkdir()
            path = root / "runtime/selflify.config.json"
            path.write_text(json.dumps({"admin": {}}))
            env = root / ".env"
            env.write_text("AUTH_SECRET=old-fixture\nSELFLIFY_HTTP_BIND=127.0.0.1\nSELFLIFY_DOCKER_DATA_ROOT=/srv/docker-data\nIGNORED_OLD=old\n")
            old = env.read_text()
            (root / ".env.production").write_text("AUTH_SECRET=new-fixture\nSELFLIFY_BACKUP_KEEP=20\n")
            with self.assertRaises(ValueError):
                merge(root)
            self.assertEqual(env.read_text(), old)
            # Existing configured instances do not require a newer generation field.
            path.write_text(json.dumps({"admin": {"login": "owner", "passwordHash": "fixture"}}))
            merge(root)
            result = env.read_text()
            self.assertIn("AUTH_SECRET=new-fixture", result)
            self.assertNotIn("old-fixture", result)
            self.assertNotIn("IGNORED_OLD", result)
            self.assertIn("SELFLIFY_HTTP_BIND=127.0.0.1", result)
            self.assertIn("SELFLIFY_DOCKER_DATA_ROOT=/srv/docker-data", result)
            self.assertFalse((root / ".env.production").exists())
            self.assertEqual(os.stat(env).st_mode & 0o777, 0o600)


if __name__ == "__main__":
    unittest.main()
