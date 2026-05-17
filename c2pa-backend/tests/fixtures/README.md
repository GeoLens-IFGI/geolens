# Test fixtures

Run `python tests/fixtures/make_fixtures.py` (or just `pytest`) to generate:

- `verified.jpg` — a 64×64 JPEG signed with a self-signed dev cert.
- `tampered.jpg` — a copy of `verified.jpg` with one byte in the JPEG
  entropy-coded segment flipped, so the hard binding fails.
- `no_manifest.jpg` — a 64×64 JPEG with no C2PA manifest.

The same script also drops a freshly-generated CA cert into
`trust/dev_anchor.pem`. The `dev` trust profile loads that file, so the
backend will mark `verified.jpg` as `verified` (not just
`signed-untrusted`) when run under `C2PA_TRUST_PROFILE=dev`.

All generated files are gitignored.
