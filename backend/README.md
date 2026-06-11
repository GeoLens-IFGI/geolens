# GeoLens SynthID Backend

This is the SynthID watermark detection backend for the GeoLens browser extension.

It detects whether an image contains a Google SynthID watermark using spectral pixel analysis.

> Credit: [reverse-SynthID by Alosh Denny](https://github.com/aloshdenny/reverse-SynthID)

---

## How it works

When the browser extension right-clicks an image, it sends it to this backend. The backend calls a Python detector that analyses the image's pixel frequency patterns and returns whether a SynthID watermark is present.

```
Extension → POST /verify-image/ → SynthID.js → detect.py → reverse-SynthID → result
```

---

The backend listens on **port 8008** (port 8000 is used by the GeoCam backend).

## Setup — Docker (recommended)

The Docker image bundles the Node server, the Python detector, and the
reverse-SynthID library, so there's nothing to clone or install by hand.

```bash
cd backend
docker compose up --build
```

You should see the server come up on `http://localhost:8008`. That's it — the
extension already points at this port.

> **IPv6-only / 464XLAT networks:** the compose file builds with `network: host`
> because Docker's default bridge NATs to IPv4 with no upstream, which would make
> `apt`/`git`/`pip` in the build hang or fail. Compose handles this for you. If you
> build by hand (below), pass `--network=host` yourself.

To run without compose:
```bash
docker build --network=host -t geolens-synthid .
docker run -p 8008:8008 geolens-synthid
```

Pin a specific detector revision for reproducible builds:
```bash
docker build --build-arg REVERSE_SYNTHID_REF=<commit-sha> -t geolens-synthid .
```

---

## Setup — manual (without Docker)

### Step 1 — Clone the repo
```bash
git clone https://github.com/GeoLens-IFGI/geolens.git
cd geolens
```

### Step 2 — Clone reverse-SynthID into the same folder
```bash
git clone https://github.com/aloshdenny/reverse-SynthID.git
```

Your folder structure should look like:
```
geolens/
  backend/
  reverse-SynthID/   ← must be here
  extension/
```

### Step 3 — Install Python dependencies
```bash
cd reverse-SynthID
python3 -m pip install -r requirements.txt
```

### Step 4 — Install Node.js dependencies
```bash
cd ../backend
npm install
```

### Step 5 — Run the backend
```bash
node SynthID.js
```

You should see:
```
[GeoLens] backend listening on http://localhost:8008
```

> The detector is spawned with `python3` by default. Override with the
> `PYTHON_BIN` env var if your interpreter is named differently, and use `PORT`
> to change the listen port (remember to update the extension's fetch URL).

---

## Testing

Test with a real image:
```bash
curl -X POST http://localhost:8008/verify-image/ -F "file=@/path/to/image.jpg"
```

Expected response:
```json
{
  "checks": {
    "synthid": {
      "status": "verified",
      "message": "No SynthID watermark found (confidence: 4%)",
      "error": "No Google AI watermark detected."
    }
  }
}
```

---

## Results

| Status | Meaning |
|--------|---------|
| `verified` | No SynthID watermark — likely a real photo |
| `not-verified` | SynthID watermark detected — possibly AI generated |
| `unavailable` | Detection failed or timed out |

---

## Notes

- No API key needed — detection runs fully locally
- Detection takes up to 30 seconds per image
- Screenshots may trigger false positives
- 90% detection rate on Google AI-generated images
