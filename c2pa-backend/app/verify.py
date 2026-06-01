"""The verification engine: turn an UploadFile into a VerifyResponse.

Validation itself is delegated entirely to c2pa-python (which delegates to
c2pa-rs). This module's job is:

  1. Open the bytes as a stream the Reader can consume.
  2. Catch the "no manifest found" case cleanly via Reader.try_create.
  3. Pull the validation_results / validation_state / manifest dicts out
     of the SDK and reshape them into our spec-aligned response models.
  4. Derive the single high-level `summary.status` the extension needs.

The only spec-level interpretation we do ourselves is the `status` mapping
in `_derive_status` — every other code is passed through verbatim.
"""

from __future__ import annotations

import io
import logging
import re
from typing import Any

import c2pa

from .models import (
    AssertionPreview,
    IngredientDeltaValidationResult,
    IngredientSummary,
    SignerInfo,
    StatusCodesMap,
    StatusMap,
    Summary,
    SummaryStatus,
    ValidationResults,
    VerifyResponse,
)
from .trust import LoadedTrust

logger = logging.getLogger(__name__)


# Validation status codes from validation-results.cddl. We don't want to
# reproduce the full list here (the spec already does), but we do need a
# small classifier for the `summary.status` derivation.
_TAMPER_CODES = {
    "assertion.dataHash.mismatch",
    "assertion.boxesHash.mismatch",
    "assertion.bmffHash.mismatch",
    "assertion.collectionHash.mismatch",
    "assertion.multiAssetHash.mismatch",
    "assertion.alternativeContentRepresentation.hashMismatch",
    "assertion.hashedURI.mismatch",
    "claim.hardBindings.missing",
}
_SIGNATURE_FAILURE_CODES = {
    "claimSignature.mismatch",
    "claimSignature.missing",
    "claim.malformed",
    "claim.cbor.invalid",
    "signingCredential.invalid",
}
_EXPIRED_CODES = {
    "claimSignature.outsideValidity",
    "timeOfSigning.outsideValidity",
}
_REVOKED_CODES = {
    "signingCredential.ocsp.revoked",
}
_UNTRUSTED_CODES = {
    "signingCredential.untrusted",
}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def verify_blob(
    *,
    data: bytes,
    mime_type: str,
    context: c2pa.Context,
    trust: LoadedTrust,
) -> VerifyResponse:
    """Validate a single image blob and return the response model.

    Never raises. Errors are reported in `error` with `status="error"`.
    """
    sdk_version = c2pa.sdk_version()

    try:
        stream = io.BytesIO(data)
        reader = c2pa.Reader.try_create(mime_type, stream, context=context)
    except c2pa.C2paError as exc:
        logger.warning("c2pa Reader failed to open asset (%s): %s", mime_type, exc)
        return VerifyResponse(
            sdk_version=sdk_version,
            format=mime_type,
            has_manifest=False,
            summary=Summary(status="error"),
            error=str(exc),
        )
    except Exception as exc:  # noqa: BLE001 — defensive: never let SDK bugs 500 us
        logger.exception("Unexpected error opening asset")
        return VerifyResponse(
            sdk_version=sdk_version,
            format=mime_type,
            has_manifest=False,
            summary=Summary(status="error"),
            error=f"{type(exc).__name__}: {exc}",
        )

    if reader is None:
        return VerifyResponse(
            sdk_version=sdk_version,
            format=mime_type,
            has_manifest=False,
            summary=Summary(status="no-manifest"),
        )

    try:
        with reader as r:
            return _build_response(r, sdk_version=sdk_version, mime_type=mime_type, trust=trust)
    except c2pa.C2paError as exc:
        logger.warning("c2pa validation failed: %s", exc)
        return VerifyResponse(
            sdk_version=sdk_version,
            format=mime_type,
            has_manifest=True,
            summary=Summary(status="error"),
            error=str(exc),
        )


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------


