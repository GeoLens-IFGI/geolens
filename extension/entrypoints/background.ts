import * as exifr from 'exifr';

export default defineBackground(() => {
  browser.contextMenus.create({
    id: 'validate-image',
    title: 'Validate image',
    contexts: ['image'],
  });

  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    console.log('[background] menu click received:', info, tab);

    if (info.menuItemId !== 'validate-image') return;
    if (!tab?.id) return;

    const imageUrl = info.srcUrl ?? '';
    if (!imageUrl) {
      browser.tabs.sendMessage(tab.id, {
        action: 'validate-image-geolens-result',
        imageUrl,
        status: 'unavailable',
        error: 'No image URL was available for GeoLens validation.',
      });
      browser.tabs.sendMessage(tab.id, {
        action: 'validate-image-exif-result',
        imageUrl,
        status: 'unavailable',
        error: 'No image URL was available for EXIF decoding.',
      });
      browser.tabs.sendMessage(tab.id, {
       action: 'validate-image-google-ai-result',
       imageUrl,
       status: 'unavailable',
       error: 'No image URL was available.',
      });
      return result;
    }

    browser.tabs.sendMessage(tab.id, {
      action: 'validate-image-start',
      imageUrl,
    });

    try {
      const imgRes = await fetch(imageUrl);
      const blob = await imgRes.blob();

      void runGeoLensCheck(tab.id, imageUrl, blob);
      void runExifCheck(tab.id, imageUrl, blob);
      void runGoogleAICheck(tab.id, imageUrl, blob);
    } catch (error) {
      console.error('[background] error starting image checks:', error);
      browser.tabs.sendMessage(tab.id, {
        action: 'validate-image-geolens-result',
        imageUrl,
        status: 'unavailable',
        error: 'Unable to load image for GeoLens validation.',
      });
      browser.tabs.sendMessage(tab.id, {
        action: 'validate-image-exif-result',
        imageUrl,
        status: 'unavailable',
        error: 'Unable to load image for EXIF decoding.',
      });
      browser.tabs.sendMessage(tab.id, {
        action: 'validate-image-google-ai-result',
        imageUrl,
        status: 'unavailable',
        error: 'Unable to load image.',
     });
    }
  });
});

type ExifSummary = {
  camera?: string;
  lens?: string;
  takenAt?: string;
  dimensions?: string;
  exposure?: string;
  iso?: string;
  gps?: string;
};

type GeoLensResult = {
  status: 'verified' | 'not-verified' | 'unavailable';
  message?: string;
  error?: string;
};

type ExifResult = {
  status: 'available' | 'none' | 'unavailable';
  exif?: ExifSummary;
  error?: string;
};

type GoogleAIResult = {
  status: 'verified' | 'not-verified' | 'unavailable';
  message?: string;
  confidence?: 'high' | 'medium' | 'low';
  detail?: string;
};

async function runGeoLensCheck(tabId: number, imageUrl: string, blob: Blob) {
  try {
    const formData = new FormData();
    formData.append('file', blob, 'image.png');

    const apiRes = await fetch('http://localhost:8000/verify-image/', {
      method: 'POST',
      body: formData,
    });

    let result: GeoLensResult;

    if (!apiRes.ok) {
      result = {
        status: 'unavailable',
        error: `GeoLens service returned HTTP ${apiRes.status}.`,
      };
    } else {
      const data = await apiRes.json();
      if (data.status === 'verified') {
        result = {
          status: 'verified',
          message: data.decoded_message,
        };
      } else {
        result = {
          status: 'not-verified',
          message: data.decoded_message ?? 'GeoLens validation completed, but no decoded message was returned.',
        };
      }
    }

    browser.tabs.sendMessage(tabId, {
      action: 'validate-image-geolens-result',
      imageUrl,
      ...result,
    });
  } catch (error) {
    console.error('[background] GeoLens validation failed:', error);
    browser.tabs.sendMessage(tabId, {
      action: 'validate-image-geolens-result',
      imageUrl,
      status: 'unavailable',
      error: 'GeoLens validation service is unavailable.',
    });
  }
}

async function runExifCheck(tabId: number, imageUrl: string, blob: Blob) {
  try {
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

async function runGoogleAICheck(tabId: number, imageUrl: string, blob: Blob) {
  try {
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
      throw new Error('Missing googleai result from backend');
    }

    browser.tabs.sendMessage(tabId, {
      action: 'validate-image-google-ai-result',
      imageUrl,
      status: result.status,
      message: result.message,
      error: result.error,
    });
  } catch (err) {
    browser.tabs.sendMessage(tabId, {
      action: 'validate-image-google-ai-result',
      imageUrl,
      status: 'unavailable',
      message: 'Google AI provenance check failed',
      error: String(err),
});
}
}
