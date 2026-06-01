"""Pydantic models for the HTTP response.

Shape mirrors C2PA Technical Specification §15.2 and the
`validation-results-map` CDDL schema, so that responses are directly
comparable to other conforming validators (e.g. `c2patool`).

Fields under `summary`, `assertions`, `ingredients`, and `signer` are
*derived* convenience fields the extension UI keys off; the canonical
spec data lives under `validation_results` and `validation_state`.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Spec-shaped types (validation-results.cddl)
# ---------------------------------------------------------------------------


class StatusMap(BaseModel):
    """One entry in success/informational/failure (validation-results.cddl)."""

    code: str
    url: str | None = None
    explanation: str | None = None


class StatusCodesMap(BaseModel):
    """`status-codes-map` from validation-results.cddl."""

    success: list[StatusMap] = Field(default_factory=list)
    informational: list[StatusMap] = Field(default_factory=list)
    failure: list[StatusMap] = Field(default_factory=list)


class IngredientDeltaValidationResult(BaseModel):
    """`ingredient-delta-validation-result-map` from validation-results.cddl."""

    ingredientAssertionURI: str
    validationDeltas: StatusCodesMap


class ValidationResults(BaseModel):
    """`validation-results-map` — the structure §15.2 mandates validators return."""

    activeManifest: StatusCodesMap | None = None
    ingredientDeltas: list[IngredientDeltaValidationResult] = Field(default_factory=list)
    specVersion: str | None = None
    trustListUri: str | None = None


# ---------------------------------------------------------------------------
# Convenience / derived types — what the extension UI actually consumes.
# ---------------------------------------------------------------------------


SummaryStatus = Literal[
    "verified",
    "signed-untrusted",
    "tampered",
    "signature-invalid",
    "expired",
    "revoked",
    "no-manifest",
    "error",
]


class SignerInfo(BaseModel):
    common_name: str | None = None
    organization: str | None = None
    issuer: str | None = None


class Summary(BaseModel):
    """The single most important block for the extension overlay.

    `status` drives the colour of the pill; the rest is human-readable
    context. All fields are optional because manifests vary wildly.
    """

    status: SummaryStatus
    signer: SignerInfo | None = None
    claim_generator: str | None = None
    signed_at: str | None = None
    is_ai_generated: bool | None = None
    ai_training_allowed: str | None = None
    geo: str | None = None
    headline: str | None = None


class AssertionPreview(BaseModel):
    """A trimmed summary of one assertion. `data` is intentionally a small
    dict — large binary blobs (thumbnails, etc.) are dropped.
    """

    label: str
    category: Literal["created", "gathered", "unknown"] = "unknown"
    data: dict | None = None


class IngredientSummary(BaseModel):
    title: str | None = None
    format: str | None = None
    relationship: str | None = None
    document_id: str | None = None
    instance_id: str | None = None
    validation_status: list[StatusMap] = Field(default_factory=list)


class VerifyResponse(BaseModel):
    spec_version: str | None = None
    sdk_version: str | None = None
    format: str | None = None
    has_manifest: bool
    active_manifest_id: str | None = None

    summary: Summary
    validation_state: str | None = None
    validation_results: ValidationResults = Field(default_factory=ValidationResults)

    assertions: list[AssertionPreview] = Field(default_factory=list)
    ingredients: list[IngredientSummary] = Field(default_factory=list)

    error: str | None = None


class HealthResponse(BaseModel):
    status: Literal["ok"]
    service: str = "geolens-c2pa-backend"
    version: str
    sdk_version: str
    trust_profile: str
    trust_anchors_loaded: int
    ocsp_live: bool
