// Shared types for the in-page Inspector UI.
// These mirror the wire messages sent by the background script.

export type MethodStatus = 'loading' | 'verified' | 'not-verified' | 'unavailable';

export interface MethodState {
  status: MethodStatus;
  message?: string;
  error?: string;
  // Coordinates a method may report (e.g. GeoCam's captured location).
  lat?: number;
  lng?: number;
}

export type ExifStatus = 'loading' | 'available' | 'none' | 'unavailable';

export interface ExifSummary {
  camera?: string;
  lens?: string;
  takenAt?: string;
  dimensions?: string;
  iso?: string;
  aperture?: string;
  shutterSpeed?: string;
  focalLength?: string;
  author?: string;
  license?: string;
  title?: string;
  description?: string;
  gps?: string; // human-readable "46.51970° N, 8.30980° E"
  lat?: number;
  lng?: number;
}

export interface ExifState {
  status: ExifStatus;
  exif?: ExifSummary;
  error?: string;
}

// The overall trust summary derived from the authenticity methods.
// See CONTEXT.md → "Verdict".
export type Verdict = 'verified' | 'suspicious' | 'partial' | 'unknown';

// A single image the user is inspecting. Only one is active at a time.
export interface Inspection {
  imageUrl: string;
  imageAlt: string;
  position: 'left' | 'right'; // side of the viewport the source image sat on
  naturalWidth?: number;
  naturalHeight?: number;
  fileSize?: string;
  format?: string;
  geocam: MethodState;
  synthid: MethodState;
  c2pa: MethodState;
  exif: ExifState;
}
