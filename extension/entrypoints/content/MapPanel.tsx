import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { MapPin, ExternalLink } from 'lucide-react';

const MAP_STYLE = 'https://vectortiles.gero.dev/style/eselac-bikestyle';

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

  useEffect(() => {
    if (!containerRef.current || lat == null || lng == null) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [lng, lat],
      zoom: 13,
    });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    new maplibregl.Marker({ color: '#2563eb' }).setLngLat([lng, lat]).addTo(map);

    return () => map.remove();
  }, [lat, lng]);

  if (lat == null || lng == null) {
    return (
      <div className="text-center py-12">
        <MapPin className="w-16 h-16 mx-auto mb-4 text-gray-300" />
        <p className="text-gray-600">No GPS coordinates available</p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="font-semibold text-lg mb-4 flex items-center gap-2 text-gray-900">
        <MapPin className="w-5 h-5" />
        Location
      </h3>
      <div className="bg-white rounded-lg overflow-hidden shadow-md mb-4">
        <div ref={containerRef} className="w-full h-[350px]" />
      </div>
      <div className="text-sm space-y-1">
        <p className="text-gray-700">
          <span className="text-gray-600">Coordinates:</span>{' '}
          <span className="font-mono">
            {lat.toFixed(6)}, {lng.toFixed(6)}
          </span>
          {source && <span className="text-gray-500"> (from {source})</span>}
        </p>
        <a
          href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=15/${lat}/${lng}`}
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
