import { useEffect, useRef, useState, type ComponentType } from 'react';
import maplibregl from 'maplibre-gl';
import { ExternalLink, Loader2, Map as MapIcon, Mountain, Satellite } from 'lucide-react';
import {
  findClosestPanoramaxPicture,
  panoramaxViewerUrl,
  type PanoramaxPicture,
} from '../../lib/panoramax';
import { cn } from './cn';

/** OpenStreetMap raster tiles for the 2D street map. */
const STREET_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

/** Esri World Imagery raster tiles for the satellite view. */
const SATELLITE_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    esri: {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      attribution: 'Imagery © Esri',
    },
  },
  layers: [{ id: 'esri', type: 'raster', source: 'esri' }],
};

type Coords = { lat: number; lng: number };
type MapMode = 'street' | 'satellite' | 'panoramic';

const PIN_GREEN = '#0E7C5A';
const PIN_ORANGE = '#EA7317';

// The map card. `verified` is GeoLens's signed coordinate (a green pin); `general`
// is a secondary, self-reported coordinate such as EXIF GPS (an orange pin). When
// neither is present the map still renders (a world view) with no pins. A
// panoramic (360°) view is offered only when Panoramax has imagery nearby.
export function MapPanel({
  verified,
  general,
}: {
  verified?: Coords;
  general?: Coords;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  const primary = verified ?? general;
  const hasCoords = !!primary;

  const [mode, setMode] = useState<MapMode>('street');
  const [mapError, setMapError] = useState<string | null>(null);
  const [panoLoading, setPanoLoading] = useState(false);
  const [panoError, setPanoError] = useState<string | null>(null);
  const [pano, setPano] = useState<PanoramaxPicture | null>(null);

  // Look for nearby street-level imagery whenever the primary coordinate moves.
  useEffect(() => {
    setMode('street');
    setPano(null);
    setPanoError(null);
    if (!primary) return;

    let cancelled = false;
    setPanoLoading(true);
    findClosestPanoramaxPicture(primary.lat, primary.lng)
      .then((picture) => {
        if (cancelled) return;
        setPano(picture);
        if (!picture) setPanoError('No panoramic imagery near this location.');
      })
      .catch(() => {
        if (!cancelled) setPanoError('Could not reach the panoramic catalog.');
      })
      .finally(() => {
        if (!cancelled) setPanoLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [primary?.lat, primary?.lng]);

  // (Re)build the raster map for the street/satellite modes.
  useEffect(() => {
    if (mode === 'panoramic' || !containerRef.current) return;

    setMapError(null);
    let map: maplibregl.Map | null = null;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: mode === 'satellite' ? SATELLITE_STYLE : STREET_STYLE,
        center: primary ? [primary.lng, primary.lat] : [0, 20],
        zoom: primary ? 15 : 1,
      });
      map.addControl(new maplibregl.NavigationControl(), 'top-right');

      if (verified) {
        new maplibregl.Marker({ color: PIN_GREEN }).setLngLat([verified.lng, verified.lat]).addTo(map);
      }
      if (general && (general.lat !== verified?.lat || general.lng !== verified?.lng)) {
        new maplibregl.Marker({ color: PIN_ORANGE }).setLngLat([general.lng, general.lat]).addTo(map);
      }

      map.once('load', () => map?.resize());
    } catch (err) {
      setMapError(err instanceof Error ? err.message : 'Could not initialize the map.');
    }

    return () => {
      try {
        map?.remove();
      } catch {
        // Map may already be detached when the panel closes quickly.
      }
    };
  }, [mode, verified?.lat, verified?.lng, general?.lat, general?.lng]);

  const cardHeight = 320;

  return (
    <div className="space-y-2">
      {/* View-mode toggles */}
      <div className="flex gap-1.5">
        <ModeButton active={mode === 'street'} onClick={() => setMode('street')} icon={MapIcon} label="Street" />
        <ModeButton active={mode === 'satellite'} onClick={() => setMode('satellite')} icon={Satellite} label="Satellite" />
        <ModeButton
          active={mode === 'panoramic'}
          onClick={() => pano && setMode('panoramic')}
          icon={Mountain}
          label="Panoramic"
          disabled={!pano}
          loading={panoLoading}
        />
      </div>

      <div
        className="relative overflow-hidden rounded-xl bg-gray-100 shadow-inner"
        style={{ height: cardHeight }}
      >
        {/* Raster map (street / satellite) */}
        <div className={cn('absolute inset-0', mode === 'panoramic' && 'pointer-events-none opacity-0')}>
          <div ref={containerRef} className="h-full w-full" />
          {mapError && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-50/95 px-4 text-center text-sm text-gray-600">
              {mapError}
            </div>
          )}
          {!hasCoords && !mapError && (
            <div className="pointer-events-none absolute inset-x-0 bottom-3 mx-auto w-max rounded-lg bg-white/90 px-3 py-1.5 text-xs text-gray-600 shadow">
              No geolocation data available
            </div>
          )}
        </div>

        {/* Panoramic 360° viewer (hosted iframe) */}
        {mode === 'panoramic' && pano && (
          <iframe
            title="Panoramic street view"
            src={panoramaxViewerUrl(pano)}
            className="h-full w-full border-0"
            allow="fullscreen"
            referrerPolicy="no-referrer"
          />
        )}
      </div>

      {/* Caption */}
      <div className="text-sm">
        {hasCoords ? (
          <>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-gray-700">
              {verified && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PIN_GREEN }} />
                  <span className="font-mono text-xs">
                    {verified.lat.toFixed(5)}, {verified.lng.toFixed(5)}
                  </span>
                  <span className="text-xs text-gray-500">verified</span>
                </span>
              )}
              {general && (general.lat !== verified?.lat || general.lng !== verified?.lng) && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PIN_ORANGE }} />
                  <span className="font-mono text-xs">
                    {general.lat.toFixed(5)}, {general.lng.toFixed(5)}
                  </span>
                  <span className="text-xs text-gray-500">general</span>
                </span>
              )}
            </p>
            {mode !== 'panoramic' && panoError && !panoLoading && (
              <p className="mt-0.5 text-xs text-gray-400">{panoError}</p>
            )}
            <a
              href={`https://www.openstreetmap.org/?mlat=${primary!.lat}&mlon=${primary!.lng}#map=15/${primary!.lat}/${primary!.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-0.5 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
            >
              Open in OpenStreetMap <ExternalLink className="h-3 w-3" />
            </a>
          </>
        ) : (
          <p className="text-xs text-gray-500">
            This image carries no location data, so there's no pin to show.
          </p>
        )}
      </div>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  icon: Icon,
  label,
  disabled,
  loading,
}: {
  active: boolean;
  onClick: () => void;
  icon: ComponentType<{ className?: string }>;
  label: string;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors',
        active
          ? 'bg-gray-900 text-white'
          : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
        disabled && 'cursor-not-allowed opacity-40 hover:bg-gray-100',
      )}
      title={disabled ? `${label} view unavailable here` : `${label} view`}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
      {label}
    </button>
  );
}
