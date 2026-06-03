"""FastAPI application for GeoLens C2PA validation.

Run with:

    uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
"""

from __future__ import annotations

import logging
import mimetypes
from contextlib import asynccontextmanager

import c2pa
from fastapi import FastAPI, File, HTTPException, Request, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import __version__
from .models import HealthResponse, VerifyResponse
from .settings import settings
from .trust import (
    LoadedTrust,
    build_c2pa_settings_dict,
    load_conformant_trust,
    load_trust,
)
from .verify import verify_blob

logger = logging.getLogger("geolens.c2pa")
logging.basicConfig(level=settings.log_level)


# Filled in during the lifespan startup. Stored on the app instance so
# tests can inject their own context easily.
class AppState:
    trust: LoadedTrust | None = None
    context: c2pa.Context | None = None
    # Conformant-only (active profile minus the ITL). Populated only when the
    # active profile includes the Interim Trust List, so we can tell whether a
    # Trusted result depended on the ITL ("legacy") or holds without it.
    conformant_trust: LoadedTrust | None = None
    conformant_context: c2pa.Context | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    trust = load_trust(settings)
    sdk_settings = build_c2pa_settings_dict(trust, ocsp_live=settings.ocsp_live)
    c2pa_settings = c2pa.Settings.from_dict(sdk_settings)
    context = c2pa.Context(settings=c2pa_settings)

    app.state.app_state = AppState()
    app.state.app_state.trust = trust
    app.state.app_state.context = context

    # Build a second, conformant-only context for trust-tier detection.
    conformant_trust = load_conformant_trust(settings)
    if conformant_trust is not None:
        conformant_settings = build_c2pa_settings_dict(
            conformant_trust, ocsp_live=settings.ocsp_live
        )
        app.state.app_state.conformant_trust = conformant_trust
        app.state.app_state.conformant_context = c2pa.Context(
            settings=c2pa.Settings.from_dict(conformant_settings)
        )

    logger.info(
        "C2PA backend ready: profile=%s anchors=%d (conformant anchors=%s) sdk=%s",
        trust.profile,
        trust.anchor_count,
        conformant_trust.anchor_count if conformant_trust else "n/a",
        c2pa.sdk_version(),
    )
    try:
        yield
    finally:
        # c2pa.Context owns native resources; let the runtime collect them.
        app.state.app_state.context = None
        app.state.app_state.conformant_context = None


app = FastAPI(
    title="GeoLens C2PA Validator",
    version=__version__,
    description=(
        "FastAPI wrapper around c2pa-python that validates C2PA Content "
        "Credentials in images for the GeoLens browser extension."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.get("/health", response_model=HealthResponse)
def health(request: Request) -> HealthResponse:
    state: AppState = request.app.state.app_state
    return HealthResponse(
        status="ok",
        version=__version__,
        sdk_version=c2pa.sdk_version(),
        trust_profile=state.trust.profile if state.trust else "unknown",
        trust_anchors_loaded=state.trust.anchor_count if state.trust else 0,
        ocsp_live=settings.ocsp_live,
    )


@app.post("/c2pa/verify", response_model=VerifyResponse)
async def verify_image(
    request: Request,
    file: UploadFile = File(..., description="Image to validate."),
) -> VerifyResponse:
    state: AppState = request.app.state.app_state
    if state.context is None or state.trust is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Validator not initialized.",
        )

    data = await file.read()
    if not data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Empty upload.",
        )

    if len(data) > settings.max_upload_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Upload exceeds {settings.max_upload_bytes} bytes.",
        )

    mime_type = file.content_type or mimetypes.guess_type(file.filename or "")[0] or "image/jpeg"

    response = verify_blob(
        data=data,
        mime_type=mime_type,
        context=state.context,
        trust=state.trust,
    )

    # If the image is Verified under the full (incl. ITL) trust list, re-check
    # it against the conformant-only anchors. If it no longer verifies there,
    # the signer is only on the frozen Interim Trust List → "legacy" trust,
    # which the C2PA Conformance Program has not evaluated. Surface that as a
    # distinct status so the UI can show it differently from full conformance.
    if (
        response.summary.status == "verified"
        and state.conformant_context is not None
        and state.conformant_trust is not None
    ):
        conformant = verify_blob(
            data=data,
            mime_type=mime_type,
            context=state.conformant_context,
            trust=state.conformant_trust,
        )
        if conformant.summary.status != "verified":
            response.summary.status = "verified-legacy"

    return response


@app.post("/c2pa/discover")
async def discover_via_soft_binding(file: UploadFile = File(...)) -> JSONResponse:
    """Soft-binding lookup (Guidance §4.2–§4.3). Reserved for future work.

    Will eventually compute a soft binding (watermark / fingerprint) from
    the image and query a manifest repository implementing the C2PA Soft
    Binding Resolution API.
    """
    return JSONResponse(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        content={
            "detail": "Soft-binding discovery is not implemented yet.",
            "spec_reference": "C2PA Implementation Guidance §4.2–§4.3",
        },
    )