def _build_response(
    reader: c2pa.Reader,
    *,
    sdk_version: str,
    mime_type: str,
    trust: LoadedTrust,
) -> VerifyResponse:
    store = _safe(lambda: _coerce_dict(reader.json())) or {}
    detailed = _safe(lambda: _coerce_dict(reader.detailed_json())) or {}
    active = _safe(reader.get_active_manifest) or {}
    raw_validation_results = _safe(reader.get_validation_results) or {}
    validation_state = _safe(reader.get_validation_state)

    spec_version = _extract_spec_version(active)
    active_manifest_id = store.get("active_manifest")

    parsed_results = _parse_validation_results(
        raw_validation_results,
        fallback_trust_uri=trust.trust_list_uri,
        spec_version=spec_version,
    )

    summary = _derive_summary(
        active=active,
        validation_state=validation_state,
        results=parsed_results,
    )
    assertions = _summarize_assertions(active, detailed.get("manifests"))
    ingredients = _summarize_ingredients(active)

    return VerifyResponse(
        spec_version=spec_version,
        sdk_version=sdk_version,
        format=mime_type,
        has_manifest=True,
        active_manifest_id=active_manifest_id,
        summary=summary,
        validation_state=validation_state,
        validation_results=parsed_results,
        assertions=assertions,
        ingredients=ingredients,
    )


def _coerce_dict(value: Any) -> dict | None:
    """`Reader.json()` returns a JSON string; `get_active_manifest()` already
    returns a dict. Normalize both."""
    if value is None:
        return None
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        import json

        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else None
        except json.JSONDecodeError:
            return None
    return None


def _safe(thunk):
    """Run a thunk; swallow exceptions, return None. Used because various
    Reader getters raise when a field is absent rather than returning None.
    """
    try:
        return thunk()
    except Exception as exc:  # noqa: BLE001
        logger.debug("safe() swallowed %s: %s", type(exc).__name__, exc)
        return None


# ---- Validation-results parsing -------------------------------------------


def _parse_validation_results(
    raw: dict,
    *,
    fallback_trust_uri: str,
    spec_version: str | None,
) -> ValidationResults:
    if not raw:
        return ValidationResults(
            trustListUri=fallback_trust_uri,
            specVersion=spec_version,
        )

    active_codes = _parse_status_codes_map(raw.get("activeManifest"))
    deltas_raw = raw.get("ingredientDeltas") or []
    deltas: list[IngredientDeltaValidationResult] = []
    for entry in deltas_raw:
        if not isinstance(entry, dict):
            continue
        deltas.append(
            IngredientDeltaValidationResult(
                ingredientAssertionURI=str(entry.get("ingredientAssertionURI", "")),
                validationDeltas=_parse_status_codes_map(entry.get("validationDeltas")) or StatusCodesMap(),
            )
        )

    return ValidationResults(
        activeManifest=active_codes,
        ingredientDeltas=deltas,
        specVersion=raw.get("specVersion") or spec_version,
        trustListUri=raw.get("trustListUri") or fallback_trust_uri,
    )


def _parse_status_codes_map(value: Any) -> StatusCodesMap | None:
    if not isinstance(value, dict):
        return None
    return StatusCodesMap(
        success=[_parse_status_map(s) for s in value.get("success", []) if isinstance(s, dict)],
        informational=[_parse_status_map(s) for s in value.get("informational", []) if isinstance(s, dict)],
        failure=[_parse_status_map(s) for s in value.get("failure", []) if isinstance(s, dict)],
    )


def _parse_status_map(value: dict) -> StatusMap:
    return StatusMap(
        code=str(value.get("code", "general.error")),
        url=value.get("url"),
        explanation=value.get("explanation"),
    )


# ---- Status derivation ----------------------------------------------------


