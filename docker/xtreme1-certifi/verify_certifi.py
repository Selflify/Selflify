"""Verify the pinned public CA bundle without changing certificates or application data."""
import argparse
import hashlib
import importlib.metadata
import json
import ssl
import urllib.request
import certifi

VERSION = "2026.10.23"
BUNDLE_SHA256 = "2ef52ad56b4803e264045c915e55c236cbfa045b84b81efefc218a19eb44bd2b"
REVOKED_ROOTS = {
    "86a1ecba089c4a8d3bbe2734c612ba341d813e043cf9e8a862cd5c57a36bbe6b",
    "125609aa301da0a249b97a8239cb6a34216f44dcac9f3954b14292f2e8c8608f",
    "bc4d809b15189d78db3e1d8cf4f9726a795da1643ca5f1358e1ddb0edc0d7eb3",
}

def verify(https=False):
    assert certifi.__version__ == VERSION, certifi.__version__
    assert importlib.metadata.version("certifi") == VERSION
    with open(certifi.where(), "rb") as stream:
        digest = hashlib.sha256(stream.read()).hexdigest()
    assert digest == BUNDLE_SHA256, digest
    context = ssl.create_default_context(cafile=certifi.where())
    fingerprints = {hashlib.sha256(c).hexdigest() for c in context.get_ca_certs(binary_form=True)}
    assert not fingerprints.intersection(REVOKED_ROOTS), "Revoked CA remains trusted"
    result = {"certifi": VERSION, "bundle_sha256": digest, "removed_roots_present": 0}
    if https:
        with urllib.request.urlopen("https://pypi.org/simple/certifi/", context=context, timeout=20) as response:
            assert response.status == 200
            result["https_status"] = response.status
    print(json.dumps(result))

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--https", action="store_true")
    verify(parser.parse_args().https)
