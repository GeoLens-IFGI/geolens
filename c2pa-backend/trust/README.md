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

None of the production PEM bundles are checked into this repository —
they are environment-specific and may be updated independently of this
codebase. Drop them here, then start the service. The `dev_anchor.pem`
file is generated automatically when you run the test fixtures script
and is also gitignored.

If a profile is selected and one of its expected PEM files is missing:

- For `c2pa-prod` / `c2pa-prod+itl`: startup **fails**, because silently
  degrading to "no trust anchors" would mark every signed image as
  untrusted.
- For `dev`: startup logs a warning and continues with whatever PEMs
  were found.
