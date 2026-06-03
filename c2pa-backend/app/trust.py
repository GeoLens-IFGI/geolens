"""Trust-list loading.

Implementation Guidance §6.3 ("Trust Lists") is explicit that C2PA does
*not* mandate any specific list. Each application implementer picks one
appropriate to their ecosystem. For GeoLens — a journalism / geomedia
disinformation tool — the relevant ecosystem is "News and Media
Consumption" (Guidance §6.3.2.1), so production deploys should use the
official C2PA Trust List.

This module loads the right combination of PEM bundles for the active
profile and exposes a c2pa.Settings dict that can be merged into the
shared c2pa.Context used by the Reader.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

from .settings import Settings, TrustProfile

logger = logging.getLogger(__name__)


PROFILE_BUNDLES: dict[TrustProfile, list[str]] = {
    "c2pa-prod": ["c2pa_trust_list.pem", "c2pa_tsa_trust_list.pem"],
    "c2pa-prod+itl": ["c2pa_trust_list.pem", "c2pa_tsa_trust_list.pem", "c2pa_itl.pem"],
    "dev": ["dev_anchor.pem"],
}

# For each profile, the "conformant-only" equivalent — i.e. the same anchors
# minus the frozen Interim Trust List. Used to tell whether a Trusted result
# depended on the ITL (a "legacy" signer) or holds against the official
# Conformance-Program trust list alone. None means the profile is already
# conformant-only (or dev), so no legacy distinction is meaningful.
_CONFORMANT_EQUIVALENT: dict[TrustProfile, TrustProfile | None] = {
    "c2pa-prod+itl": "c2pa-prod",
    "c2pa-prod": None,
    "dev": None,
}


@dataclass(frozen=True)
class LoadedTrust:
    profile: TrustProfile
    anchors_pem: str
    sources: list[Path]
    anchor_count: int

    @property
    def trust_list_uri(self) -> str:
        if not self.sources:
            return f"profile:{self.profile}"
        return "file://" + "+".join(str(p) for p in self.sources)


def load_trust(settings: Settings) -> LoadedTrust:
    """Concatenate the PEM files configured for the active profile.

    Missing files are logged but do not fail startup, so a fresh checkout
    works in `dev` mode without any production bundles. In `c2pa-prod`
    mode a missing file IS a startup error, because silently degrading
    to "no trust anchors" would mark every signed image as untrusted.
    """
    return _load_profile(settings.trust_profile, settings.trust_dir)


def load_conformant_trust(settings: Settings) -> LoadedTrust | None:
    """Load the conformant-only anchors (active profile minus the ITL).

    Returns None when the active profile carries no Interim Trust List, since
    there is then no "legacy vs conformant" distinction to draw.
    """
    base = _CONFORMANT_EQUIVALENT.get(settings.trust_profile)
    if base is None:
        return None
    return _load_profile(base, settings.trust_dir)


def _load_profile(profile: TrustProfile, trust_dir: Path) -> LoadedTrust:
    bundle_files = PROFILE_BUNDLES[profile]
    pem_chunks: list[str] = []
    sources: list[Path] = []
    missing: list[Path] = []

    for name in bundle_files:
        path = (trust_dir / name).resolve()
        if not path.exists():
            missing.append(path)
            continue
        pem = path.read_text(encoding="utf-8")
        pem_chunks.append(pem)
        sources.append(path)
        logger.info("Loaded trust bundle: %s", path)

    if missing and profile.startswith("c2pa-prod"):
        raise RuntimeError(
            "Trust profile %r requires the following PEM bundle(s) which were "
            "not found: %s. Drop them into %s, or switch C2PA_TRUST_PROFILE to "
            "'dev' for local testing."
            % (profile, [str(p) for p in missing], trust_dir)
        )

    if missing:
        logger.warning(
            "Profile %r expected these bundles but they are missing (continuing): %s",
            profile,
            [str(p) for p in missing],
        )

    anchors_pem = "\n".join(pem_chunks)
    anchor_count = anchors_pem.count("BEGIN CERTIFICATE")

    return LoadedTrust(
        profile=profile,
        anchors_pem=anchors_pem,
        sources=sources,
        anchor_count=anchor_count,
    )


def build_c2pa_settings_dict(trust: LoadedTrust, *, ocsp_live: bool) -> dict:
    """Translate our LoadedTrust into the dict that c2pa.Settings accepts.

    Keys here follow the c2pa-rs Settings JSON schema. The structure is
    documented in c2pa-rs/sdk/src/settings.rs and exercised throughout
    the c2pa-python tests.
    """
    return {
        "verify": {
            "verify_trust": True,
            "verify_after_reading": True,
            "remote_manifest_fetch": False,
            "ocsp_fetch": ocsp_live,
            # We never block on slow OCSP responders; stapled OCSP info is
            # what we actually rely on per Guidance §6.2.4.
            "skip_ingredient_conflict_resolution": False,
        },
        "trust": {
            "trust_anchors": trust.anchors_pem,
            # Both signer and TSA anchors live in the same concatenated PEM:
            # c2pa-rs walks both during validation. If you want to scope
            # them separately, split into trust.user_anchors etc.
        },
    }
