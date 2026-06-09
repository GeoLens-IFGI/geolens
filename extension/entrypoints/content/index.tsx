import './style.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import { createRoot, type Root } from 'react-dom/client';
import { App } from './App';
import {
  getInspection,
  setInspection,
  updateInspection,
} from './store';
import type { ExifState, MethodState } from './types';

export default defineContentScript({
  matches: ['<all_urls>'],
  // Bundle the component CSS (Tailwind + MapLibre) into the shadow root.
  cssInjectionMode: 'ui',

  async main(ctx) {
    const ui = await createShadowRootUi(ctx, {
      name: 'geolens-inspector',
      position: 'overlay',
      anchor: 'body',
      onMount(container) {
        const root = createRoot(container);
        root.render(<App />);
        return root;
      },
      onRemove(root: Root | undefined) {
        root?.unmount();
      },
    });
    ui.mount();

    injectImageHoverCursor();

    browser.runtime.onMessage.addListener((message) => {
      handleMessage(message);
    });
  },
});

// Swap the cursor to the magnifying-lens signifier whenever the user hovers an
// image, hinting that it can be inspected.
let cursorStyleInjected = false;
function injectImageHoverCursor() {
  if (cursorStyleInjected) return;
  cursorStyleInjected = true;

  const style = document.createElement('style');
  const cursorUrl = browser.runtime.getURL('/lens32.png');
  const hotspotX = 32 / 4;
  const hotspotY = 32 / 4;
  style.textContent = `
    img:hover {
      cursor: url("${cursorUrl}") ${hotspotX} ${hotspotY}, auto !important;
    }
  `;
  document.head.appendChild(style);
}

function handleMessage(message: any) {
  switch (message?.action) {
    case 'validate-image-start':
      startInspection(message.imageUrl);
      break;
    case 'validate-image-geocam-result':
      patchMethod('geocam', message);
      break;
    case 'validate-image-synthid-result':
      patchMethod('synthid', message);
      break;
    case 'validate-image-c2pa-result':
      patchMethod('c2pa', message);
      break;
    case 'validate-image-exif-result':
      patchExif(message);
      break;
  }
}

function startInspection(imageUrl: string) {
  const img = findImageByUrl(imageUrl);
  setInspection({
    imageUrl,
    imageAlt: img?.alt ?? '',
    position: computePosition(img),
    naturalWidth: img?.naturalWidth || undefined,
    naturalHeight: img?.naturalHeight || undefined,
    geocam: { status: 'loading' },
    synthid: { status: 'loading' },
    c2pa: { status: 'loading' },
    exif: { status: 'loading' },
  });
}

function patchMethod(key: 'geocam' | 'synthid' | 'c2pa', message: any) {
  const current = getInspection();
  if (!current || current.imageUrl !== message.imageUrl) return;
  const next: MethodState = {
    status: message.status,
    message: message.message,
    detail: message.detail,
    error: message.error,
    lat: message.lat,
    lng: message.lng,
  };
  updateInspection({ [key]: next });
}

function patchExif(message: any) {
  const current = getInspection();
  if (!current || current.imageUrl !== message.imageUrl) return;
  const exif: ExifState = {
    status: message.status,
    exif: message.exif,
    error: message.error,
  };
  updateInspection({
    exif,
    fileSize: message.fileSize ?? current.fileSize,
    format: message.format ?? current.format,
  });
}

// Which half of the viewport the source image sat on. Drives the side the icon
// rail appears on (icons go on the opposite side of the image).
function computePosition(img: HTMLImageElement | null): 'left' | 'right' {
  if (!img) return 'right';
  const rect = img.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  return centerX < window.innerWidth / 2 ? 'left' : 'right';
}

function findImageByUrl(url: string): HTMLImageElement | null {
  for (const img of document.querySelectorAll('img')) {
    if (img.currentSrc === url || img.src === url) return img;
  }
  return null;
}
