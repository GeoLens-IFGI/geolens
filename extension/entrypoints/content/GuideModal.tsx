import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { LIGHT_RGB } from './topics';
import type { TrafficLight } from './topics';

// The help/guide overlay, opened from the footer info icon. Explains the colour
// legend, how to use the interface, what each category verifies and how to read
// the map. Closes on the X, on a backdrop click, or on Escape.
const Z = 2147483647;

export function GuideModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-[fadeIn_150ms_ease-out]"
      style={{ zIndex: Z + 1 }}
      onClick={onClose}
    >
      <div
        className="relative w-[560px] max-w-[95vw] max-h-[85vh] overflow-y-auto rounded-2xl bg-white p-7 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="absolute right-4 top-4 rounded-full p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          aria-label="Close guide"
          onClick={onClose}
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="mb-1 text-xl font-semibold text-gray-900">How GeoLens works</h2>
        <p className="mb-5 text-sm text-gray-500">
          A quick guide to reading the results.
        </p>

        <Section title="Colour legend">
          <Legend light="green" label="Verified" desc="This category passed all verifications." />
          <Legend light="orange" label="Partial" desc="Some verifications passed, some are inconclusive." />
          <Legend light="red" label="Failed" desc="Verification failed or the data is inconsistent." />
          <Legend light="gray" label="Not checked" desc="This category was not verified." />
        </Section>

        <Section title="How to use">
          <Bullets
            items={[
              'Click any coloured category box to expand it and see the details.',
              'The image frame colour changes to match the category you select.',
              'Verifier information appears when you expand a category.',
              'Hover the “?” on each category to learn what it verifies.',
            ]}
          />
        </Section>

        <Section title="What each category verifies">
          <Bullets
            items={[
              'Location — where the photo was taken (using geolocation data).',
              'Date and Time — when the photo was taken (using timestamp data).',
              'Camera and File Info — device specifications and file metadata.',
              'Real or AI-Generated? — whether the image was taken by a camera or created by AI.',
            ]}
          />
        </Section>

        <Section title="Understanding results">
          <Bullets
            items={[
              'Green means that category was verified as authentic.',
              'Orange means verification is inconclusive or only partially confirmed.',
              'Red means verification failed or the data appears inconsistent.',
              'Open “Why?” under a verifier to see its methodology.',
            ]}
          />
        </Section>

        <Section title="Map features">
          <Bullets
            items={[
              'A green pin shows the verified geolocation (if available).',
              'An orange pin shows general geolocation data (if available).',
              'Switch between Street, Satellite, or Panoramic views.',
              'Zoom and pan to explore the location.',
            ]}
          />
        </Section>
      </div>

      <style>{`@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }`}</style>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-5 last:mb-0">
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function Legend({ light, label, desc }: { light: TrafficLight; label: string; desc: string }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="h-5 w-5 flex-shrink-0 rounded-md"
        style={{ backgroundColor: `rgb(${LIGHT_RGB[light]})` }}
      />
      <p className="text-sm text-gray-700">
        <span className="font-semibold text-gray-900">{label}</span> — {desc}
      </p>
    </div>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={item} className="flex gap-2 text-sm text-gray-700">
          <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-gray-300" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
