import * as exifr from 'exifr';
import { registry } from '../core/registry';

// Loading this module triggers the adapter's
// self-registration with the regristry (side effect).
import '../validators/geocam/adapter';
import '../validators/c2pa/adapter';

export default defineBackground(() => {
  browser.contextMenus.create({
    id: 'validate-image',
    title: 'Validate image',
    contexts: ['image'],
  });

  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    console.log('[background] menu click recieved:', info, tab);

    if (info.menuItemId !== 'validate-image') return;
    if (!tab?.id) return;

    const imageUrl = info.srcUrl ?? '';
    if (!imageUrl) {
      browser.tabs.sendMessage(tab.id, {
        action: 'validate-image-geocam-result',
        imageUrl,
        status: 'unavailable',
        error: 'No image URL was available for GeoCam validation.',
    });
    browser.tabs.sendMessage(tab.id, {
        action: 'validate-image-exif-result',
        imageUrl,
        status: 'unavailable',
        error: 'No image URL was available for EXIF decoding.',
      });
      browser.tabs.sendMessage(tab.id, {
       action: 'validate-image-synthid-result',
       imageUrl,
       status: 'unavailable',
       error: 'No image URL was available.',
      });
      browser.tabs.sendMessage(tab.id, {
        action: 'validate-image-c2pa-result',
        imageUrl,
        status: 'unavailable',
        error: 'No image URL was available for C2PA validation.',
      });
      return;
    }

    browser.tabs.sendMessage(tab.id, {
      action: 'validate-image-start',
      imageUrl,
    });

    // Run all checks in parallel. Each check owns its own fetch.
    void runGeoCamCheck(tab.id, imageUrl);
    void runExifCheck(tab.id, imageUrl);
    void runSynthIDCheck(tab.id, imageUrl);
    void runC2PACheck(tab.id, imageUrl);
  });
});

// C2PA dispatched via registry.
async function runC2PACheck(tabId: number, imageUrl: string) {
  const result = await registry.validateWith('c2pa', imageUrl);

  if (!result) {
    // Just in case no validator named 'c2pa' was registered.
    browser.tabs.sendMessage(tabId, {
      action: 'validate-image-c2pa-result',
      imageUrl,
      status: 'unavailable',
      error: 'C2PA validator is not registered.',
    });
    return;
  }

  // Translate registry's ValidationResult into wire format
  // which the content script understands.
  browser.tabs.sendMessage(tabId, {
    action: 'validate-image-c2pa-result',
    imageUrl,
    status: result.status,
    message: result.message,
    error: result.error,
  });
}

// GeoCam dispatched via registry.
async function runGeoCamCheck(tabId: number, imageUrl: string) {
  const result = await registry.validateWith('geocam', imageUrl);

  if (!result) {
    // Just in case no validator named 'geocam' was registered.
    browser.tabs.sendMessage(tabId, {
      action: 'validate-image-geocam-result',
      imageUrl,
      status: 'unavailable',
      error: 'GeoCam validator is not registered.',
    });
    return;
  }

  // Translate registry's ValidationResult into wire format
  // which the content script understands.
  const coords = result.details as { lat?: number; lng?: number } | undefined;
  browser.tabs.sendMessage(tabId, {
    action: 'validate-image-geocam-result',
    imageUrl,
    status: result.status,
    message: result.message,
    error: result.error,
    lat: coords?.lat,
    lng: coords?.lng,
  });
}

// EXIF: remains unchanged here. Consider refactoring into
// an 'insepctor' adaptor in the future.

type ExifSummary = {
  camera?: string;
  lens?: string;
  takenAt?: string;
  dimensions?: string;
  iso?: string;
  aperture?: string;
  shutterSpeed?: string;
  focalLength?: string;
  author?: string;
  license?: string;
  title?: string;
  description?: string;
  gps?: string;
  lat?: number;
  lng?: number;
};

type ExifResult = {
  status: 'available' | 'none' | 'unavailable';
  exif?: ExifSummary;
  fileSize?: string;
  format?: string;
  error?: string;
};

type SynthIDResult = {
  status: 'verified' | 'not-verified' | 'unavailable';
  message?: string;
  confidence?: 'high' | 'medium' | 'low';
  detail?: string;
};

async function runExifCheck(tabId: number, imageUrl: string) {
  try {
    // EXIF still does its own fetch here, since the adapter now owns
    // GeoCam's fetch and there's no shared pre-fetched blob anymore.
    const imgRes = await fetch(imageUrl);
    const blob = await imgRes.blob();

    const exif = await parseExif(blob);
    const meta = { fileSize: formatBytes(blob.size), format: blobFormat(blob, imageUrl) };
    const result: ExifResult = exif
      ? { status: 'available', exif, ...meta }
      : { status: 'none', ...meta };

    browser.tabs.sendMessage(tabId, {
      action: 'validate-image-exif-result',
      imageUrl,
      ...result,
    });
  } catch (error) {
    console.warn('[background] failed to parse EXIF:', error);
    browser.tabs.sendMessage(tabId, {
      action: 'validate-image-exif-result',
      imageUrl,
      status: 'unavailable',
      error: 'EXIF decoding is unavailable for this image.',
    });
  }
}

