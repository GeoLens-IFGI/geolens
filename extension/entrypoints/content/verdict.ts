// Overall verdict derivation. Only GeoCam + SynthID (the authenticity methods)
// contribute; EXIF is informational. See CONTEXT.md → "Verdict".

import type { MethodState, Verdict } from './types';

export function computeVerdict(geocam: MethodState, synthid: MethodState): Verdict {
  const statuses = [geocam.status, synthid.status];

  // Still settling — keep the border neutral until both checks resolve.
  if (statuses.some((s) => s === 'loading')) return 'unknown';
  // Any failure dominates.
  if (statuses.some((s) => s === 'not-verified')) return 'suspicious';
  // Everything passed.
  if (statuses.every((s) => s === 'verified')) return 'verified';
  // Something passed, the rest could not be checked.
  if (statuses.some((s) => s === 'verified')) return 'partial';
  // Nothing could be checked.
  return 'unknown';
}

export interface VerdictStyle {
  label: string;
  rgb: string; // "r, g, b" — used for border + glow + text
}

export const VERDICT_STYLE: Record<Verdict, VerdictStyle> = {
  verified: { label: 'Verified', rgb: '34, 197, 94' }, // green-500
  suspicious: { label: 'Suspicious', rgb: '239, 68, 68' }, // red-500
  partial: { label: 'Partial', rgb: '245, 158, 11' }, // amber-500
  unknown: { label: 'Unknown', rgb: '107, 114, 128' }, // gray-500
};
