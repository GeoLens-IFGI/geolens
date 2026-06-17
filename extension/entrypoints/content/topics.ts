// Topic derivation: turns the raw per-method Inspection into the four
// user-facing topic cards (Date & Time, Location, AI Generated, Integrity).
//
// A *finding* is a single claim a method emits; a *topic* groups related
// findings under a traffic-light colour. One method can feed several topics
// (EXIF → date *and* location; a C2PA manifest → integrity *and*, when an AI
// generator signed it, AI Generated). See CONTEXT.md → "Finding" / "Topic".
//
// Wording is deliberately plain — no "EXIF" / "C2PA" / "manifest" in the
// user-facing label, message, or explainer. Each finding carries an `explainer`
// telling a non-technical reader how to interpret it.

import type { Inspection, MethodState } from './types';

// Trust level of a finding / topic.
//   green  = trustworthy / hard to fake
//   yellow = present but warrants attention
//   red    = a finding that should worry the user (AI-made, or tampered)
//   gray   = nothing to report / couldn't check
export type TrafficLight = 'green' | 'yellow' | 'red' | 'gray';

export interface Finding {
  label: string; // plain name, e.g. "Verified location"
  light: TrafficLight;
  message?: string; // the specific value found (a date, coordinates, a signer)
  explainer?: string; // plain-language "what this means / how to read it"
  detail?: string; // optional technical reason, behind a "Why?" toggle
}

export type TopicId = 'datetime' | 'location' | 'ai' | 'integrity';

export interface TopicCard {
  id: TopicId;
  title: string;
  light: TrafficLight;
  loading: boolean; // a contributing method is still running
  findings: Finding[];
}

// rgb tokens, matched to the original design so colours line up.
export const LIGHT_RGB: Record<TrafficLight, string> = {
  green: '34, 197, 94', // green-500
  yellow: '245, 158, 11', // amber-500
  red: '239, 68, 68', // red-500
  gray: '107, 114, 128', // gray-500
};

// Signers whose Content Credentials indicate the image was produced by an AI
// generator. A manifest signed by one of these means: AI-generated.
const AI_GENERATOR_SIGNERS = [/google/i, /openai/i, /dall[- ]?e/i, /midjourney/i, /stability/i, /firefly/i];

function signerIsAiGenerator(signer: string | undefined): boolean {
  return !!signer && AI_GENERATOR_SIGNERS.some((re) => re.test(signer));
}

// Trust colour for a claim carried *inside* a C2PA seal (its signed date or
// location), based on the seal's integrity: an intact, trusted seal makes its
// claims green; an unconfirmed signer makes them yellow; a broken or absent
// seal returns null (the claim isn't surfaced — Integrity flags the breakage).
function sealedClaimLight(status: MethodState['status']): TrafficLight | null {
  if (status === 'verified' || status === 'verified-legacy') return 'green';
  if (status === 'caution') return 'yellow';
  return null;
}

// A topic card's colour: any red → red, else any green → green, else any
// yellow → yellow, else gray. (Red dominates, then best trust wins. Gray
// findings — "couldn't check" — never set the colour on their own.)
export function topicLight(findings: Finding[]): TrafficLight {
  if (findings.some((f) => f.light === 'red')) return 'red';
  if (findings.some((f) => f.light === 'green')) return 'green';
  if (findings.some((f) => f.light === 'yellow')) return 'yellow';
  return 'gray';
}

// The image border: worst topic colour wins (red > yellow > green > gray).
// While any topic is still settling, stay neutral grey.
export function borderLight(topics: TopicCard[]): TrafficLight {
  if (topics.some((t) => t.loading)) return 'gray';
  if (topics.some((t) => t.light === 'red')) return 'red';
  if (topics.some((t) => t.light === 'yellow')) return 'yellow';
  if (topics.some((t) => t.light === 'green')) return 'green';
  return 'gray';
}

export function deriveTopics(inspection: Inspection): TopicCard[] {
  return [
    buildDateTime(inspection),
    buildLocation(inspection),
    buildAI(inspection),
    buildIntegrity(inspection),
  ];
}

function finalize(id: TopicId, title: string, findings: Finding[], loading: boolean): TopicCard {
  return { id, title, findings, loading, light: loading ? 'gray' : topicLight(findings) };
}

// ── Date & Time ──────────────────────────────────────────────────────────────
// The date a camera/phone saved in the file. Rarely changed, so it reads green.
function buildDateTime(inspection: Inspection): TopicCard {
  const findings: Finding[] = [];
  const geo = inspection.geocam;
  const loading = inspection.exif.status === 'loading' || geo.status === 'loading';
  const exif = inspection.exif.exif;

  if (geo.status === 'verified' && geo.capturedAt) {
    findings.push({
      label: 'Verified capture time (GeoLens)',
      light: 'green',
      message: geo.capturedAt,
      explainer:
        'GeoLens cryptographically proves when this photo was taken. This is extremely hard to fake.',
    });
  }

  if (exif?.takenAt) {
    findings.push({
      label: 'Date the photo records',
      light: 'green',
      message: exif.takenAt,
      explainer:
        'Cameras and phones automatically save when a photo was taken. This is rarely changed, so it’s usually reliable.',
    });
  }

  const cred = inspection.c2pa.credentials;
  const sealLight = sealedClaimLight(inspection.c2pa.status);
  if (cred?.signedAt && sealLight) {
    findings.push({
      label: 'Date in the authenticity seal',
      light: sealLight,
      message: cred.signedAt,
      explainer: 'This date is part of the image’s tamper-proof seal, so it’s very hard to fake.',
    });
  }

  return finalize('datetime', 'Date & Time', findings, loading);
}