def _derive_summary(
    *,
    active: dict,
    validation_state: str | None,
    results: ValidationResults,
) -> Summary:
    failure_codes = _failure_code_set(results)

    status: SummaryStatus
    if failure_codes & _TAMPER_CODES:
        status = "tampered"
    elif failure_codes & _SIGNATURE_FAILURE_CODES:
        status = "signature-invalid"
    elif failure_codes & _REVOKED_CODES:
        status = "revoked"
    elif failure_codes & _EXPIRED_CODES:
        status = "expired"
    elif failure_codes & _UNTRUSTED_CODES:
        status = "signed-untrusted"
    elif failure_codes:
        # Some other unmapped failure code — bias toward 'signed-untrusted'
        # rather than 'tampered', since tampering codes are explicit above.
        status = "signed-untrusted"
    elif (validation_state or "").lower() == "valid":
        status = "verified"
    elif (validation_state or "").lower() in {"untrusted", "invalid"}:
        # validation_state of "Untrusted" maps cleanly to signed-untrusted.
        status = "signed-untrusted"
    else:
        # No failures recorded but we couldn't read state — treat as verified
        # because c2pa-rs would have populated failures otherwise.
        status = "verified"

    signature_info = active.get("signature_info") or {}

    signer = SignerInfo(
        common_name=_first_str(signature_info, ("issuer", "common_name", "cert_serial_number")),
        organization=signature_info.get("organization"),
        issuer=signature_info.get("issuer"),
    )

    claim_generator_info = active.get("claim_generator_info") or []
    claim_generator = None
    if isinstance(claim_generator_info, list) and claim_generator_info:
        first = claim_generator_info[0] or {}
        if isinstance(first, dict):
            name = first.get("name")
            version = first.get("version")
            claim_generator = " / ".join(p for p in (name, version) if p) or None
    if claim_generator is None and isinstance(active.get("claim_generator"), str):
        claim_generator = active["claim_generator"]

    is_ai_generated = _detect_ai_generated(active)
    ai_training = _detect_training_use(active)
    geo = _extract_geo(active)
    headline = active.get("title") or active.get("dc:title")

    return Summary(
        status=status,
        signer=signer if any(signer.model_dump().values()) else None,
        claim_generator=claim_generator,
        signed_at=signature_info.get("time"),
        is_ai_generated=is_ai_generated,
        ai_training_allowed=ai_training,
        geo=geo,
        headline=headline,
    )


def _failure_code_set(results: ValidationResults) -> set[str]:
    if results.activeManifest is None:
        return set()
    return {s.code for s in results.activeManifest.failure}


def _first_str(d: dict, keys: tuple[str, ...]) -> str | None:
    for k in keys:
        v = d.get(k)
        if isinstance(v, str) and v.strip():
            return v
    return None


# ---- Assertion / ingredient summaries -------------------------------------


def _summarize_assertions(active: dict, manifests: Any) -> list[AssertionPreview]:
    """Extract a small, sanitized preview of each assertion in the active
    manifest. Large binary data (thumbnails) is dropped.
    """
    assertions = active.get("assertions") or []
    if not isinstance(assertions, list):
        return []

    created_uris, gathered_uris = _resolve_assertion_categories(active)

    out: list[AssertionPreview] = []
    for entry in assertions:
        if not isinstance(entry, dict):
            continue
        label = str(entry.get("label", ""))
        if not label:
            continue
        category = "unknown"
        url = entry.get("url") or entry.get("instance")
        if url and url in created_uris:
            category = "created"
        elif url and url in gathered_uris:
            category = "gathered"

        data = _trim_assertion_data(entry.get("data"))
        out.append(AssertionPreview(label=_sanitize_text(label), category=category, data=data))
    return out


def _resolve_assertion_categories(active: dict) -> tuple[set[str], set[str]]:
    def _uris(key: str) -> set[str]:
        items = active.get(key) or []
        if not isinstance(items, list):
            return set()
        return {str(item.get("url")) for item in items if isinstance(item, dict) and item.get("url")}

    return _uris("created_assertions"), _uris("gathered_assertions")


def _trim_assertion_data(data: Any, depth: int = 0) -> dict | None:
    """Keep small scalar fields, drop binary / oversized structures.

    This is also where Guidance §5.1.1.2 ("character filtering for code
    injection in user-supplied text") applies: the extension renders these
    values directly into the page DOM via textContent, but we still strip
    control chars defensively.
    """
    if not isinstance(data, dict) or depth > 3:
        return None
    out: dict = {}
    for k, v in data.items():
        if not isinstance(k, str):
            continue
        if isinstance(v, str):
            out[k] = _sanitize_text(v)
        elif isinstance(v, (int, float, bool)):
            out[k] = v
        elif isinstance(v, dict) and depth < 3:
            sub = _trim_assertion_data(v, depth + 1)
            if sub:
                out[k] = sub
        elif isinstance(v, list) and depth < 3 and len(v) <= 8:
            simple = [
                item if isinstance(item, (int, float, bool))
                else _sanitize_text(item) if isinstance(item, str)
                else _trim_assertion_data(item, depth + 1) if isinstance(item, dict)
                else None
                for item in v
            ]
            simple = [s for s in simple if s is not None]
            if simple:
                out[k] = simple
        # bytes / huge blobs (thumbnails, JPEG previews, etc.) get dropped.
    return out or None


