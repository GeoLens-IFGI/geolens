"""Generate the three test fixtures + a self-signed dev trust anchor.

Producing these locally (rather than checking binary blobs into git) keeps
the repository small and lets contributors regenerate fresh certs at any
time. After this script runs, `tests/fixtures/` contains:

    verified.jpg   -- a tiny JPEG signed with a self-signed dev cert
    tampered.jpg   -- a copy of verified.jpg with one pixel byte flipped
    no_manifest.jpg -- a tiny JPEG with no C2PA manifest

and `trust/dev_anchor.pem` contains the dev CA cert that the `dev`
trust profile loads. None of these are committed to git.

Run directly:
    python tests/fixtures/make_fixtures.py

Or let the pytest fixtures call this on first test run.
"""

from __future__ import annotations

import datetime as dt
import io
import sys
from pathlib import Path

import c2pa
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / "tests" / "fixtures"
TRUST = ROOT / "trust"

VERIFIED = FIXTURES / "verified.jpg"
TAMPERED = FIXTURES / "tampered.jpg"
NO_MANIFEST = FIXTURES / "no_manifest.jpg"

DEV_ANCHOR = TRUST / "dev_anchor.pem"
DEV_SIGNING_CERT = TRUST / "dev_signing.cert.pem"
DEV_SIGNING_KEY = TRUST / "dev_signing.key.pem"


def _make_jpeg(width: int = 64, height: int = 64, color: tuple[int, int, int] = (32, 96, 200)) -> bytes:
    """A small unsigned JPEG to use as the base asset."""
    buf = io.BytesIO()
    Image.new("RGB", (width, height), color).save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def _make_dev_ca_and_signing_cert() -> tuple[bytes, bytes, bytes]:
    """Generate a self-signed CA + a signing certificate suitable for c2pa-rs.

    Returns (ca_pem, signing_cert_pem, signing_key_pem).
    """
    now = dt.datetime.now(dt.timezone.utc)

    ca_key = ec.generate_private_key(ec.SECP256R1())
    ca_subject = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, "GeoLens Dev CA"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "GeoLens (dev only)"),
    ])
    ca_cert = (
        x509.CertificateBuilder()
        .subject_name(ca_subject)
        .issuer_name(ca_subject)
        .public_key(ca_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - dt.timedelta(days=1))
        .not_valid_after(now + dt.timedelta(days=365 * 5))
        .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
        .add_extension(x509.KeyUsage(
            digital_signature=False,
            content_commitment=False,
            key_encipherment=False,
            data_encipherment=False,
            key_agreement=False,
            key_cert_sign=True,
            crl_sign=True,
            encipher_only=False,
            decipher_only=False,
        ), critical=True)
        .sign(ca_key, hashes.SHA256())
    )

    signing_key = ec.generate_private_key(ec.SECP256R1())
    signing_subject = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, "GeoLens Dev Signer"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "GeoLens (dev only)"),
    ])
    signing_cert = (
        x509.CertificateBuilder()
        .subject_name(signing_subject)
        .issuer_name(ca_subject)
        .public_key(signing_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - dt.timedelta(minutes=5))
        .not_valid_after(now + dt.timedelta(days=365))
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        .add_extension(x509.KeyUsage(
            digital_signature=True,
            content_commitment=True,
            key_encipherment=False,
            data_encipherment=False,
            key_agreement=False,
            key_cert_sign=False,
            crl_sign=False,
            encipher_only=False,
            decipher_only=False,
        ), critical=True)
        .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.EMAIL_PROTECTION]), critical=False)
        .sign(ca_key, hashes.SHA256())
    )

    pem_encoding = serialization.Encoding.PEM
    ca_pem = ca_cert.public_bytes(pem_encoding)
    signing_cert_pem = signing_cert.public_bytes(pem_encoding) + ca_cert.public_bytes(pem_encoding)
    signing_key_pem = signing_key.private_bytes(
        encoding=pem_encoding,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    return ca_pem, signing_cert_pem, signing_key_pem


def _sign_jpeg(unsigned_jpeg: bytes, signing_cert_pem: bytes, signing_key_pem: bytes) -> bytes:
    """Use c2pa-python's Builder to attach a manifest to the JPEG."""
    manifest = {
        "claim_generator_info": [{"name": "geolens-test", "version": "0.1.0"}],
        "title": "GeoLens dev fixture",
        "format": "image/jpeg",
        "assertions": [
            {
                "label": "c2pa.actions.v2",
                "data": {
                    "actions": [
                        {
                            "action": "c2pa.created",
                            "digitalSourceType": (
                                "http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture"
                            ),
                        }
                    ]
                },
            }
        ],
    }

    signer_info = c2pa.C2paSignerInfo(
        alg=b"es256",
        sign_cert=signing_cert_pem,
        private_key=signing_key_pem,
        ta_url=b"",
    )
    signer = c2pa.Signer.from_info(signer_info)

    builder = c2pa.Builder.from_json(manifest)
    src = io.BytesIO(unsigned_jpeg)
    dst = io.BytesIO()
    builder.sign(signer, "image/jpeg", src, dst)
    return dst.getvalue()


def _flip_one_pixel_byte(signed: bytes) -> bytes:
    """Tamper with a byte in the JPEG entropy-coded segment so that the
    hard binding's data hash will fail to match.

    JPEG markers are 0xFF-prefixed; the SOS (Start Of Scan, 0xFFDA) marker
    introduces the entropy-coded image data segment. Flipping a byte
    *inside* that segment alters the visible image and breaks the C2PA
    data-hash assertion. Flipping a byte in the C2PA JUMBF box itself
    would instead break the claim signature — useful test, but not what
    "tampered image" usually means.
    """
    marker = bytes([0xFF, 0xDA])
    sos_pos = signed.find(marker)
    if sos_pos == -1:
        # Fallback: just flip a late byte; some validators will still
        # reject this, just via a different code path.
        sos_pos = max(0, len(signed) - 256)

    # Move past the SOS header (length-prefixed), then a few bytes in.
    target = sos_pos + 64
    if target >= len(signed) - 2:
        target = len(signed) - 2

    out = bytearray(signed)
    out[target] ^= 0x55
    return bytes(out)


def main() -> int:
    FIXTURES.mkdir(parents=True, exist_ok=True)
    TRUST.mkdir(parents=True, exist_ok=True)

    print(f"[fixtures] generating dev CA + signing cert in {TRUST}")
    ca_pem, signing_cert_pem, signing_key_pem = _make_dev_ca_and_signing_cert()
    DEV_ANCHOR.write_bytes(ca_pem)
    DEV_SIGNING_CERT.write_bytes(signing_cert_pem)
    DEV_SIGNING_KEY.write_bytes(signing_key_pem)
    print(f"[fixtures] wrote {DEV_ANCHOR}")
    print(f"[fixtures] wrote {DEV_SIGNING_CERT}")
    print(f"[fixtures] wrote {DEV_SIGNING_KEY}")

    print("[fixtures] building no_manifest.jpg")
    base = _make_jpeg(color=(220, 60, 60))
    NO_MANIFEST.write_bytes(base)

    print("[fixtures] building verified.jpg (signing with dev cert)")
    signed_base = _make_jpeg(color=(40, 160, 90))
    signed = _sign_jpeg(signed_base, signing_cert_pem, signing_key_pem)
    VERIFIED.write_bytes(signed)

    print("[fixtures] building tampered.jpg (flipping one byte in signed JPEG)")
    TAMPERED.write_bytes(_flip_one_pixel_byte(signed))

    print("[fixtures] done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