// ── Location ─────────────────────────────────────────────────────────────────
// GeoLens is a cryptographically signed capture location — very hard to fake,
// so green. A *missing* GeoLens signal is just an absence, not an alarm (grey).
// The location a phone saves in the file is rarely changed, so it also reads
// green, with an explainer that it's self-reported.
function buildLocation(inspection: Inspection): TopicCard {
  const findings: Finding[] = [];
  const geo = inspection.geocam;
  const loading = geo.status === 'loading' || inspection.exif.status === 'loading';

  if (geo.status === 'verified') {
    findings.push({
      label: 'Verified location (GeoLens)',
      light: 'green',
      message: geo.message,
      explainer:
        'GeoLens cryptographically proves where this photo was taken. This is extremely hard to fake.',
      detail: geo.detail,
    });
  } else if (geo.status === 'not-verified') {
    findings.push({
      label: 'No GeoLens proof',
      light: 'gray',
      explainer: 'This photo doesn’t carry a GeoLens location proof. That’s normal — most photos don’t.',
    });
  } else if (geo.status === 'unavailable') {
    findings.push({
      label: 'GeoLens not checked',
      light: 'gray',
      explainer: geo.error ?? 'The GeoLens check couldn’t run for this image.',
    });
  }

  const exif = inspection.exif.exif;
  if (exif && (exif.gps || (exif.lat != null && exif.lng != null))) {
    findings.push({
      label: 'Location the photo records',
      light: 'green',
      message: exif.gps ?? `${exif.lat}, ${exif.lng}`,
      explainer:
        'Phones often save GPS coordinates inside a photo. Usually accurate and rarely changed, though it is self-reported.',
    });
  }

  const cred = inspection.c2pa.credentials;
  const sealLight = sealedClaimLight(inspection.c2pa.status);
  if (cred?.geo && sealLight) {
    findings.push({
      label: 'Location in the authenticity seal',
      light: sealLight,
      message: cred.geo,
      explainer: 'This location is part of the image’s tamper-proof seal, so it’s very hard to fake.',
    });
  }

  return finalize('location', 'Location', findings, loading);
}

// ── AI Generated ─────────────────────────────────────────────────────────────
// Two independent signals: Google's invisible SynthID watermark, and a Content
// Credentials seal naming an AI generator as the signer. Either → red.
function buildAI(inspection: Inspection): TopicCard {
  const findings: Finding[] = [];
  const sid = inspection.synthid;
  const c2pa = inspection.c2pa;
  const loading = sid.status === 'loading' || c2pa.status === 'loading';

  if (sid.status === 'not-verified') {
    findings.push({
      label: 'AI watermark found',
      light: 'red',
      explainer:
        'Google hides an invisible watermark in images its AI creates. We found one, so this image was almost certainly made or edited by AI.',
      detail: sid.detail,
    });
  } else if (sid.status === 'verified') {
    findings.push({
      label: 'No AI watermark',
      light: 'green',
      explainer:
        'We didn’t find Google’s invisible AI watermark. Note that AI tools other than Google’s may not leave one.',
    });
  } else if (sid.status === 'unavailable') {
    findings.push({
      label: 'AI watermark not checked',
      light: 'gray',
      explainer: sid.error ?? 'The AI-watermark check couldn’t run for this image.',
    });
  }

  // A Content Credentials seal can declare AI generation directly (the
  // manifest's trainedAlgorithmicMedia action) or imply it by being signed by a
  // known AI generator (e.g. "Google LLC"). Either means: made by AI.
  const cred = c2pa.credentials;
  const hasManifest = c2pa.status === 'verified' || c2pa.status === 'verified-legacy' || c2pa.status === 'caution';
  if (hasManifest && (cred?.aiGenerated === true || signerIsAiGenerator(cred?.signer))) {
    findings.push({
      label: 'Made by AI',
      light: 'red',
      message: cred?.signer ? `Created by ${cred.signer}` : undefined,
      explainer:
        'This image’s built-in credentials say it was created by an AI tool. It is AI-generated.',
    });
  }

  return finalize('ai', 'AI Generated', findings, loading);
}

// ── Integrity ────────────────────────────────────────────────────────────────
// A tamper-proof Content Credentials seal: intact → green, signer unconfirmed →
// yellow, broken → red, none present → grey (the normal case for web images).
function buildIntegrity(inspection: Inspection): TopicCard {
  const findings: Finding[] = [];
  const c2pa = inspection.c2pa;
  const loading = c2pa.status === 'loading';

  if (c2pa.status === 'verified' || c2pa.status === 'verified-legacy') {
    findings.push({
      label: 'Tamper-proof seal intact',
      light: 'green',
      message: c2pa.credentials?.signer ? `Signed by ${c2pa.credentials.signer}` : undefined,
      explainer:
        'This image carries a digital seal proving it hasn’t been altered since it was created.',
      detail: c2pa.detail,
    });
  } else if (c2pa.status === 'caution') {
    findings.push({
      label: 'Seal present, signer unconfirmed',
      light: 'yellow',
      message: c2pa.credentials?.signer ? `Signed by ${c2pa.credentials.signer}` : undefined,
      explainer:
        'This image is sealed and unaltered, but we couldn’t confirm who signed it, so trust it with care.',
      detail: c2pa.detail,
    });
  } else if (c2pa.status === 'not-verified') {
    findings.push({
      label: 'Seal broken',
      light: 'red',
      explainer:
        'This image had a digital seal, but it’s broken — the image was changed after it was created.',
      detail: c2pa.detail,
    });
  } else if (c2pa.status === 'unavailable') {
    findings.push({
      label: 'No tamper-proof seal',
      light: 'gray',
      explainer:
        'This image doesn’t carry a digital seal. That’s normal — most photos on the web don’t have one.',
    });
  }

  return finalize('integrity', 'Integrity', findings, loading);
}
