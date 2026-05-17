"""Shared pytest fixtures.

The first time tests run we make sure the three image fixtures and the
dev trust anchor exist; subsequent runs reuse them. We also force the
`dev` trust profile so signed fixtures verify against the local CA.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
FIXTURES_DIR = ROOT / "tests" / "fixtures"
TRUST_DIR = ROOT / "trust"


def _ensure_fixtures() -> None:
    needed = [
        FIXTURES_DIR / "verified.jpg",
        FIXTURES_DIR / "tampered.jpg",
        FIXTURES_DIR / "no_manifest.jpg",
        TRUST_DIR / "dev_anchor.pem",
    ]
    if all(p.exists() for p in needed):
        return
    from tests.fixtures import make_fixtures

    make_fixtures.main()


@pytest.fixture(scope="session", autouse=True)
def _configure_environment(tmp_path_factory) -> None:
    os.environ.setdefault("C2PA_TRUST_PROFILE", "dev")
    os.environ.setdefault("C2PA_TRUST_DIR", str(TRUST_DIR))
    os.environ.setdefault("C2PA_OCSP_LIVE", "false")
    _ensure_fixtures()


@pytest.fixture(scope="session")
def client() -> TestClient:
    # Import lazily so env vars set in the autouse fixture take effect.
    from app.main import app

    with TestClient(app) as c:
        yield c


@pytest.fixture
def verified_bytes() -> bytes:
    return (FIXTURES_DIR / "verified.jpg").read_bytes()


@pytest.fixture
def tampered_bytes() -> bytes:
    return (FIXTURES_DIR / "tampered.jpg").read_bytes()


@pytest.fixture
def no_manifest_bytes() -> bytes:
    return (FIXTURES_DIR / "no_manifest.jpg").read_bytes()
