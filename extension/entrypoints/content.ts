export default defineContentScript({
  matches: ['<all_urls>'],

  main() {
    // JOB 1: Listen for messages from the background script.
    browser.runtime.onMessage.addListener((message) => {
      console.log('[content] message received:', message);
      if (message.action === 'validate-image-start') {
        handleValidateStart(message.imageUrl);
      } else if (message.action === 'validate-image-geolens-result') {
        handleGeoLensResult(message.imageUrl, message.status, message.message, message.error);
      } else if (message.action === 'validate-image-exif-result') {
        handleExifResult(message.imageUrl, message.status, message.exif, message.error);
      } else if (message.action === 'validate-image-synthid-result') {
        handleSynthIDResult(message.imageUrl, message.status, message.message, message.error);
      }
    });
  },
});

// ============================================================
// Helpers (live outside `main()` so they are easier to read)
// ============================================================

let styleInjected = false;
function injectSpinnerStyles() {
  if (styleInjected) return;
  styleInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    @keyframes geolens-spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
}

type GeoLensStatus = 'loading' | 'verified' | 'not-verified' | 'unavailable';

type ExifSummary = {
  camera?: string;
  lens?: string;
  takenAt?: string;
  dimensions?: string;
  exposure?: string;
  iso?: string;
  gps?: string;
};

type ExifStatus = 'loading' | 'available' | 'none' | 'unavailable';

type SynthIDStatus = 'loading' | 'verified' | 'not-verified' | 'unavailable';

type ImageCheckState = {
  geolens: {
    status: GeoLensStatus;
    message?: string;
    error?: string;
  };
  exif: {
    status: ExifStatus;
    exif?: ExifSummary;
    error?: string;
  };
  synthid: {
  status: SynthIDStatus;
  message?: string;
  error?: string;
  };
};

const imageStates = new Map<string, ImageCheckState>();

function handleValidateStart(imageUrl: string) {
  console.log('[content] handleValidateStart called with URL:', imageUrl);
  imageStates.set(imageUrl, {
    geolens: {
      status: 'loading',
    },
    exif: {
      status: 'loading',
    },
    synthid: { 
      status: 'loading',
    },
  });

  renderOverlay(imageUrl);
}

function handleGeoLensResult(imageUrl: string, status: GeoLensStatus, message?: string, error?: string) {
  const state = getImageState(imageUrl);
  state.geolens = {
    status,
    message,
    error,
  };

  renderOverlay(imageUrl);
}

function handleExifResult(imageUrl: string, status: ExifStatus, exif?: ExifSummary, error?: string) {
  const state = getImageState(imageUrl);
  state.exif = {
    status,
    exif,
    error,
  };

  renderOverlay(imageUrl);
}

function handleSynthIDResult(imageUrl: string, status: SynthIDStatus, message?: string, error?: string) {
  const state = getImageState(imageUrl);
  state.synthid = {
    status, 
    message, 
    error,
  };
  
  renderOverlay(imageUrl);
}

function findImageByUrl(url: string): HTMLImageElement | null {
  const allImages = document.querySelectorAll('img');
  for (const img of allImages) {
    if (img.currentSrc === url || img.src === url) return img;
  }
  return null;
}

function getImageState(imageUrl: string): ImageCheckState {
  const existing = imageStates.get(imageUrl);
  if (existing) return existing;

  const state: ImageCheckState = {
    geolens: { status: 'loading' },
    exif: { status: 'loading' },
    synthid: { status: 'loading' },
  };
  imageStates.set(imageUrl, state);
  return state;
}

function renderOverlay(imageUrl: string) {
  const image = findImageByUrl(imageUrl);
  if (!image) return;

  const parent = image.parentElement;
  if (!parent) return;

  parent.style.position = 'relative';

  const existing = parent.querySelectorAll('.geolens-ext-overlay');
  existing.forEach(e => e.remove());

  injectSpinnerStyles();

  const state = getImageState(imageUrl);
  const overlay = document.createElement('div');
  overlay.className = 'geolens-ext-overlay';
  overlay.style.position = 'absolute';
  overlay.style.left = '5px';
  overlay.style.right = '5px';
  overlay.style.bottom = '5px';
  overlay.style.background = 'rgba(17, 24, 39, 0.88)';
  overlay.style.color = 'white';
  overlay.style.padding = '10px 12px';
  overlay.style.fontSize = '12px';
  overlay.style.borderRadius = '6px';
  overlay.style.zIndex = '9999';
  overlay.style.pointerEvents = 'none';
  overlay.style.lineHeight = '1.35';
  overlay.style.boxSizing = 'border-box';
  overlay.style.backdropFilter = 'blur(4px)';
  overlay.style.maxHeight = '40%';
  overlay.style.overflow = 'auto';

  const title = document.createElement('div');
  title.textContent = 'GeoLens checks';
  title.style.fontWeight = '700';
  title.style.marginBottom = '8px';
  title.style.letterSpacing = '0.02em';
  overlay.appendChild(title);

  overlay.appendChild(renderSection('GeoLens', state.geolens, renderGeoLensContent));
  overlay.appendChild(renderSection('EXIF', state.exif, renderExifContent));
  overlay.appendChild(renderSection('SynthID', state.synthid, renderSynthIDContent));

  parent.appendChild(overlay);
}

