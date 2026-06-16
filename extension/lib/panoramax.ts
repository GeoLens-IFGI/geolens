/** Panoramax federated meta-catalog (STAC API). */
export const PANORAMAX_ENDPOINT = 'https://api.panoramax.xyz/api';

export type PanoramaxPicture = {
  pictureId: string;
  sequenceId: string;
  lat: number;
  lng: number;
  thumbnailUrl?: string;
  is360: boolean;
};

type StacFeature = {
  id: string;
  collection: string;
  geometry?: { type: string; coordinates?: [number, number] };
  assets?: { thumb?: { href?: string } };
  properties?: Record<string, unknown>;
};

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function is360Feature(feature: StacFeature): boolean {
  const interior = feature.properties?.['pers:interior_orientation'] as
    | { field_of_view?: number }
    | undefined;
  if (interior?.field_of_view === 360) return true;
  const exif = feature.properties?.exif as Record<string, string> | undefined;
  if (exif?.['Xmp.GPano.ProjectionType'] === 'equirectangular') return true;
  if (exif?.['Xmp.GPano.UsePanoramaViewer'] === 'True') return true;
  return false;
}

function featureToPicture(feature: StacFeature): PanoramaxPicture | null {
  const coords = feature.geometry?.coordinates;
  if (!coords || coords.length < 2) return null;
  const [lng, lat] = coords;
  const props = feature.properties ?? {};
  return {
    pictureId: feature.id,
    sequenceId: feature.collection,
    lat,
    lng,
    thumbnailUrl:
      feature.assets?.thumb?.href ??
      (props['geovisio:thumbnail'] as string | undefined),
    is360: is360Feature(feature),
  };
}

/** Search expanding radii until a nearby picture is found, preferring 360° captures. */
export async function findClosestPanoramaxPicture(
  lat: number,
  lng: number,
): Promise<PanoramaxPicture | null> {
  const radiiDeg = [0.002, 0.005, 0.01, 0.02, 0.05];

  for (const factor of radiiDeg) {
    const bbox = [lng - factor, lat - factor, lng + factor, lat + factor].join(',');
    const url = `${PANORAMAX_ENDPOINT}/search?bbox=${bbox}&limit=25`;
    const res = await fetch(url);
    if (!res.ok) continue;

    const data = (await res.json()) as { features?: StacFeature[] };
    const features = data.features ?? [];
    if (!features.length) continue;

    const ranked = features
      .map((feature) => {
        const coords = feature.geometry?.coordinates;
        if (!coords) return null;
        const dist = haversineMeters(lat, lng, coords[1], coords[0]);
        return { feature, dist, is360: is360Feature(feature) };
      })
      .filter((row): row is NonNullable<typeof row> => row != null)
      .sort((a, b) => {
        if (a.is360 !== b.is360) return a.is360 ? -1 : 1;
        return a.dist - b.dist;
      });

    const best = ranked[0];
    if (!best) continue;
    return featureToPicture(best.feature);
  }

  return null;
}

export function panoramaxViewerUrl(picture: PanoramaxPicture): string {
  const params = new URLSearchParams({
    focus: 'viewer',
    seq: picture.sequenceId,
    pic: picture.pictureId,
  });
  return `https://api.panoramax.xyz/?${params.toString()}`;
}

export async function fetchPanoramaxPictureMeta(
  sequenceId: string,
  pictureId: string,
): Promise<PanoramaxPicture | null> {
  const url = `${PANORAMAX_ENDPOINT}/collections/${sequenceId}/items/${pictureId}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const feature = (await res.json()) as StacFeature;
  return featureToPicture(feature);
}
