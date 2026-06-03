#!/usr/bin/env bash
#
# fetch-trust.sh — download the C2PA production trust bundles into ./trust.
#
# The PEM bundles are authoritative artifacts published by C2PA, not owned by
# this project, so they are NOT committed (see trust/.gitignore). This script
# plus trust/SHA256SUMS are what make the trust setup reproducible: pinned
# source URLs + recorded digests let anyone recreate the exact trust/ contents.
#
#   c2pa_trust_list.pem      official C2PA Trust List      (LIVE — grows over time)
#   c2pa_tsa_trust_list.pem  official C2PA TSA Trust List  (LIVE — grows over time)
#   c2pa_itl.pem             Interim Trust List            (FROZEN 2026-01-01)
#
# Checksum policy:
#   - ITL is frozen, so its digest is pinned here and a mismatch is a HARD ERROR
#     (tamper / drift detection).
#   - The TL/TSA lists are live, so a digest change is expected; the script WARNs
#     and tells you to re-pin with `--update` once you've reviewed the change.
#
# Usage:
#   ./fetch-trust.sh            # fetch + verify against trust/SHA256SUMS
#   ./fetch-trust.sh --update   # fetch + re-pin trust/SHA256SUMS to current bytes
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TRUST_DIR="$SCRIPT_DIR/trust"
MANIFEST="$TRUST_DIR/SHA256SUMS"

UPDATE=0
[[ "${1:-}" == "--update" ]] && UPDATE=1

# --- Pinned sources -------------------------------------------------------
# Official C2PA Conformance Program trust lists (used by conformant products).
TL_URL="https://raw.githubusercontent.com/c2pa-org/conformance-public/refs/heads/main/trust-list/C2PA-TRUST-LIST.pem"
TSA_URL="https://raw.githubusercontent.com/c2pa-org/conformance-public/refs/heads/main/trust-list/C2PA-TSA-TRUST-LIST.pem"
# Interim Trust List anchors. Canonical published mirror:
#   https://contentcredentials.org/trust/anchors.pem
# We fetch from the verify-site source repo so the bytes match the pinned digest
# below; pin to a commit SHA instead of `main` for an even stronger guarantee.
ITL_URL="https://raw.githubusercontent.com/contentauth/verify-site/main/static/trust/anchors.pem"

# Frozen ITL: pinned digest. This list will never change again, so any mismatch
# means the upstream bytes differ from what this project was built against.
ITL_SHA256_PINNED="548162bdaede6e05ae7c0029c77df42a305ed7b7312cd8514f490bd716344c52"

# filename -> source URL
NAMES=(c2pa_trust_list.pem c2pa_tsa_trust_list.pem c2pa_itl.pem)
URLS=("$TL_URL" "$TSA_URL" "$ITL_URL")
# Files whose digests are allowed to drift (live lists).
LIVE_FILES=" c2pa_trust_list.pem c2pa_tsa_trust_list.pem "

sha256_of() { sha256sum "$1" | cut -d' ' -f1; }

mkdir -p "$TRUST_DIR"

echo "Fetching trust bundles into $TRUST_DIR"
for i in "${!NAMES[@]}"; do
  name="${NAMES[$i]}"
  url="${URLS[$i]}"
  dest="$TRUST_DIR/$name"
  echo "→ $name"
  echo "    from $url"
  curl -fsSL "$url" -o "$dest"
  certs="$(grep -c 'BEGIN CERTIFICATE' "$dest" || true)"
  echo "    $(sha256_of "$dest")  (${certs} certs)"
done

# --- Hard-verify the frozen ITL ------------------------------------------
itl_actual="$(sha256_of "$TRUST_DIR/c2pa_itl.pem")"
if [[ "$itl_actual" != "$ITL_SHA256_PINNED" ]]; then
  echo "ERROR: ITL checksum mismatch — the frozen list should never change." >&2
  echo "       expected $ITL_SHA256_PINNED" >&2
  echo "       got      $itl_actual" >&2
  echo "       Refusing to trust an altered Interim Trust List." >&2
  exit 1
fi
echo "ITL checksum OK (frozen, pinned)."

# --- Compare live lists against the recorded manifest ---------------------
write_manifest() {
  ( cd "$TRUST_DIR" && sha256sum "${NAMES[@]}" ) > "$MANIFEST"
  echo "Pinned current digests to $MANIFEST"
}

if [[ "$UPDATE" == "1" || ! -f "$MANIFEST" ]]; then
  write_manifest
else
  drift=0
  while read -r want name; do
    [[ -z "$name" ]] && continue
    got="$(sha256_of "$TRUST_DIR/$name")"
    [[ "$got" == "$want" ]] && continue
    if [[ "$LIVE_FILES" == *" $name "* ]]; then
      echo "WARN: $name changed since last pin (live lists update — this is expected)."
      echo "      recorded $want"
      echo "      current  $got"
      echo "      review the change, then run: $0 --update  to accept and re-pin."
      drift=1
    fi
  done < "$MANIFEST"
  [[ "$drift" == "0" ]] && echo "Live lists match the recorded manifest."
fi

echo "Done. Active profile is set by C2PA_TRUST_PROFILE in c2pa-backend/.env"
