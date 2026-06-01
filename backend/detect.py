"""
GeoLens SynthID Detector
Wraps the reverse-SynthID robust extractor and outputs JSON for Node.js to consume.

Usage:
  python detect.py <image_path>

Output (JSON):
  { "watermarked": true/false, "confidence": 0.0-1.0, "details": {...} }
"""

import sys
import json
import os

# Add the reverse-SynthID src to the path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REVERSE_SYNTHID_DIR = os.path.join(SCRIPT_DIR, '..', 'reverse-SynthID')
CODEBOOK_PATH = os.path.join(REVERSE_SYNTHID_DIR, 'artifacts', 'spectral_codebook_v4.npz')

sys.path.insert(0, os.path.join(REVERSE_SYNTHID_DIR, 'src', 'extraction'))

def main():
    if len(sys.argv) < 2:
        print(json.dumps({
            'watermarked': False,
            'confidence': 0,
            'error': 'No image path provided'
        }))
        sys.exit(1)

    image_path = sys.argv[1]

    if not os.path.exists(image_path):
        print(json.dumps({
            'watermarked': False,
            'confidence': 0,
            'error': f'Image not found: {image_path}'
        }))
        sys.exit(1)

    if not os.path.exists(CODEBOOK_PATH):
        print(json.dumps({
            'watermarked': False,
            'confidence': 0,
            'error': f'Codebook not found: {CODEBOOK_PATH}'
        }))
        sys.exit(1)

    try:
        # Suppress warnings
        import warnings
        warnings.filterwarnings('ignore')

        from robust_extractor import RobustSynthIDExtractor

        extractor = RobustSynthIDExtractor(codebook_path=CODEBOOK_PATH)
        result = extractor.detect(image_path)

        print(json.dumps({
            'watermarked': bool(result.is_watermarked),
            'confidence': float(result.confidence) if result.confidence == result.confidence else 0,  # handle nan
            'correlation': float(result.correlation) if result.correlation == result.correlation else 0,
            'phase_match': float(result.phase_match) if result.phase_match == result.phase_match else 0,
            'carrier_strength': float(result.carrier_strength) if result.carrier_strength == result.carrier_strength else 0,
        }))

    except Exception as e:
        print(json.dumps({
            'watermarked': False,
            'confidence': 0,
            'error': str(e)
        }))
        sys.exit(1)

if __name__ == '__main__':
    main()
