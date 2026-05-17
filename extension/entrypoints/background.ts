import * as exifr from 'exifr';
import { registry } from '../core/registry';

// Loading this module triggers the adapter's
// self-registration with the regristry (side effect).
import '../validators/geocam/adapter';

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
        action: 'validate-image-geolens-result',
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
      return;
    }

    browser.tabs.sendMessage(tab.id, {
      action: 'validate-image-start',
      imageUrl,
    });

    // Run both checks in parallel.
    void runGeoCamCheck(tab.id, imageUrl);
    void runExifCheck(tab.id, imageUrl);
  });
});

// GeoCam dispatched via registry.
async function runGeoCamCheck(tabId: number, imageURL: string) {
  const result = await registry.validateWith('geocam', imageURL);

  if (!result) {
    // Just in case no validator named 'geocam' was registered.
    browser.tabs.sendMessage(tabId, {
      action: 'validate-image-geolens-result',
      imageURL,
      status: 'unavailable',
      error: 'GeoCam validator is not registered.',
    });
    return;
  }

  // Translate registry's ValidationResult into wire format
  // which the content script understands.
  browser.tabs.sendMessage(tabId, {
    action: 'validate-image-geolens-result',
    imageURL,
    status: result.status,
    message: result.message,
    error: result.error,
  });
}

// EXIF: remains unchanged here. Consider refactoring into
// an 'insepctor' adaptor in the future.

type ExifSummary = {
  camera?: string;
  lens?: string;
  takenAt?: string;
  dimensions?: string;
  exposure?: string;
  iso?: string;
  gps?: string;
};

type ExifResult = {
  status: 'available' | 'none' | 'unavailable';
  exif?: ExifSummary;
  error?: string;
};

async function runExifCheck(tabId: number, imageUrl: string) {
  try {
    // EXIF still does its own fetch here, since the adapter now owns
    // GeoCam's fetch and there's no shared pre-fetched blob anymore.
    const imgRes = await fetch(imageUrl);
    const blob = await imgRes.blob();

    const exif = await parseExif(blob);
    const result: ExifResult = exif
      ? { status: 'available', exif }
      : { status: 'none' };

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
    const exposureParts = [data.ExposureTime, data.FNumber ? `f/${data.FNumber}` : null].filter(Boolean);
    const gps = formatGps(data.latitude, data.longitude, data.altitude);

    return {
      camera: cameraParts.length ? cameraParts.join(' ') : undefined,
      lens: data.LensModel ?? data.LensSpecification ?? undefined,
      takenAt: data.DateTimeOriginal ?? data.CreateDate ?? data.ModifyDate ?? undefined,
      dimensions: data.ExifImageWidth && data.ExifImageHeight ? `${data.ExifImageWidth} × ${data.ExifImageHeight}` : undefined,
      exposure: exposureParts.length ? exposureParts.join(' · ') : undefined,
      iso: data.ISO ? `ISO ${data.ISO}` : undefined,
      gps,
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