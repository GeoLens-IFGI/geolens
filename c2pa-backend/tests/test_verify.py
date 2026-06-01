"""Smoke tests for /c2pa/verify against the three locally-generated fixtures.

Under the `dev` trust profile, `verified.jpg` should come back with
`status=verified` (since it was signed by our local dev cert which the
profile trusts). Tampered should report `tampered`. No-manifest should
report `no-manifest`.
"""

from __future__ import annotations


def _post(client, name: str, data: bytes):
    return client.post(
        "/c2pa/verify",
        files={"file": (name, data, "image/jpeg")},
    )


def test_no_manifest(client, no_manifest_bytes) -> None:
    res = _post(client, "no_manifest.jpg", no_manifest_bytes)
    assert res.status_code == 200
    body = res.json()
    assert body["has_manifest"] is False
    assert body["summary"]["status"] == "no-manifest"
    assert body["validation_state"] is None


def test_verified_under_dev_profile(client, verified_bytes) -> None:
    res = _post(client, "verified.jpg", verified_bytes)
    assert res.status_code == 200
    body = res.json()
    assert body["has_manifest"] is True
    assert body["summary"]["status"] in {"verified", "signed-untrusted"}
    # Active manifest validation results should at least exist.
    active = body["validation_results"].get("activeManifest")
    assert active is not None
    # No tamper-class failure codes should be present on a freshly-signed asset.
    failure_codes = {s["code"] for s in active["failure"]}
    assert "assertion.dataHash.mismatch" not in failure_codes
    assert "claimSignature.mismatch" not in failure_codes


def test_tampered(client, tampered_bytes) -> None:
    res = _post(client, "tampered.jpg", tampered_bytes)
    assert res.status_code == 200
    body = res.json()
    assert body["has_manifest"] is True
    assert body["summary"]["status"] == "tampered"
    active = body["validation_results"].get("activeManifest")
    assert active is not None
    failure_codes = {s["code"] for s in active["failure"]}
    # At least one of the data/box hash mismatch codes must show up.
    assert failure_codes & {
        "assertion.dataHash.mismatch",
        "assertion.boxesHash.mismatch",
        "assertion.bmffHash.mismatch",
    }


def test_empty_upload_rejected(client) -> None:
    res = client.post(
        "/c2pa/verify",
        files={"file": ("empty.jpg", b"", "image/jpeg")},
    )
    assert res.status_code == 400


def test_oversize_upload_rejected(client, monkeypatch) -> None:
    from app import settings as settings_mod

    monkeypatch.setattr(settings_mod.settings, "max_upload_bytes", 64)
    res = client.post(
        "/c2pa/verify",
        files={"file": ("big.jpg", b"\x00" * 1024, "image/jpeg")},
    )
    assert res.status_code == 413
