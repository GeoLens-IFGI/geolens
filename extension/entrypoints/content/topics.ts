// Topic derivation: turns the raw per-method Inspection into the four
// user-facing category cards the designer specified, in order:
//   1. Location
//   2. Date and Time
//   3. Camera and File Info
//   4. Real or AI-Generated?
//
// A *finding* is a single claim a method emits; a *topic* (category) groups
// related findings under a traffic-light colour. One method can feed several
// topics (EXIF → date *and* location; a C2PA manifest → integrity *and*, when an
// AI generator signed it, AI Generated). See CONTEXT.md → "Finding" / "Topic".
//
// Wording is deliberately plain — no "EXIF" / "C2PA" / "manifest" in the
// user-facing label, message, or explainer. Each finding carries an `explainer`
// telling a non-technical reader how to interpret it, and names the `verifier`
// that produced it.

import type { Inspection, MethodState } from './types';

// Trust level of a finding / topic.
//   green  = trustworthy / hard to fake
//   orange = present but warrants attention
//   red    = a finding that should worry the user (AI-made, or tampered)
//   gray   = nothing to report / couldn't check
export type TrafficLight = 'green' | 'orange' | 'red' | 'gray';

export interface Finding {
  label: string; // plain name, e.g. "Verified location"
  light: TrafficLight;
  verifier?: string; // which check produced this, e.g. "GeoLens", "Photo metadata"
  message?: string; // the specific value found (a date, coordinates, a signer)
  explainer?: string; // plain-language "what this means / how to read it"
  detail?: string; // optional technical reason, behind a "Why?" toggle
}

export type TopicId = 'location' | 'datetime' | 'camera' | 'ai';

export interface TopicCard {
  id: TopicId;
  title: string;
  light: TrafficLight;
  loading: boolean; // a contributing method is still running
  help: string; // one-line "what this category verifies" (help tooltip)
  findings: Finding[];
  rows?: Array<[string, string]>; // key/value metadata table (Camera & File Info)
  noData?: string[]; // verifiers that were checked but found nothing for this topic
  badge?: { text: string; light: TrafficLight }; // headline verdict badge (AI card)
}

// The palette. Tinting and frame colours are derived from these. Chosen to stay
// distinguishable under red–green and blue–yellow colour-vision deficiency: the
// "green" is a teal-leaning green (carries a blue component), "orange" is a
// clearly warm orange, and "red" is a dark magenta-red — so each pair separates
// by hue *and* lightness, not hue alone. Shape redundancy (the StatusIcon
// check / triangle / cross / dash) carries the meaning when colour can't.
//   green #0E7C5A   orange #EA7317   red #D7263D   gray #CCCCCC
export const LIGHT_RGB: Record<TrafficLight, string> = {
  green: '14, 124, 90',
  orange: '234, 115, 23',
  red: '215, 38, 61',
  gray: '204, 204, 204',
};

// Readable text colour to sit on a filled traffic-light box. Orange and gray are
// light, so they take dark text; green and red are dark enough for white. All
// combinations clear WCAG AA (≥4.5:1) for normal text.
export const LIGHT_TEXT_ON: Record<TrafficLight, string> = {
  green: '#FFFFFF',
  orange: '#1F2937',
  red: '#FFFFFF',
  gray: '#374151',
};

// Signers whose Content Credentials indicate the image was produced by an AI
// generator. A manifest signed by one of these means: AI-generated.
const AI_GENERATOR_SIGNERS = [/google/i, /openai/i, /dall[- ]?e/i, /midjourney/i, /stability/i, /firefly/i];

function signerIsAiGenerator(signer: string | undefined): boolean {
  return !!signer && AI_GENERATOR_SIGNERS.some((re) => re.test(signer));
}

