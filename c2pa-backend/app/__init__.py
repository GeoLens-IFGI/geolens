"""GeoLens C2PA validation backend.

A small FastAPI service that wraps c2pa-python (the official binding for the
c2pa-rs reference implementation) to validate Content Credentials embedded
in images. See README.md for design rationale and the spec sections each
piece of behavior maps to.
"""

__version__ = "0.1.0"