async function parseExif(blob: Blob): Promise<ExifSummary | null> {
  try {
    const data = await exifr.parse(blob, {
      tiff: true,
      exif: true,
      gps: true,
      xmp: true,
      translateValues: true,
    });

    if (!data) return null;

    const cameraParts = [data.Make, data.Model].filter(Boolean);
    const lat = typeof data.latitude === 'number' ? data.latitude : undefined;
    const lng = typeof data.longitude === 'number' ? data.longitude : undefined;

    return {
      camera: cameraParts.length ? cameraParts.join(' ') : undefined,
      lens: data.LensModel ?? data.LensSpecification ?? undefined,
      takenAt: stringifyDate(data.DateTimeOriginal ?? data.CreateDate ?? data.ModifyDate),
      dimensions: data.ExifImageWidth && data.ExifImageHeight ? `${data.ExifImageWidth} × ${data.ExifImageHeight}` : undefined,
      iso: data.ISO ? `ISO ${data.ISO}` : undefined,
      aperture: data.FNumber ? `f/${data.FNumber}` : undefined,
      shutterSpeed: formatShutter(data.ExposureTime),
      focalLength: data.FocalLength ? `${Math.round(data.FocalLength)}mm` : undefined,
      author: firstString(data.Artist, data.creator, data.Creator),
      license: firstString(data.Copyright, data.rights, data.Rights, data.UsageTerms, data.WebStatement),
      title: firstString(data.title, data.Title, data.headline, data.Headline, data.ObjectName),
      description: firstString(data.ImageDescription, data.description, data.Description, data.Caption, data['Caption-Abstract']),
      gps: formatGps(lat, lng, data.altitude),
      lat,
      lng,
    };
  } catch (error) {
    console.warn('[background] failed to parse EXIF:', error);
    return null;
  }
}

function formatGps(latitude?: number, longitude?: number, altitude?: number): string | undefined {
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return undefined;

  const latDirection = latitude >= 0 ? 'N' : 'S';
  const lonDirection = longitude >= 0 ? 'E' : 'W';
  const altitudePart = typeof altitude === 'number' ? `, ${Math.abs(altitude).toFixed(0)} m` : '';

  return `${Math.abs(latitude).toFixed(5)}° ${latDirection}, ${Math.abs(longitude).toFixed(5)}° ${lonDirection}${altitudePart}`;
}

// Pick the first usable string from a set of candidate EXIF/XMP/IPTC fields.
function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (Array.isArray(value) && value.length && typeof value[0] === 'string') return value[0];
  }
  return undefined;
}

function stringifyDate(value: unknown): string | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value.toLocaleString();
  if (typeof value === 'string') return value;
  return undefined;
}

function formatShutter(exposureTime?: number): string | undefined {
  if (typeof exposureTime !== 'number' || !exposureTime) return undefined;
  if (exposureTime >= 1) return `${exposureTime}s`;
  return `1/${Math.round(1 / exposureTime)}s`;
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

// Best-effort image format label, e.g. "jpeg" or "png".
function blobFormat(blob: Blob, imageUrl: string): string | undefined {
  if (blob.type && blob.type.startsWith('image/')) {
    return blob.type.slice('image/'.length).split(';')[0];
  }
  const match = imageUrl.split('?')[0].match(/\.([a-z0-9]{2,5})$/i);
  return match ? match[1].toLowerCase() : undefined;
}

async function runSynthIDCheck(tabId: number, imageUrl: string) {
  try {
    // Like EXIF, SynthID owns its own fetch now that there's no shared blob.
    const imgRes = await fetch(imageUrl);
    const blob = await imgRes.blob();

    const formData = new FormData();
    formData.append('file', blob, 'image.png');

    const apiRes = await fetch('http://localhost:8000/verify-image/', {
      method: 'POST',
      body: formData,
    });

    if (!apiRes.ok) throw new Error(`Server error: ${apiRes.status}`);

    const data = await apiRes.json();
    const result = data?.checks?.synthid;
    
    if (!result) {
      throw new Error('Missing synthid result from backend');
    }

    browser.tabs.sendMessage(tabId, {
      action: 'validate-image-synthid-result',
      imageUrl,
      status: result.status,
      message: result.message,
      error: result.error,
    });
  } catch (err) {
    browser.tabs.sendMessage(tabId, {
      action: 'validate-image-synthid-result',
      imageUrl,
      status: 'unavailable',
      message: 'SynthID watermark check failed',
      error: String(err),
    });
  }
}
