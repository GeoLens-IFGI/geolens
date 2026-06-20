# GeoLens SynthID detection backend
# Bundles the Node/Express server, the Python detector (detect.py), and the
# reverse-SynthID library it depends on into a single image.
#
#   docker build -t geolens-synthid .
#   docker run -p 8008:8008 geolens-synthid
#
# Credit: reverse-SynthID by Alosh Denny — github.com/aloshdenny/reverse-SynthID

FROM python:3.11-slim

# Pin the detector revision for reproducible builds. Override at build time:
#   docker build --build-arg REVERSE_SYNTHID_REF=<sha> .
ARG REVERSE_SYNTHID_REF=main

ENV PYTHONUNBUFFERED=1 \
    PYTHON_BIN=python3 \
    PORT=8008

# System deps: git to fetch reverse-SynthID, build-essential for any source
# wheels, plus Node.js 22 from NodeSource.
RUN apt-get update && apt-get install -y --no-install-recommends \
        git curl ca-certificates build-essential \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Python detector dependency ───────────────────────────────────────────────
# detect.py expects ../reverse-SynthID relative to the backend dir, so clone it
# as a sibling of /app/backend (i.e. /app/reverse-SynthID).
RUN git clone https://github.com/aloshdenny/reverse-SynthID.git reverse-SynthID \
    && cd reverse-SynthID \
    && git checkout "$REVERSE_SYNTHID_REF" \
    && python3 -m pip install --no-cache-dir -r requirements.txt

# The detector imports cv2. requirements.txt pulls the GUI build (opencv-python),
# which needs X11/libGL libs absent from the slim image (libxcb.so.1 error at
# import). Swap in the headless build — same cv2 API, no GUI deps. Kept as its
# own layer so the heavy install above stays cached.
RUN python3 -m pip uninstall -y opencv-python opencv-contrib-python \
    && python3 -m pip install --no-cache-dir opencv-python-headless

# ── Node backend ─────────────────────────────────────────────────────────────
WORKDIR /app/backend

# Install JS deps first for better layer caching.
COPY package.json ./
RUN npm install --omit=dev

# App source (Dockerfile/compose/node_modules excluded via .dockerignore).
COPY . .

EXPOSE 8008

# Health endpoint the compose healthcheck (and humans) can hit.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS "http://localhost:${PORT}/" || exit 1

CMD ["node", "SynthID.js"]
