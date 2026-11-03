"""Backport the released certifi CA data into optional pip-vendored copies."""
import importlib
import json
import shutil
from pathlib import Path
import certifi

source = Path(certifi.where()).resolve()
updated = []
try:
    vendor = importlib.import_module("pip._vendor.certifi")
except ImportError:
    vendor = None
if vendor is not None:
    target = Path(vendor.where()).resolve()
    if target != source:
        package = Path(vendor.__file__).resolve().parent
        assert target == package / "cacert.pem", "Unexpected pip CA location"
        shutil.copyfile(source, target)
        updated.append("pip._vendor.certifi")
print(json.dumps({"released_ca_data_backported_to": updated}))