// Trust colour for a claim carried *inside* a C2PA seal (its signed date or
// location), based on the seal's integrity: an intact, trusted seal makes its
// claims green; an unconfirmed signer makes them orange; a broken or absent
// seal returns null (the claim isn't surfaced — Integrity flags the breakage).
function sealedClaimLight(status: MethodState['status']): TrafficLight | null {
  if (status === 'verified' || status === 'verified-legacy') return 'green';
  if (status === 'caution') return 'orange';
  return null;
}

// A topic card's colour: any red → red, else any green → green, else any
// orange → orange, else gray. (Red dominates, then best trust wins. Gray
// findings — "couldn't check" — never set the colour on their own.)
export function topicLight(findings: Finding[]): TrafficLight {
  if (findings.some((f) => f.light === 'red')) return 'red';
  if (findings.some((f) => f.light === 'green')) return 'green';
  if (findings.some((f) => f.light === 'orange')) return 'orange';
  return 'gray';
}

export function deriveTopics(inspection: Inspection): TopicCard[] {
  return [
    buildLocation(inspection),
    buildDateTime(inspection),
    buildCameraFile(inspection),
    buildAI(inspection),
  ];
}

function finalize(
  card: Omit<TopicCard, 'light'> & { light?: TrafficLight },
): TopicCard {
  return { ...card, light: card.loading ? 'gray' : topicLight(card.findings) };
}

// ── Location ─────────────────────────────────────────────────────────────────
// GeoLens is a cryptographically signed capture location — very hard to fake,
// so green. A *missing* GeoLens signal is just an absence, not an alarm — it goes
// into noData, not a red finding. The location a phone saves in the file is
// rarely changed, so it also reads green, with an explainer that it's
// self-reported.
function buildLocation(inspection: Inspection): TopicCard {
  const findings: Finding[] = [];
  const noData: string[] = [];
  const geo = inspection.geocam;
  const loading = geo.status === 'loading' || inspection.exif.status === 'loading';

  if (geo.status === 'verified') {
    findings.push({
      label: 'Verified location',
      verifier: 'GeoLens',
      light: 'green',
      message: geo.message,
      explainer:
        'GeoLens cryptographically proves where this photo was taken. This is extremely hard to fake.',
      detail: geo.detail,
    });
  } else if (geo.status === 'not-verified') {
    noData.push('GeoLens — no location proof on this image');
  } else if (geo.status === 'unavailable') {
    noData.push(`GeoLens — ${geo.error ?? 'check could not run'}`);
  }

  const exif = inspection.exif.exif;
  if (exif && (exif.gps || (exif.lat != null && exif.lng != null))) {
    findings.push({
      label: 'Location the photo records',
      verifier: 'Photo metadata',
      light: 'orange',
      message: exif.gps ?? `${exif.lat}, ${exif.lng}`,
      explainer:
        'Phones often save GPS coordinates inside a photo. It is self-reported, so treat it as a hint rather than proof.',
    });
  } else if (inspection.exif.status !== 'loading') {
    noData.push('Photo metadata — no GPS coordinates');
  }

  const cred = inspection.c2pa.credentials;
  const sealLight = sealedClaimLight(inspection.c2pa.status);
  if (cred?.geo && sealLight) {
    findings.push({
      label: 'Location in the authenticity seal',
      verifier: 'Content Credentials',
      light: sealLight,
      message: cred.geo,
      explainer: 'This location is part of the image’s tamper-proof seal, so it’s very hard to fake.',
    });
  }

  return finalize({
    id: 'location',
    title: 'Location',
    help: 'Shows where the photo was taken.',
    findings,
    noData,
    loading,
  });
}

