# 1. Render the Inspector as a React UI inside the content script

Date: 2026-06-03

## Status

Accepted

## Context

The extension is a WXT project written in plain TypeScript. Its UI today is a
small inline box that the content script builds with manual DOM calls and pins to
the bottom of the inspected image.

We want to adopt a new design (the `GeoLens/` Figma export): a full-screen modal
that surrounds the *actual* in-page image, with a colour-keyed border, a rail of
tool icons opening detail panels, a 3D flip to a "backend status" side, and a
MapLibre map. The design was authored as a React + Tailwind v4 + Radix app.

Three ways to deliver it were considered:

1. **React inside the content script** — mount a React root into a WXT
   shadow-root UI, port the design's components, and keep the existing
   right-click → background → message flow that feeds them.
2. **Re-implement in vanilla TS** — keep the zero-dependency content script and
   rebuild the modal, icon rail, flip, panels, and map by hand in DOM/CSS.
3. **Render it as the toolbar popup** — put the React design in the WXT popup
   window.

The Inspector must surround the real image on the page, so the popup (3) cannot
express the core concept — a detached popup window can't overlay page content.
That left a faithfulness-vs-footprint trade-off between (1) and (2).

## Decision

We render the Inspector as a **React UI mounted into the content script's
shadow-root UI**, with Tailwind v4 scoped to that shadow root and a minimal
dependency set (React, `@radix-ui/react-dialog`, `@radix-ui/react-scroll-area`,
`lucide-react`, `maplibre-gl`, `clsx`/`tailwind-merge`). The design's components
are ported largely as-authored. The existing trigger and streaming message flow
are retained; only the rendering layer changes.

## Consequences

- The design ports with high fidelity and stays close to its source, so future
  visual changes can be made against React components rather than hand-written
  DOM.
- React, a JSX/Tailwind build path, and shadow-DOM style injection are now part
  of the content script. This is the surprising part: React lives in the content
  script, **not** in the popup (there is no popup — it was removed). A future
  reader expecting React in `entrypoints/popup` will not find it there.
- The content script bundle grows (React + libraries) versus the previous
  zero-dependency overlay.
- Reversing this — going back to vanilla DOM — would mean rewriting the entire
  Inspector, which is why it is recorded here.
- We deliberately do **not** import the Figma export's full dependency list
  (MUI, recharts, the whole shadcn set); only the components actually used are
  ported.