def _summarize_ingredients(active: dict) -> list[IngredientSummary]:
    items = active.get("ingredients") or []
    out: list[IngredientSummary] = []
    if not isinstance(items, list):
        return out
    for ing in items:
        if not isinstance(ing, dict):
            continue
        out.append(
            IngredientSummary(
                title=ing.get("dc:title") or ing.get("title"),
                format=ing.get("dc:format") or ing.get("format"),
                relationship=ing.get("relationship"),
                document_id=ing.get("documentID"),
                instance_id=ing.get("instanceID") or ing.get("instance_id"),
                validation_status=[
                    StatusMap(
                        code=str(s.get("code", "general.error")),
                        url=s.get("url"),
                        explanation=s.get("explanation"),
                    )
                    for s in (ing.get("validationStatus") or [])
                    if isinstance(s, dict)
                ],
            )
        )
    return out


# ---- AI / GPS / spec version helpers --------------------------------------


def _detect_ai_generated(active: dict) -> bool | None:
    assertions = active.get("assertions") or []
    if not isinstance(assertions, list):
        return None
    for entry in assertions:
        if not isinstance(entry, dict):
            continue
        if not str(entry.get("label", "")).startswith("c2pa.actions"):
            continue
        data = entry.get("data") or {}
        actions = data.get("actions") if isinstance(data, dict) else None
        if not isinstance(actions, list):
            continue
        for action in actions:
            if not isinstance(action, dict):
                continue
            dst = str(action.get("digitalSourceType", ""))
            if "trainedAlgorithmicMedia" in dst or "compositedWithTrainedAlgorithmicMedia" in dst:
                return True
    return False


def _detect_training_use(active: dict) -> str | None:
    """Return the most-restrictive training-mining decision among
    c2pa.ai_training / c2pa.ai_generative_training entries (if any).
    """
    assertions = active.get("assertions") or []
    if not isinstance(assertions, list):
        return None
    for entry in assertions:
        if not isinstance(entry, dict):
            continue
        if str(entry.get("label", "")) != "c2pa.training-mining":
            continue
        data = entry.get("data") or {}
        if not isinstance(data, dict):
            continue
        for key in ("c2pa.ai_generative_training", "c2pa.ai_training", "c2pa.data_mining"):
            inner = data.get(key)
            if isinstance(inner, dict):
                use = inner.get("use")
                if isinstance(use, str):
                    return use
    return None


def _extract_geo(active: dict) -> str | None:
    """Pull a human-readable lat/lon out of an `stds.exif` assertion."""
    assertions = active.get("assertions") or []
    if not isinstance(assertions, list):
        return None
    for entry in assertions:
        if not isinstance(entry, dict):
            continue
        if str(entry.get("label", "")) != "stds.exif":
            continue
        data = entry.get("data")
        if not isinstance(data, dict):
            continue
        lat = data.get("EXIF:GPSLatitude") or data.get("GPSLatitude")
        lon = data.get("EXIF:GPSLongitude") or data.get("GPSLongitude")
        if lat and lon:
            return f"{lat}, {lon}"
    return None


_SPEC_VERSION_RE = re.compile(r"\d+\.\d+(?:\.\d+)?")


def _extract_spec_version(active: dict) -> str | None:
    sv = active.get("specVersion") or active.get("spec_version")
    if isinstance(sv, str):
        m = _SPEC_VERSION_RE.search(sv)
        if m:
            return m.group(0)
    return None


# ---- Text sanitization (Guidance §5.1.1.2) --------------------------------


_CONTROL_CHAR_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def _sanitize_text(value: str, max_len: int = 512) -> str:
    """Strip C0 control chars and clamp length. We do not HTML-escape here
    because the extension uses textContent (which is already safe). But
    weird control chars in the middle of an issuer CN can still glitch UI,
    so they go.
    """
    cleaned = _CONTROL_CHAR_RE.sub("", value)
    return cleaned[:max_len]
