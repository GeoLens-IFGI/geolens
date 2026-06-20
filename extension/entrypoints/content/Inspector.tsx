import { useEffect, useMemo, useState } from 'react';
import { X, MapPin, ExternalLink, HelpCircle, Loader2 } from 'lucide-react';
import type { Inspection } from './types';
import { deriveTopics, LIGHT_RGB, type TopicId } from './topics';
import { cn } from './cn';
import { TopicCard } from './TopicCard';
import { MapPanel } from './MapPanel';
import { GuideModal } from './GuideModal';
import { PanelErrorBoundary } from './PanelErrorBoundary';

const Z = 2147483647;
const REPO_URL = 'https://github.com/GeoLens-IFGI/geolens';

export function Inspector({
  inspection,
  onClose,
}: {
  inspection: Inspection;
  onClose: () => void;
}) {
  const [selectedId, setSelectedId] = useState<TopicId | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  // Stamp the moment the user opened the inspector — shown as "Verified …".
  const [openedAt] = useState(() => new Date());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !guideOpen) onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, guideOpen]);

  const topics = deriveTopics(inspection);
  const selected = topics.find((t) => t.id === selectedId) ?? null;
  const anyLoading = topics.some((t) => t.loading);

  // Frame colour follows the selected category; grey when nothing is selected.
  const frameLight = selected ? selected.light : 'gray';
  const rgb = LIGHT_RGB[frameLight];

  // Coordinates for the map: GeoLens's signed location is the verified (green)
  // pin; EXIF GPS is the general (orange) pin.
  const geo = inspection.geocam;
  const exif = inspection.exif.exif;
  const verified = useMemo(
    () => (geo.lat != null && geo.lng != null ? { lat: geo.lat, lng: geo.lng } : undefined),
    [geo.lat, geo.lng],
  );
  const general = useMemo(
    () => (exif?.lat != null && exif?.lng != null ? { lat: exif.lat, lng: exif.lng } : undefined),
    [exif?.lat, exif?.lng],
  );

  const hasLocation = !!(verified || general);

  const toggleCard = (id: TopicId) => setSelectedId((cur) => (cur === id ? null : id));

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      style={{ zIndex: Z }}
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[92vh] w-[920px] max-w-[95vw] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="absolute right-3 top-3 z-20 rounded-full bg-white/80 p-1.5 text-gray-400 shadow-sm backdrop-blur-sm transition-colors hover:bg-gray-100 hover:text-gray-700"
          aria-label="Close"
          onClick={onClose}
        >
          <X className="h-5 w-5" />
        </button>

        {/* ── Body: image (left) + results (right) ──────────────────────────── */}
        <div className="flex min-h-0 flex-1">
          {/* Image with dynamic frame */}
          <div className="flex w-[42%] flex-shrink-0 items-center justify-center bg-gray-50 p-6">
            <div
              className="overflow-hidden rounded-xl transition-all duration-300"
              style={{
                border: `10px solid rgb(${rgb})`,
                boxShadow: `0 0 0 1px rgba(${rgb}, 0.4), 0 0 32px rgba(${rgb}, 0.45), 0 0 64px rgba(${rgb}, 0.2)`,
              }}
            >
              <img
                src={inspection.imageUrl}
                alt={inspection.imageAlt}
                className="block max-h-[64vh] w-full object-contain"
              />
            </div>
          </div>

          {/* Results panel — extra top padding keeps the first card clear of the close button. */}
          <div className="flex min-w-0 flex-1 flex-col overflow-y-auto px-5 pb-4 pt-12">
            <div className="space-y-2.5">
              {topics.map((topic) => (
                <TopicCard
                  key={topic.id}
                  topic={topic}
                  selected={selectedId === topic.id}
                  onToggle={() => toggleCard(topic.id)}
                />
              ))}
            </div>

            {/* Show / hide map — disabled until a location is found. */}
            <button
              type="button"
              onClick={() => hasLocation && setMapOpen((o) => !o)}
              disabled={!hasLocation}
              title={hasLocation ? undefined : 'No location data found for this image'}
              className={cn(
                'mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-[15px] font-semibold shadow-sm transition-[filter]',
                hasLocation
                  ? 'bg-slate-800 text-white hover:brightness-125'
                  : 'cursor-not-allowed bg-gray-200 text-gray-400',
              )}
            >
              <MapPin className="h-4 w-4" />
              {!hasLocation ? 'No location found' : mapOpen ? 'Hide Map' : 'Show Map'}
            </button>

            {mapOpen && hasLocation && (
              <div className="mt-3">
                <PanelErrorBoundary label="Map panel">
                  <MapPanel verified={verified} general={general} />
                </PanelErrorBoundary>
              </div>
            )}

            {/* Verification timestamp */}
            <p className="mt-4 flex items-center gap-1.5 text-xs text-gray-400">
              {anyLoading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Verifying… please wait
                </>
              ) : (
                <>Verified {openedAt.toLocaleString()}</>
              )}
            </p>
          </div>
        </div>

        {/* ── Footer ────────────────────────────────────────────────────────── */}
        <footer className="flex items-center justify-between border-t border-gray-200 px-5 py-2.5 text-xs text-gray-400">
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 transition-colors hover:text-gray-600 hover:underline"
          >
            Learn more <ExternalLink className="h-3 w-3" />
          </a>
          <button
            type="button"
            onClick={() => setGuideOpen(true)}
            className="inline-flex items-center gap-1 transition-colors hover:text-gray-600"
            aria-label="Open guide"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            Guide
          </button>
        </footer>
      </div>

      {guideOpen && <GuideModal onClose={() => setGuideOpen(false)} />}
    </div>
  );
}
