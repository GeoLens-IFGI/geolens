/**
 * Central feature flags / endpoint config for the GeoLens extension.
 *
 * Edit these two flags to turn validation methods on or off independently.
 * The values are read by both the background script (which makes the HTTP
 * calls) and the content script (which decides which overlay sections to
 * render).
 */

export const FEATURES = {
  /** GeoCam steganographic-watermark validation. The current MVP method. */
  geolens: true,

  /** EXIF metadata extraction (purely client-side via the `exifr` lib). */
  exif: true,

  /** SynthID watermark check (existing experimental feature). */
  synthid: true,

  /**
   * C2PA Content Credentials validation (new).
   * Backed by the c2pa-backend FastAPI service at the URL below. Toggle
   * off to fall back to the original behaviour without the C2PA panel.
   */
  c2pa: true,
} as const;

export const ENDPOINTS = {
  geolens: 'http://localhost:8000/verify-image/',
  c2pa: 'http://localhost:8001/c2pa/verify',
} as const;

export type FeatureFlag = keyof typeof FEATURES;