// ── Date & Time ──────────────────────────────────────────────────────────────
// The date a camera/phone saved in the file. Rarely changed, so it reads green.
function buildDateTime(inspection: Inspection): TopicCard {
  const findings: Finding[] = [];
  const noData: string[] = [];
  const geo = inspection.geocam;
  const loading = inspection.exif.status === 'loading' || geo.status === 'loading';
  const exif = inspection.exif.exif;

  if (geo.status === 'verified' && geo.capturedAt) {
    findings.push({
      label: 'Verified capture time',
      verifier: 'GeoLens',
      light: 'green',
      message: geo.capturedAt,
      explainer:
        'GeoLens cryptographically proves when this photo was taken. This is extremely hard to fake.',
    });
  }

  if (exif?.takenAt) {
    findings.push({
      label: 'Date the photo records',
      verifier: 'Photo metadata',
      light: 'orange',
      message: exif.takenAt,
      explainer:
        'Cameras and phones save when a photo was taken, but this is self-reported and can be edited, so treat it as a hint.',
    });
  } else if (inspection.exif.status !== 'loading') {
    noData.push('Photo metadata — no timestamp recorded');
  }

  const cred = inspection.c2pa.credentials;
  const sealLight = sealedClaimLight(inspection.c2pa.status);
  if (cred?.signedAt && sealLight) {
    findings.push({
      label: 'Date in the authenticity seal',
      verifier: 'Content Credentials',
      light: sealLight,
      message: cred.signedAt,
      explainer: 'This date is part of the image’s tamper-proof seal, so it’s very hard to fake.',
    });
  }

  return finalize({
    id: 'datetime',
    title: 'Date and Time',
    help: 'Shows when the photo was taken.',
    findings,
    noData,
    loading,
  });
}

// ── Camera and File Info ─────────────────────────────────────────────────────
// Device specifications and file metadata read from the photo. Informational:
// green when any data is present, grey when there's nothing to show.
function buildCameraFile(inspection: Inspection): TopicCard {
  const exif = inspection.exif.exif;
  const loading = inspection.exif.status === 'loading';
  const noData: string[] = [];

  const rows: Array<[string, string]> = [];
  const push = (label: string, value?: string) => {
    if (value) rows.push([label, value]);
  };
  push('Camera', exif?.camera);
  push('Lens', exif?.lens);
  push('ISO', exif?.iso);
  push('Aperture', exif?.aperture);
  push('Shutter Speed', exif?.shutterSpeed);
  push('Focal Length', exif?.focalLength);
  push('Photographer', exif?.author);
  push('License', exif?.license);
  push('Title', exif?.title);
  push('Description', exif?.description);
  if (inspection.naturalWidth && inspection.naturalHeight) {
    push('Dimensions', `${inspection.naturalWidth} × ${inspection.naturalHeight} px`);
  }
  push('Format', inspection.format ? inspection.format.toUpperCase() : undefined);
  push('File Size', inspection.fileSize);

  // A single finding carries the card's colour (green when we found metadata).
  const findings: Finding[] = rows.length
    ? [
        {
          label: 'Camera & file details found',
          verifier: 'Photo metadata',
          light: 'green',
          explainer: 'Device and file information read directly from the image.',
        },
      ]
    : [];

  if (!loading && !rows.length) {
    noData.push('Photo metadata — no camera or file details embedded');
  }

  return finalize({
    id: 'camera',
    title: 'Camera and File Info',
    help: 'Shows device and file metadata.',
    findings,
    rows: rows.length ? rows : undefined,
    noData,
    loading,
  });
}

