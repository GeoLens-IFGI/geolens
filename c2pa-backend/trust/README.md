# Trust anchors

The C2PA Implementation Guidance §6.3 is explicit that the spec does
**not** mandate a trust list — every application picks one suited to its
ecosystem. This directory holds the PEM bundle(s) used by whichever
profile is active (set by `C2PA_TRUST_PROFILE`).

| File                       | Used by profile        | Source                                                                                              |
| -------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------- |
| `c2pa_trust_list.pem`      | `c2pa-prod`, `c2pa-prod+itl` | <https://github.com/c2pa-org/conformance>                                                       |
| `c2pa_tsa_trust_list.pem`  | `c2pa-prod`, `c2pa-prod+itl` | <https://github.com/c2pa-org/conformance> (TSA section)                                         |
| `c2pa_itl.pem`             | `c2pa-prod+itl`              | C2PA Interim Trust List (frozen 2026-01-01, transitional)                                       |
| `dev_anchor.pem`           | `dev`                        | Generated locally by `tests/fixtures/make_fixtures.py` for testing GeoCam-issued or local certs |

The three production PEM bundles (`c2pa_trust_list.pem`, `c2pa_tsa_trust_list.pem`,
`c2pa_itl.pem`) are **committed** in this repository so a fresh clone works
out of the box. Re-pin with `./fetch-trust.sh --update` when the live lists
change upstream. The `dev_anchor.pem` file is generated locally by the test
fixtures script and remains gitignored.

## Updating or verifying the bundles

Fetch from authoritative sources and verify the bytes against the pinned
digests in `SHA256SUMS`:

```bash
cd c2pa-backend
./fetch-trust.sh            # download + verify against trust/SHA256SUMS
./fetch-trust.sh --update   # download + re-pin SHA256SUMS to the current bytes
```

You can also verify on demand without re-downloading:

```bash
cd c2pa-backend/trust && sha256sum -c SHA256SUMS
```

### Pinned sources

Retrieved **2026-06-03**. SHA-256 digests are recorded in `trust/SHA256SUMS`.

| File                      | Frozen? | Source URL                                                                                                  | SHA-256        |
| ------------------------- | ------- | ----------------------------------------------------------------------------------------------------------- | -------------- |
| `c2pa_trust_list.pem`     | live    | `https://raw.githubusercontent.com/c2pa-org/conformance-public/refs/heads/main/trust-list/C2PA-TRUST-LIST.pem`     | `0973d432…52c4` |
| `c2pa_tsa_trust_list.pem` | live    | `https://raw.githubusercontent.com/c2pa-org/conformance-public/refs/heads/main/trust-list/C2PA-TSA-TRUST-LIST.pem` | `9ba9ace3…dd8c` |
| `c2pa_itl.pem`            | **frozen** | `https://raw.githubusercontent.com/contentauth/verify-site/main/static/trust/anchors.pem` (mirror of `https://contentcredentials.org/trust/anchors.pem`) | `548162bd…4c52` |

### Checksum policy

- **`c2pa_itl.pem` is frozen** (no new entries after 2026-01-01), so its
  digest is pinned in `fetch-trust.sh` and a mismatch is a **hard error** —
  it can only mean the upstream bytes were altered.
- **The Trust List and TSA Trust List are live** and grow as new signers
  are admitted to the Conformance Program, so a digest change is expected.
  `fetch-trust.sh` **warns** and asks you to review and re-pin with
  `--update` rather than failing.

Dev signing keys remain out of git; production bundles are pinned here and
can be refreshed with `fetch-trust.sh` when upstream lists change.

If a profile is selected and one of its expected PEM files is missing:

- For `c2pa-prod` / `c2pa-prod+itl`: startup **fails**, because silently
  degrading to "no trust anchors" would mark every signed image as
  untrusted.
- For `dev`: startup logs a warning and continues with whatever PEMs
  were found.
