# 2. Group findings into traffic-light topic cards

Date: 2026-06-17

## Status

Accepted

## Context

Until now the Inspector listed each **check method** (GeoCam, SynthID, C2PA,
EXIF) as its own row, and the image border came from `computeVerdict(geocam,
synthid)` — only the two "authenticity" methods. This mirrors the code's
structure (one validator → one status) but not the questions a user actually
asks: *do I trust the date? the location? is this AI? was it tampered with?*

Those questions don't line up one-to-one with methods. EXIF answers both *date*
and *location*. A single C2PA manifest can speak to *date*, *location*,
*AI provenance* and *integrity* at once. GeoCam's verified signal is really a
*location* claim. So the unit the UI should group by is finer than a method.

We also hit a semantic trap: GeoCam returns `not-verified` for essentially every
image without a GeoCam signal (i.e. almost all web images), and those carry no
location. Treating `not-verified` as an alarm would paint nearly every image's
Location — and border — red.

## Decision

Introduce a **Finding** (one claim a method emits) and a **Topic** (a grouping of
findings). The Verification panel now shows four collapsible topic cards —
*Date & Time*, *Location*, *AI Generated*, *Integrity* — derived from the raw
`Inspection` by a pure layer (`entrypoints/content/topics.ts`). Methods fan out:
EXIF → date + location findings; C2PA → integrity now, and date/location/AI once
its richer data is plumbed through (it is currently dropped at the
background→content boundary).

Colours are a **trust level**: green = trustworthy/hard-to-fake, yellow =
present-but-warrants-attention, red = a worrying finding, grey = couldn't check.
A topic card's colour is *red dominates, else best wins* (any red → red, else any
green → green, else yellow, else grey). The image **border** is *worst topic
wins* (red → yellow → green → grey), replacing `computeVerdict`, which is deleted.

Photo metadata (date, GPS) reads **green**, not yellow: it is rarely altered, so
treating its presence as a caution scared users more than its absence reassured
them. Its explainer notes it is self-reported. Every finding carries a plain
explainer; no "EXIF" / "C2PA" / "manifest" jargon appears in user-facing text.

AI generation is flagged from **three** signals: a SynthID watermark; the
manifest's own `trainedAlgorithmicMedia` action (`summary.is_ai_generated`); and,
as a complement, a seal whose **signer is a known AI generator** (e.g. "Google
LLC"). So "valid credentials signed by Google" reads as *AI-generated*, not merely
*valid*. The C2PA manifest also fans out its signed **date** (`signed_at`) into
Date & Time and its signed **location** (`geo`) into Location — green when the
seal is intact, yellow when the signer is unconfirmed. All of these already
existed in the backend's `summary`; only the wire message (a `credentials`
object on `MethodState`) and the topic derivation were added.

A **missing GeoCam signal is an absence, not an alarm**: GeoCam contributes a
green Location finding only when `verified`; otherwise it is a non-alarming grey
finding, never red.

## Consequences

- The border now reflects AI and integrity too, not just GeoCam + SynthID, and is
  computed solely from the four topic colours. `verdict.ts` (`computeVerdict`,
  `VERDICT_STYLE`) and the `Verdict` type are removed.
- This is the surprising part for a future reader: C2PA, whose code status is an
  *integrity/authenticity* verdict, is recast as feeding *several* topics — and a
  "verified C2PA" no longer reads as an overall pass, it reads as one green
  Integrity finding. The trust-level colours also diverge from the raw `Status`
  values (a verified-but-clear SynthID is green; a not-verified GeoCam is grey,
  not red).
- We chose four topics over the originally-floated three (Integrity needed a
  home), worst-wins over best-wins for the border, and fan-out over treating C2PA
  as AI-only. These were live trade-offs, which is why they are recorded here.
- The flip-side ("Backend Verification") still lists raw per-method statuses and
  is deliberately left unchanged for now.
- C2PA AI-provenance is primarily the manifest's `trainedAlgorithmicMedia`
  assertion (`is_ai_generated`); the known-AI-generator signer list is a
  complementary heuristic for manifests that omit the assertion. C2PA's signed
  date and location now fan out into Date & Time and Location. The backend's
  `summary` already carried all of these, so no Python change was needed.
