import { useCallback, useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { ArrowLeft, ExternalLink, Loader2, MapPin, Maximize2 } from 'lucide-react';
import {
  findClosestPanoramaxPicture,
  panoramaxViewerUrl,
  type PanoramaxPicture,
} from '../../lib/panoramax';
import { cn } from './cn';

/** OpenStreetMap raster tiles for the 2D map card. */
const OSM_MAP_STYLE: maplibregl.StyleSpecification = {
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

type MapViewMode = 'map' | 'streetview';

export function MapPanel({
  lat,
  lng,
  source,
}: {
  lat?: number;
  lng?: number;
  source?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  const [viewMode, setViewMode] = useState<MapViewMode>('map');
  const [mapError, setMapError] = useState<string | null>(null);
  const [panoramaxLoading, setPanoramaxLoading] = useState(false);
  const [panoramaxError, setPanoramaxError] = useState<string | null>(null);
  const [panoramaxPicture, setPanoramaxPicture] = useState<PanoramaxPicture | null>(null);
  const [activeStreetPicture, setActiveStreetPicture] = useState<PanoramaxPicture | null>(null);

  useEffect(() => {
    setViewMode('map');
    setMapError(null);
    setPanoramaxPicture(null);
    setActiveStreetPicture(null);
    setPanoramaxError(null);
  }, [lat, lng]);

  useEffect(() => {
    if (lat == null || lng == null) return;

    let cancelled = false;
    setPanoramaxLoading(true);
    setPanoramaxError(null);

    findClosestPanoramaxPicture(lat, lng)
      .then((picture) => {
        if (cancelled) return;
        setPanoramaxPicture(picture);
        setActiveStreetPicture(picture);
        if (!picture) {
          setPanoramaxError('No Panoramax street-level imagery near this location.');
        }
      })
      .catch(() => {
        if (cancelled) return;
        setPanoramaxError('Could not reach the Panoramax catalog.');
      })
      .finally(() => {
        if (!cancelled) setPanoramaxLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  useEffect(() => {
    if (viewMode !== 'map' || !containerRef.current || lat == null || lng == null) return;

    setMapError(null);
    let map: maplibregl.Map | null = null;

    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: OSM_MAP_STYLE,
        center: [lng, lat],
        zoom: 15,
      });
      map.addControl(new maplibregl.NavigationControl(), 'top-right');
      new maplibregl.Marker({ color: '#2563eb' }).setLngLat([lng, lat]).addTo(map);
      map.once('load', () => map?.resize());
      mapRef.current = map;
    } catch (err) {
      setMapError(err instanceof Error ? err.message : 'Could not initialize the map.');
    }

    return () => {
      try {
        map?.remove();
      } catch {
        // Map may already be detached when the panel closes quickly.
      }
      mapRef.current = null;
    };
  }, [viewMode, lat, lng]);

  const openStreetView = useCallback(() => {
    if (!panoramaxPicture) return;
    setActiveStreetPicture(panoramaxPicture);
    setViewMode('streetview');
  }, [panoramaxPicture]);

  if (lat == null || lng == null) {
    return (
      <div className="text-center py-12">
        <MapPin className="w-16 h-16 mx-auto mb-4 text-gray-300" />
        <p className="text-gray-600">No GPS coordinates available</p>
      </div>
    );
  }

  const cardHeight = 350;
  const miniHeight = Math.round(cardHeight * 0.2);
  const miniWidth = Math.round(miniHeight * 1.45);

  const displayLat = viewMode === 'streetview' && activeStreetPicture ? activeStreetPicture.lat : lat;
  const displayLng = viewMode === 'streetview' && activeStreetPicture ? activeStreetPicture.lng : lng;

  return (
    <div>
      <h3 className="font-semibold text-lg mb-4 flex items-center gap-2 text-gray-900">
        <MapPin className="w-5 h-5" />
        Location
      </h3>

      <div
        className="relative bg-white rounded-lg overflow-hidden shadow-md mb-4"
        style={{ height: cardHeight }}
      >
        {/* State 1 — 2D map + mini street-view trigger (thumbnail only; no heavy viewer yet) */}
        <div
          className={cn(
            'absolute inset-0 transition-all duration-300 ease-out',
            viewMode === 'map'
              ? 'opacity-100 scale-100 pointer-events-auto'
              : 'opacity-0 scale-95 pointer-events-none',
          )}
        >
          <div ref={containerRef} className="w-full h-full" />

          {mapError && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-50/95 px-4 text-center text-sm text-gray-600">
              {mapError}
            </div>
          )}

          {panoramaxLoading && (
            <div className="absolute bottom-3 right-3 flex items-center gap-2 rounded-lg bg-white/90 px-3 py-2 text-xs text-gray-600 shadow-md">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Loading street view…
            </div>
          )}

          {!panoramaxLoading && panoramaxPicture && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openStreetView();
              }}
              className="absolute bottom-3 right-3 group overflow-hidden rounded-lg border-2 border-white shadow-lg ring-2 ring-blue-500/40 transition-transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-blue-400/50"
              style={{ width: miniWidth, height: miniHeight }}
              title="Open 360° street view"
              aria-label="Open Panoramax street view"
            >
              {panoramaxPicture.thumbnailUrl ? (
                <img
                  src={panoramaxPicture.thumbnailUrl}
                  alt="Nearby Panoramax street view"
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gray-200 text-[10px] text-gray-600">
                  Street view
                </div>
              )}
              <div className="absolute inset-0 bg-black/20 transition-colors group-hover:bg-black/10" />
              <div className="absolute bottom-1 right-1 rounded bg-black/60 p-0.5 text-white">
                <Maximize2 className="w-3 h-3" />
              </div>
            </button>
          )}
        </div>

        {/* State 2 — full Panoramax viewer (hosted iframe; isolated from extension React tree) */}
        <div
          className={cn(
            'absolute inset-0 transition-all duration-300 ease-out',
            viewMode === 'streetview'
              ? 'opacity-100 scale-100 pointer-events-auto'
              : 'opacity-0 scale-105 pointer-events-none',
          )}
        >
          {panoramaxPicture && viewMode === 'streetview' && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setViewMode('map');
                  setActiveStreetPicture(panoramaxPicture);
                }}
                className="absolute top-3 left-3 z-20 inline-flex items-center gap-1.5 rounded-lg bg-black/70 px-3 py-1.5 text-xs font-semibold text-white shadow-md backdrop-blur-sm transition-colors hover:bg-black/85"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to Map
              </button>
              <iframe
                title="Panoramax street view"
                src={panoramaxViewerUrl(panoramaxPicture)}
                className="h-full w-full border-0"
                allow="fullscreen"
                referrerPolicy="no-referrer"
              />
            </>
          )}
        </div>
      </div>

      <div className="text-sm space-y-1">
        <p className="text-gray-700">
          {viewMode === 'streetview' ? (
            <>
              <span className="text-gray-600">Verified Street View:</span>{' '}
              <span className="font-mono">
                {displayLat.toFixed(6)}, {displayLng.toFixed(6)}
              </span>
              <span className="text-gray-500"> (Panoramax)</span>
            </>
          ) : (
            <>
              <span className="text-gray-600">Coordinates:</span>{' '}
              <span className="font-mono">
                {displayLat.toFixed(6)}, {displayLng.toFixed(6)}
              </span>
              {source && <span className="text-gray-500"> (from {source})</span>}
            </>
          )}
        </p>

        {viewMode === 'map' && panoramaxError && !panoramaxLoading && (
          <p className="text-xs text-gray-500">{panoramaxError}</p>
        )}

        <a
          href={`https://www.openstreetmap.org/?mlat=${displayLat}&mlon=${displayLng}#map=15/${displayLat}/${displayLng}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline inline-flex items-center gap-1"
        >
          Open in OpenStreetMap <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );
}