// ── Real or AI-Generated? ─────────────────────────────────────────────────────
// "Real" means: taken by a camera and unaltered since. Two questions feed it —
// is the image AI-made (Google's invisible SynthID watermark, or a Content
// Credentials seal naming an AI generator), and is it untampered (the seal's
// integrity). Any red → not real.
function buildAI(inspection: Inspection): TopicCard {
  const findings: Finding[] = [];
  const noData: string[] = [];
  const sid = inspection.synthid;
  const c2pa = inspection.c2pa;
  const loading = sid.status === 'loading' || c2pa.status === 'loading';

  if (sid.status === 'not-verified') {
    findings.push({
      label: 'AI watermark found',
      verifier: 'Google SynthID',
      light: 'red',
      explainer:
        'Google hides an invisible watermark in images its AI creates. We found one, so this image was almost certainly made or edited by AI.',
      detail: sid.detail,
    });
  } else if (sid.status === 'verified') {
    findings.push({
      label: 'No AI watermark found',
      verifier: 'Google SynthID',
      light: 'orange',
      explainer:
        'We didn’t find Google’s invisible AI watermark — but this isn’t an all-clear. Our detector was figured out by hand rather than given to us by Google, so whenever Google quietly changes how the watermark works, our check can stop spotting it until we catch up. And AI tools other than Google’s may not leave a watermark at all. So a clean result here means we found nothing, not that the image is definitely real.',
    });
  } else if (sid.status === 'unavailable') {
    noData.push(`Google SynthID — ${sid.error ?? 'check could not run'}`);
  }

  // A Content Credentials seal can declare AI generation directly (the
  // manifest's trainedAlgorithmicMedia action) or imply it by being signed by a
  // known AI generator (e.g. "Google LLC"). Either means: made by AI.
  const cred = c2pa.credentials;
  const hasManifest = c2pa.status === 'verified' || c2pa.status === 'verified-legacy' || c2pa.status === 'caution';
  if (hasManifest && (cred?.aiGenerated === true || signerIsAiGenerator(cred?.signer))) {
    findings.push({
      label: 'Made by AI',
      verifier: 'Content Credentials',
      light: 'red',
      message: cred?.signer ? `Created by ${cred.signer}` : undefined,
      explainer:
        'This image’s built-in credentials say it was created by an AI tool. It is AI-generated.',
    });
  }

  // Integrity (tamper-proof seal) speaks to whether the image is still as
  // captured — part of "is this real?".
  if (c2pa.status === 'verified' || c2pa.status === 'verified-legacy') {
    findings.push({
      label: 'Tamper-proof seal intact',
      verifier: 'Content Credentials',
      light: 'green',
      message: cred?.signer ? `Signed by ${cred.signer}` : undefined,
      explainer:
        'This image carries a digital seal proving it hasn’t been altered since it was created.',
      detail: c2pa.detail,
    });
  } else if (c2pa.status === 'caution') {
    findings.push({
      label: 'Seal present, signer unconfirmed',
      verifier: 'Content Credentials',
      light: 'orange',
      message: cred?.signer ? `Signed by ${cred.signer}` : undefined,
      explainer:
        'This image is sealed and unaltered, but we couldn’t confirm who signed it, so trust it with care.',
      detail: c2pa.detail,
    });
  } else if (c2pa.status === 'not-verified') {
    findings.push({
      label: 'Seal broken',
      verifier: 'Content Credentials',
      light: 'red',
      explainer:
        'This image had a digital seal, but it’s broken — the image was changed after it was created.',
      detail: c2pa.detail,
    });
  } else if (c2pa.status === 'unavailable') {
    noData.push('Content Credentials — no tamper-proof seal on this image');
  }

  const card = finalize({
    id: 'ai',
    title: 'Real or AI-Generated?',
    help: 'Detects if the image was created by AI or taken with a camera.',
    findings,
    noData,
    loading,
  });

  // Headline badge summarising the verdict for this card. We can only be certain
  // when AI is detected; absence of a signal never proves an image is real, so a
  // clean result reads "Maybe AI generated".
  card.badge = loading
    ? { text: 'Checking…', light: 'gray' }
    : card.light === 'red'
      ? { text: 'Definitely AI generated', light: 'red' }
      : card.light === 'gray'
        ? { text: 'Not checked', light: 'gray' }
        : { text: 'Maybe AI generated', light: 'orange' };

  // The box title itself reflects the verdict (keeps the base question while
  // loading or when nothing was checked).
  card.title =
    loading || card.light === 'gray'
      ? 'Real or AI-Generated?'
      : card.light === 'red'
        ? 'Definitely AI generated'
        : 'Maybe AI generated';

  return card;
}
