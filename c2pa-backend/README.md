# GeoLens C2PA Validator Backend

A small FastAPI service that validates [C2PA Content Credentials](https://c2pa.org/specifications)
in images. It is designed as a sibling to the existing GeoCam validator
(`localhost:8000`) and is consumed by the GeoLens browser extension as a
**second, independent validation method**.

The service wraps [`c2pa-python`](https://github.com/contentauth/c2pa-python),
the official Python binding for the Rust reference implementation
(`c2pa-rs`). All cryptographic work — JUMBF parsing, COSE signature
verification, X.509 chain walking, OCSP / time-stamp handling, hard-binding
hashes, recursive ingredient validation — is delegated to that library.

The HTTP response shape mirrors the
[`validation-results-map`](https://spec.c2pa.org/specifications/specifications/2.3/specs/C2PA_Specification.html#_validation_results)
CDDL schema from the C2PA Technical Specification (§15.2). That makes the
output directly comparable to `c2patool` output and forward-compatible with
future spec versions.

## What this service is *not*

- It is **not a Claim Generator**. It does not sign images. (`c2pa-python`
  can do that too — out of scope here.)
- It does **not** implement the C2PA Soft Binding Resolution API
  (Guidance §4.2–§4.3). A `/c2pa/discover` route is reserved as a stretch
  goal but currently returns 501.
- It does **not** issue value judgements about *truthfulness*. As the C2PA
  Explainer (§7.2.2) makes very clear, provenance ≠ truth. The service only
  reports whether the manifest is well-formed, internally consistent, and
  signed by a credential traceable to a configured trust list.

## Endpoints

| Method | Path             | Purpose                                              |
| ------ | ---------------- | ---------------------------------------------------- |
| `GET`  | `/health`        | Liveness + which trust profile is active             |
| `POST` | `/c2pa/verify`   | Validate a manifest embedded in the uploaded image   |
| `POST` | `/c2pa/discover` | (Reserved, returns 501) Soft-binding lookup          |

### `POST /c2pa/verify`

```bash
curl -F "file=@my_image.jpg" http://localhost:8001/c2pa/verify
```

Response shape (abridged):

```json
{
  "spec_version": "2.3",
  "format": "image/jpeg",
  "has_manifest": true,
  "active_manifest_id": "urn:c2pa:6b8e...:abc",
  "summary": {
    "status": "verified",
    "signer_common_name": "Leica Camera AG",
    "claim_generator": "Leica M11 / 1.2.0",
    "signed_at": "2024-09-12T14:03:11Z",
    "is_ai_generated": false
  },
  "validation_state": "Valid",
  "validation_results": {
    "activeManifest": {
      "success": [{"code": "claimSignature.validated"}],
      "informational": [],
      "failure": []
    },
    "ingredientDeltas": [],
    "trustListUri": "file://./trust/c2pa_trust_list.pem"
  },
  "assertions": [
    {"label": "c2pa.actions.v2", "category": "created"}
  ],
  "ingredients": []
}
```

The top-level `summary.status` is the field the extension UI keys off:

| `status`            | Meaning                                                                       |
| ------------------- | ----------------------------------------------------------------------------- |
| `verified`          | Cryptographically valid AND signer on the configured trust list               |
| `signed-untrusted`  | Manifest is internally valid, but signer is not on the trust list (common!)   |
| `tampered`          | Hard binding broken — pixels or boxes changed after signing                   |
| `signature-invalid` | Signature itself is malformed or wrong                                        |
| `expired`           | Cert was outside its validity period at signing time                          |
| `revoked`           | Signing credential was revoked (per stapled OCSP)                             |
| `no-manifest`       | No C2PA Manifest Store in the file (the **normal** state for most web images) |
| `error`             | Could not parse the file at all                                               |

## Trust profile

The single most important configuration knob is `C2PA_TRUST_PROFILE`. It
determines what counts as "Verified". See `trust/README.md`.

| Profile          | Anchors used                                                       | Use for                |
| ---------------- | ------------------------------------------------------------------ | ---------------------- |
| `c2pa-prod`      | The official C2PA Trust List + C2PA TSA Trust List                 | Production             |
| `c2pa-prod+itl`  | Above + the Interim Trust List (frozen Jan 1, 2026, transition)    | **Recommended default** |
| `dev`            | A local self-signed dev anchor (for testing GeoCam-issued certs)   | Local dev / CI         |

## Quick start (local Python)

```bash
cd c2pa-backend
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"

# Generate test fixtures + dev trust anchor (one-time)
python tests/fixtures/make_fixtures.py

# Run the service
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload

# In another terminal, sanity-check
curl http://localhost:8001/health
curl -F "file=@tests/fixtures/verified.jpg" http://localhost:8001/c2pa/verify | jq .summary.status
```

## Quick start (Docker)

```bash
docker compose up --build
```

This brings up the C2PA backend on `localhost:8001` alongside the existing
GeoCam service convention on `localhost:8000` (which you run separately).

## Running tests

```bash
pytest -q
```

The first test run auto-generates the three fixtures
(`verified.jpg`, `tampered.jpg`, `no_manifest.jpg`) plus a dev CA in
`trust/dev_anchor.pem`. The fixtures are gitignored.

## Specification cross-references

This service implements (via `c2pa-python`) the validator flow defined in:

- C2PA Technical Specification §15.1–§15.12 (Validation)
- C2PA Technical Specification §13 (Cryptography: SHA-256, ES256/PS256/EdDSA)
- C2PA Technical Specification §14 (Trust Model)
- C2PA Implementation Guidance §6 (Trust)
- C2PA Implementation Guidance §7 (Validation security practices)

Response schema mirrors `validation-results-map` from `validation-results.cddl`.

## Limitations

- Live OCSP queries are **off** by default to avoid leaking the user's
  reading habits to third-party CAs (Guidance §6.2.4). Stapled OCSP info
  attached to the signature is still consumed.
- External / cloud manifests (Spec §11.4) are not yet fetched — only
  embedded manifests are read.
- Only the active manifest's high-level summary is exposed in `summary`.
  The full manifest tree is in `validation_results` and `assertions` for
  consumers that want it.
