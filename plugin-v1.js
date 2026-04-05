// Constants
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
const PLUGIN_URL = 'http://localhost:4200/plugin';
// const PLUGIN_URL = 'https://vrcloth.com/app/plugin';
const PLUGIN_ORIGIN = (function () {
  try {
    return new URL(PLUGIN_URL).origin;
  } catch (e) {
    return '';
  }
})();

/** Confirms the plugin tab’s Angular listener ran and accepted init_plugin (see PluginEmbedHostInitBridge). */
window.addEventListener('message', function (ev) {
  if (!PLUGIN_ORIGIN || ev.origin !== PLUGIN_ORIGIN) {
    return;
  }
  if (!ev.data || typeof ev.data !== 'object') {
    return;
  }
  if (ev.data.type === 'init_plugin_ack' && ev.data.ok) {
    console.info('[VRCloth plugin.js] plugin tab acknowledged init_plugin (listener OK)', ev.data);
  }
});

// Variables
let source_script;
let tab_reference;
let image_url;
let page_background;

function isTargetPage(url) {
  return PAGES.filter(page => url.includes(page.url))[0];
}

function isTargetImagePresent(imageSelector) {
  return document.querySelector(imageSelector);
}

function getTryNowButton(){
  let btn = document.createElement('button');
  btn.textContent = source_script.getAttribute('data-button-text') || 'Try Now Virtually';
  btn.style.cssText =
    'position:fixed;bottom:28px;right:28px;z-index:99997;padding:12px 18px;border-radius:10px;border:none;background:#0f172a;color:#fff;font:600 14px system-ui,-apple-system,sans-serif;cursor:pointer;box-shadow:0 4px 18px rgba(15,23,42,.35);';
  btn.addEventListener('click', async () => {
    // Inject and use html2canvas for snapshotting
    try {
      await loadHtml2Canvas();
      const base64Image = await htmlToCanvasImage();
      console.log('[VRCloth plugin.js] Snap captured base64:', base64Image);
      // Assign the snapshot to page_background so it can be passed to the plugin
      page_background = base64Image;
    } catch (err) {
      console.error('[VRCloth plugin.js] Error capturing snapshot:', err);
    }
    
    initPluginTab();
  });
  document.body.appendChild(btn);
}

function buildPluginOpenUrl() {
  try {
    var u = new URL(PLUGIN_URL);
    if (image_url) {
      u.searchParams.set('garment_image', image_url);
    }
    u.searchParams.set('url', window.location.href);
    if (page_background) {
      u.searchParams.set('page_background', page_background);
    }
    return u.toString();
  } catch (e) {
    return PLUGIN_URL;
  }
}

function initPluginTab(){
  // Do not pass noopener/noreferrer: the plugin page uses window.opener to verify postMessage source.
  tab_reference = window.open(buildPluginOpenUrl(), '_blank');

  setTimeout(() => {
    if (tab_reference) {
      sendDataToPluginWithRetry();
    }
  }, 500);
}

function sendDataToPlugin() {
  const payload = {
    garment_image: image_url,
    url: window.location.href,
    page_background: page_background,
  };
  console.log('[VRCloth plugin.js] postMessage init_plugin', payload);
  tab_reference.postMessage(
    {
      type: 'init_plugin',
      data: payload,
    },
    '*',
  );
}

/** Repeat postMessage if the plugin tab booted slowly and missed the first event. */
function sendDataToPluginWithRetry(attempt) {
  attempt = attempt || 0;
  sendDataToPlugin();
  if (attempt < 3) {
    setTimeout(function () {
      sendDataToPluginWithRetry(attempt + 1);
    }, 1500);
  }
}

function loadHtml2Canvas() {
  if (typeof html2canvas === 'function') {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load html2canvas'));
    document.body.appendChild(s);
  });
}

async function htmlToCanvasImage() {
  return html2canvas(document.body, {
    x: window.scrollX,
    y: window.scrollY,
    width: window.innerWidth,
    height: window.innerHeight,
    windowWidth: document.documentElement.scrollWidth,
    windowHeight: document.documentElement.scrollHeight,
    // Camera / cross-origin streams are tainted and cannot be cloned to canvas
    ignoreElements: (el) => el.tagName === 'VIDEO',
  }).then((canvas) => canvas.toDataURL());
}

async function main(){

  let page = isTargetPage(window.location.href);
  //Skip if not a target page
  if(!page){
    return;
  }

  let image = isTargetImagePresent(page.imageSelector);   
  //Skip if target image is not present
  if(!image){
    return;
  }

  image_url = image.src;

  source_script = document.currentScript || document.querySelector('script[src*="plugin.js"]');
  if(!source_script){
    return;
  }

  if(!tab_reference){
    getTryNowButton();
  }else{
    sendDataToPlugin();
  }
  
}


main();