function renderSection(
  label: string,
  statusInfo: { status: string; message?: string; error?: string; exif?: ExifSummary },
  renderContent: (statusInfo: { status: string; message?: string; error?: string; exif?: ExifSummary }) => DocumentFragment,
) {
  const section = document.createElement('div');
  section.style.background = 'rgba(255, 255, 255, 0.08)';
  section.style.borderRadius = '6px';
  section.style.padding = '8px 10px';

  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.alignItems = 'center';
  header.style.justifyContent = 'space-between';
  header.style.gap = '8px';
  header.style.marginBottom = '6px';

  const heading = document.createElement('div');
  heading.textContent = label;
  heading.style.fontWeight = '700';
  heading.style.fontSize = '13px';

  const badge = document.createElement('span');
  badge.textContent = describeStatus(statusInfo.status, label);
  badge.style.display = 'inline-flex';
  badge.style.alignItems = 'center';
  badge.style.padding = '2px 8px';
  badge.style.borderRadius = '999px';
  badge.style.fontSize = '11px';
  badge.style.fontWeight = '700';
  badge.style.background = getStatusColor(statusInfo.status);
  badge.style.color = 'white';

  header.appendChild(heading);
  header.appendChild(badge);
  section.appendChild(header);
  section.appendChild(renderContent(statusInfo));

  return section;
}

function renderGeoLensContent(statusInfo: { status: string; message?: string; error?: string }): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const text = document.createElement('div');

  if (statusInfo.status === 'loading') {
    text.textContent = 'Checking GeoLens service...';
  } else if (statusInfo.status === 'verified') {
    text.textContent = statusInfo.message ?? 'GeoLens verified this image.';
  } else if (statusInfo.status === 'not-verified') {
    text.textContent = statusInfo.message ?? 'GeoLens completed without a verification message.';
  } else {
    text.textContent = statusInfo.error ?? 'GeoLens service is unavailable.';
  }

  fragment.appendChild(text);
  return fragment;
}

function renderExifContent(statusInfo: { status: string; message?: string; error?: string; exif?: ExifSummary }): DocumentFragment {
  const fragment = document.createDocumentFragment();

  if (statusInfo.status === 'loading') {
    const text = document.createElement('div');
    text.textContent = 'Decoding EXIF metadata...';
    fragment.appendChild(text);
    return fragment;
  }

  if (statusInfo.status === 'unavailable') {
    const text = document.createElement('div');
    text.textContent = statusInfo.error ?? 'EXIF decoding is unavailable.';
    fragment.appendChild(text);
    return fragment;
  }

  if (statusInfo.status === 'none' || !statusInfo.exif) {
    const text = document.createElement('div');
    text.textContent = 'No EXIF metadata found.';
    fragment.appendChild(text);
    return fragment;
  }

  const rows = [
    ['Camera', statusInfo.exif.camera],
    ['Lens', statusInfo.exif.lens],
    ['Taken', statusInfo.exif.takenAt],
    ['Dimensions', statusInfo.exif.dimensions],
    ['Exposure', statusInfo.exif.exposure],
    ['ISO', statusInfo.exif.iso],
    ['GPS', statusInfo.exif.gps],
  ] as const;

  for (const [label, value] of rows) {
    if (!value) continue;
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '8px';

    const rowLabel = document.createElement('span');
    rowLabel.textContent = `${label}:`;
    rowLabel.style.minWidth = '74px';
    rowLabel.style.fontWeight = '600';
    rowLabel.style.opacity = '0.82';

    const rowValue = document.createElement('span');
    rowValue.textContent = value;
    rowValue.style.wordBreak = 'break-word';

    row.appendChild(rowLabel);
    row.appendChild(rowValue);
    fragment.appendChild(row);
  }

  if (!fragment.childNodes.length) {
    const text = document.createElement('div');
    text.textContent = 'No EXIF metadata found.';
    fragment.appendChild(text);
  }

  return fragment;
}

function renderSynthIDContent(statusInfo: { status: string; message?: string; error?: string }): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const text = document.createElement('div');
  if (statusInfo.status === 'loading') {
    text.textContent = 'Scanning for SynthID watermark...';
  } else if (statusInfo.status === 'verified') {
    text.textContent = statusInfo.message ?? 'No SynthID watermark detected.';
  } else if (statusInfo.status === 'not-verified') {
    text.textContent = statusInfo.message ?? 'SynthID watermark detected — possible AI-generated image.';
  } else {
    text.textContent = statusInfo.error ?? 'SynthID check unavailable.';
  }
  fragment.appendChild(text);
  return fragment;
}

function describeStatus(status: string, label: string): string {
  if (status === 'loading') return 'Loading';
  if (status === 'verified') return 'Verified';
  if (status === 'not-verified') return 'Done';
  if (status === 'available') return 'Available';
  if (status === 'none') return 'No metadata';
  if (status === 'unavailable') return `${label} unavailable`;
  return 'Unknown';
}

function getStatusColor(status: string): string {
  if (status === 'loading') return '#6b7280';
  if (status === 'verified') return '#15803d';
  if (status === 'not-verified') return '#0f766e';
  if (status === 'available') return '#2563eb';
  if (status === 'none') return '#92400e';
  if (status === 'unavailable') return '#b91c1c';
  return '#4b5563';
}
