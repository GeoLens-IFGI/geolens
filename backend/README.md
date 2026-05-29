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

## Setup

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
python -m pip install -r requirements.txt
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
[GeoLens] backend listening on http://localhost:8000
```

---

## Testing

Test with a real image:
```bash
curl -X POST http://localhost:8000/verify-image/ -F "file=@/path/to/image.jpg"
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
