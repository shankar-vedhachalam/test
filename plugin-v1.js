// ─── Constants ───────────────────────────────────────────────────────────────
const PAGES = [
  {
    url: 'https://shricreationstudio.com/products/',
    imageSelector: '#gallery-preview',
  },
  {
    url: 'http://127.0.0.1:8080/product-detail.html',
    imageSelector: '#mainProductImage',
  }
];

const PLUGIN_URL    = 'http://localhost:4200/plugin';
// const PLUGIN_URL = 'https://vrcloth.com/app/plugin';

const PLUGIN_ORIGIN = (function () {
  try { return new URL(PLUGIN_URL).origin; } catch (e) { return ''; }
})();

// ─── State ────────────────────────────────────────────────────────────────────
let source_script;
let tab_reference;
let image_url;
let page_background;

// ─── Plugin tab ACK listener ──────────────────────────────────────────────────
window.addEventListener('message', function (ev) {
  if (!PLUGIN_ORIGIN || ev.origin !== PLUGIN_ORIGIN) return;
  if (!ev.data || typeof ev.data !== 'object') return;
  if (ev.data.type === 'init_plugin_ack' && ev.data.ok) {
    console.info('[VRCloth plugin.js] plugin tab acknowledged init_plugin ✅', ev.data);
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isTargetPage(url) {
  return PAGES.find(page => url.includes(page.url));
}

function isTargetImagePresent(imageSelector) {
  return document.querySelector(imageSelector);
}

// ─── Better product image detection ──────────────────────────────────────────
// Falls back through multiple common selectors if the configured one fails
function detectProductImage(configuredSelector) {
  // 1. Try the configured selector first
  const configured = document.querySelector(configuredSelector);
  if (configured && configured.src) return configured;

  // 2. Fallback selectors — common e-commerce patterns
  const FALLBACK_SELECTORS = [
    '[data-main-image]',
    '.product__image--featured img',
    '.product-single__photo img',
    '.woocommerce-product-gallery__image img',
    '.product-image-main img',
    '#product-featured-image',
    '.main-product-image img',
    '[id*="main"][id*="image"] img',
    '[id*="main"][id*="photo"] img',
    '[class*="main-image"] img',
    '[class*="product-image"]:not([class*="thumb"]) img',
    'img[itemprop="image"]',
    'img[data-zoom-image]',
    'img[data-large_image]',
  ];

  for (const sel of FALLBACK_SELECTORS) {
    const el = document.querySelector(sel);
    if (el && el.src && !el.src.includes('placeholder')) return el;
  }

  // 3. Last resort — largest visible image on page (likely the product)
  const allImgs = Array.from(document.querySelectorAll('img'))
    .filter(img => img.src && img.naturalWidth > 100 && img.offsetParent !== null)
    .sort((a, b) => (b.naturalWidth * b.naturalHeight) - (a.naturalWidth * a.naturalHeight));

  return allImgs[0] || null;
}

// ─── Try Now Button ───────────────────────────────────────────────────────────
function getTryNowButton() {
  // Remove existing if re-injected
  const existing = document.getElementById('vc-try-now-btn');
  if (existing) existing.remove();

  const btn = document.createElement('button');
  btn.id = 'vc-try-now-btn';
  btn.textContent = source_script.getAttribute('data-button-text') || '✨ Try Virtually';
  btn.style.cssText = [
    'position:fixed',
    'bottom:28px',
    'right:28px',
    'z-index:99997',
    'padding:12px 22px',
    'border-radius:10px',
    'border:none',
    'background:#0f172a',
    'color:#fff',
    'font:600 14px system-ui,-apple-system,sans-serif',
    'cursor:pointer',
    'box-shadow:0 4px 18px rgba(15,23,42,.35)',
    'transition:transform .2s,box-shadow .2s,background .2s',
    'letter-spacing:.2px',
  ].join(';');

  btn.addEventListener('mouseenter', () => {
    btn.style.transform    = 'translateY(-2px)';
    btn.style.boxShadow    = '0 8px 28px rgba(15,23,42,.45)';
    btn.style.background   = '#1e293b';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.transform    = '';
    btn.style.boxShadow    = '0 4px 18px rgba(15,23,42,.35)';
    btn.style.background   = '#0f172a';
  });

  btn.addEventListener('click', async () => {
    const originalText = btn.textContent;
    btn.textContent    = '⏳ Capturing...';
    btn.disabled       = true;

    try {
      // Pure JS capture — no external scripts, fully CSP-safe
      page_background = await capturePagePureJS();
      console.log('[VRCloth plugin.js] ✅ Snapshot captured');
    } catch (err) {
      console.error('[VRCloth plugin.js] Snapshot failed:', err);
      page_background = null; // proceed without background
    }

    btn.textContent = originalText;
    btn.disabled    = false;

    initPluginTab();
  });

  document.body.appendChild(btn);
}

// ─── Pure JS page capture — NO libraries, NO canvas taint possible ────────────
// Strategy: inline ALL images as base64 FIRST, then build SVG blob data URL.
// Never calls canvas.toDataURL() → SecurityError impossible.
async function capturePagePureJS() {
  const width   = document.documentElement.scrollWidth;
  const height  = document.documentElement.scrollHeight;
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;

  // Step 1: Deep-clone body BEFORE touching live DOM
  const bodyClone = document.body.cloneNode(true);

  // Step 2: Inline all <img> src as base64 in the CLONE (never touches live page)
  await inlineImagesInClone(bodyClone);

  // Step 3: Inline all computed styles into clone elements
  const liveEls   = document.body.getElementsByTagName('*');
  const cloneEls  = bodyClone.getElementsByTagName('*');
  for (let i = 0; i < liveEls.length; i++) {
    if (!cloneEls[i]) continue;
    const computed = window.getComputedStyle(liveEls[i]);
    let styleStr   = '';
    for (let j = 0; j < computed.length; j++) {
      const prop = computed[j];
      styleStr  += `${prop}:${computed.getPropertyValue(prop)};`;
    }
    cloneEls[i].setAttribute('style', styleStr);
    // Strip scripts from snapshot
    if (cloneEls[i].tagName === 'SCRIPT') cloneEls[i].remove();
  }

  // Step 4: Serialize clone → SVG foreignObject
  const serialized = new XMLSerializer().serializeToString(bodyClone);
  const svgStr     = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`,
    `<foreignObject width="100%" height="100%" x="-${scrollX}" y="-${scrollY}">`,
    `<div xmlns="http://www.w3.org/1999/xhtml">${serialized}</div>`,
    `</foreignObject></svg>`
  ].join('');

  // Step 5: Return as SVG data URL — no Canvas, no toDataURL(), no SecurityError
  const b64svg = btoa(unescape(encodeURIComponent(svgStr)));
  return 'data:image/svg+xml;base64,' + b64svg;
}

// ─── Inline all <img> in a DOM clone as base64 ───────────────────────────────
// Works on the CLONE only — never taints the live page canvas context
async function inlineImagesInClone(rootEl) {
  const imgs  = Array.from(rootEl.querySelectorAll('img'));
  const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

  const tasks = imgs.map(async (img) => {
    const src = img.getAttribute('src');
    if (!src || src.startsWith('data:')) return; // already inline — skip

    try {
      // Try CORS fetch first
      const res  = await fetchWithTimeout(src, { mode: 'cors', cache: 'force-cache' }, 4000);
      const blob = await res.blob();
      img.src    = await blobToBase64(blob);
    } catch (corsErr) {
      try {
        // Try no-cors fetch (gets opaque response — use as blob anyway)
        const res  = await fetchWithTimeout(src, { mode: 'no-cors', cache: 'force-cache' }, 4000);
        const blob = await res.blob();
        if (blob.size > 0) {
          img.src = await blobToBase64(blob);
        } else {
          img.src = BLANK; // opaque empty — replace with blank
        }
      } catch (e) {
        img.src = BLANK; // totally unreachable — replace with blank
      }
    }
  });

  // Run all in parallel, max 5s total timeout
  await Promise.race([
    Promise.allSettled(tasks),
    new Promise(r => setTimeout(r, 5000)),
  ]);
}

// ─── Fetch with timeout ───────────────────────────────────────────────────────
function fetchWithTimeout(url, options, ms) {
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

// ─── Blob → base64 data URL ───────────────────────────────────────────────────
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader  = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ─── Plugin tab management ────────────────────────────────────────────────────
function buildPluginOpenUrl() {
  try {
    const u = new URL(PLUGIN_URL);
    if (image_url)       u.searchParams.set('garment_image',   image_url);
    if (page_background) u.searchParams.set('page_background', page_background);
    u.searchParams.set('url', window.location.href);
    return u.toString();
  } catch (e) {
    return PLUGIN_URL;
  }
}

function initPluginTab() {
  // Do NOT pass noopener/noreferrer — plugin uses window.opener for postMessage
  tab_reference = window.open(buildPluginOpenUrl(), '_blank');

  if (!tab_reference) {
    console.warn('[VRCloth plugin.js] Popup blocked. Ask user to allow popups.');
    return;
  }

  // Retry postMessage until plugin tab acknowledges
  setTimeout(() => sendDataToPluginWithRetry(), 600);
}

function sendDataToPlugin() {
  if (!tab_reference || tab_reference.closed) return;
  const payload = {
    garment_image:   image_url,
    url:             window.location.href,
    page_background: page_background,
  };
  console.log('[VRCloth plugin.js] postMessage → init_plugin', payload);
  tab_reference.postMessage({ type: 'init_plugin', data: payload }, '*');
}

function sendDataToPluginWithRetry(attempt) {
  attempt = attempt || 0;
  sendDataToPlugin();
  if (attempt < 4) {
    setTimeout(() => sendDataToPluginWithRetry(attempt + 1), 1500);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  // 1. Check if current page is a target page
  const page = isTargetPage(window.location.href);
  if (!page) return;

  // 2. Detect product image (with fallbacks)
  const image = detectProductImage(page.imageSelector);
  if (!image) {
    console.warn('[VRCloth plugin.js] No product image found on this page.');
    return;
  }

  image_url = image.src;
  console.log('[VRCloth plugin.js] Product image detected:', image_url);

  // 3. Get source script reference
  source_script = document.currentScript
    || document.querySelector('script[src*="plugin.js"]');
  if (!source_script) return;

  // 4. Inject or update the Try Now button
  if (!tab_reference) {
    getTryNowButton();
  } else {
    sendDataToPlugin();
  }
}

main();