(function () {
    const script =
      document.currentScript || document.querySelector('script[src*="plugin.js"]');
    /** Per-site URL substring + product image selector (queried on the opener page, not in the iframe). */
    const patternsData = [
      {
        url: 'https://shricreationstudio.com/products/',
        imageSelector: '#gallery-preview',
      },
    ];

    const iframeSrc = 'https://vrcloth.com/app/assets/html/plugin.html'//(script && script.getAttribute('data-iframe-src')) || '';
    // const iframeSrc = 'http://localhost:4200/assets/html/plugin.html';
    const btnText =
      (script && script.getAttribute('data-button-text')) || 'Open in new tab';
    const HOST_ID = 'ruffle-parent-iframe-host';
    const MSG_TYPE = 'ruffle-parent-iframe-open';
    const POPUP_HANDSHAKE = 'vc-plugin-popup-handshake';
    const POPUP_URL = 'vc-plugin-popup-url';
    const POPUP_PARENT_HANDSHAKE = 'vc-plugin-popup-parent-handshake';
    const POPUP_CLOSED = 'vc-plugin-popup-closed';
    const POPUP_SCREENSHOT = 'vc-plugin-popup-screenshot';

    function normalizePatternsData(arr) {
      if (!Array.isArray(arr)) return [];
      var out = [];
      var i;
      for (i = 0; i < arr.length; i++) {
        var p = arr[i];
        if (!p || typeof p.url !== 'string') continue;
        var u = p.url.trim();
        if (!u) continue;
        var sel = p.imageSelector != null ? String(p.imageSelector).trim() : '';
        out.push({ url: u, imageSelector: sel });
      }
      return out;
    }

    var patternsDataNorm = normalizePatternsData(patternsData);

    function patternUrlsForButton() {
      var urls = [];
      var i;
      for (i = 0; i < patternsDataNorm.length; i++) {
        urls.push(patternsDataNorm[i].url);
      }
      var extra = (script && script.getAttribute('data-url-patterns')) || '';
      var parts = extra.split(',');
      for (i = 0; i < parts.length; i++) {
        var t = parts[i].trim();
        if (t) urls.push(t);
      }
      return urls;
    }

    /** Prefer matching row in patternsData; else data-image-selector on this script. */
    function getActiveImageSelectorForHref(href) {
      var h = href || '';
      var i;
      for (i = 0; i < patternsDataNorm.length; i++) {
        var p = patternsDataNorm[i];
        if (p.imageSelector && h.indexOf(p.url) !== -1) {
          return p.imageSelector;
        }
      }
      return (script && script.getAttribute('data-image-selector')) || '';
    }

    function resolveImageUrlFromElement(el) {
      if (!el || el.nodeType !== 1) return '';
      var tag = el.tagName ? el.tagName.toUpperCase() : '';
      if (tag === 'IMG') {
        var fromSrcset = '';
        var ss = typeof el.getAttribute === 'function' ? el.getAttribute('srcset') : '';
        if (ss) {
          var first = ss.split(',')[0];
          if (first) {
            fromSrcset = first.trim().split(/\s+/)[0] || '';
          }
        }
        return el.currentSrc || el.src || fromSrcset || '';
      }
      if (tag === 'PICTURE') {
        var im = el.querySelector('img');
        return im ? resolveImageUrlFromElement(im) : '';
      }
      if (tag === 'SOURCE') {
        return el.src || (typeof el.getAttribute === 'function' ? el.getAttribute('srcset') || '' : '');
      }
      var innerImg = el.querySelector && el.querySelector('img');
      if (innerImg) {
        return resolveImageUrlFromElement(innerImg);
      }
      if (typeof el.getAttribute === 'function') {
        var lazy =
          el.getAttribute('data-src') ||
          el.getAttribute('data-lazy-src') ||
          el.getAttribute('data-original') ||
          el.getAttribute('data-zoom-src');
        if (lazy) {
          return lazy;
        }
      }
      return '';
    }

    function resolveProductImageUrlFromSelector(sel) {
      if (!sel || typeof sel !== 'string') return '';
      try {
        var el = document.querySelector(sel.trim());
        if (!el) return '';
        return resolveImageUrlFromElement(el) || '';
      } catch (e) {
        return '';
      }
    }


    var html2canvasLoadQueue = null;
    /** Clears prior tab session (poll + load listener) before a new open / refocus. */
    var vcPluginTabCleanup = null;

    function makePluginTabTargetName(url) {
      try {
        var u = new URL(url, window.location.href);
        var h = (u.hostname + '_' + u.pathname).replace(/[^a-zA-Z0-9_]/g, '_').replace(/_+/g, '_');
        h = h.slice(0, 48);
        return 'vcplg_' + (h || 'tab');
      } catch (e) {
        return 'vcplg_tab';
      }
    }

    function loadHtml2Canvas(cb) {
      if (typeof window.html2canvas === 'function') {
        cb(window.html2canvas);
        return;
      }
      if (html2canvasLoadQueue) {
        html2canvasLoadQueue.push(cb);
        return;
      }
      html2canvasLoadQueue = [cb];
      var s = document.createElement('script');
      s.async = true;
      s.src =
        (script && script.getAttribute('data-html2canvas-src')) ||
        'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      s.onload = function () {
        var q = html2canvasLoadQueue;
        html2canvasLoadQueue = null;
        var h2c = window.html2canvas;
        if (typeof h2c !== 'function') {
          q.forEach(function (fn) {
            fn(null);
          });
          return;
        }
        q.forEach(function (fn) {
          fn(h2c);
        });
      };
      s.onerror = function () {
        var q = html2canvasLoadQueue;
        html2canvasLoadQueue = null;
        q.forEach(function (fn) {
          fn(null);
        });
      };
      (document.head || document.documentElement).appendChild(s);
    }

    function getScreenshotRootElement() {
      try {
        if (window.top && window.top.document && window.top.document.documentElement) {
          return window.top.document.documentElement;
        }
      } catch (e) { /* cross-origin top */ }
      return document.documentElement;
    }

    function getScreenshotScroll() {
      var sx = 0;
      var sy = 0;
      try {
        sx = window.top.scrollX || window.top.pageXOffset || 0;
        sy = window.top.scrollY || window.top.pageYOffset || 0;
      } catch (e) {
        sx = window.scrollX || window.pageXOffset || 0;
        sy = window.scrollY || window.pageYOffset || 0;
      }
      return { sx: sx, sy: sy };
    }

    /** Viewport of the window we capture (usually top), for visible-area screenshots. */
    function getCaptureViewport() {
      try {
        var w = window.top;
        var d = w.document.documentElement;
        var vv = w.visualViewport;
        var iw = (vv && vv.width) || w.innerWidth || d.clientWidth || 800;
        var ih = (vv && vv.height) || w.innerHeight || d.clientHeight || 600;
        return {
          w: iw,
          h: ih,
          sx: w.scrollX || w.pageXOffset || 0,
          sy: w.scrollY || w.pageYOffset || 0,
        };
      } catch (e) {
        var d2 = document.documentElement;
        var vv2 = window.visualViewport;
        return {
          w: (vv2 && vv2.width) || window.innerWidth || d2.clientWidth || 800,
          h: (vv2 && vv2.height) || window.innerHeight || d2.clientHeight || 600,
          sx: window.scrollX || window.pageXOffset || 0,
          sy: window.scrollY || window.pageYOffset || 0,
        };
      }
    }

    function isImgInViewport(im, vw, vh) {
      try {
        var r = im.getBoundingClientRect();
        var pad = 80;
        return (
          r.bottom >= -pad &&
          r.top <= vh + pad &&
          r.right >= -pad &&
          r.left <= vw + pad
        );
      } catch (e) {
        return true;
      }
    }

    function isLikelyLazyPlaceholderSrc(src) {
      var s = (src || '').trim();
      if (!s) return true;
      if (/^data:image\/svg/i.test(s)) return true;
      if (/^data:image\/gif;base64,R0lGOD/i.test(s)) return true;
      if (/^data:image\//i.test(s) && s.length < 600) return true;
      return false;
    }

    function shouldIgnoreScreenshotNode(node) {
      if (!node || typeof node.getAttribute !== 'function') return false;
      if (node.getAttribute('data-vc-screenshot-ignore') != null) return true;
      if (node.id === 'ruffle-parent-iframe-trigger') return true;
      var sel = (script && script.getAttribute('data-screenshot-ignore-selector')) || '';
      if (!sel || !node.matches) return false;
      var parts = sel.split(',');
      var i;
      for (i = 0; i < parts.length; i++) {
        var p = parts[i].trim();
        if (!p) continue;
        try {
          if (node.matches(p)) return true;
        } catch (e) { /* noop */ }
      }
      return false;
    }

    /**
     * @param aggressiveClone — if true (html2canvas clone only), always apply data-src over src so full images render.
     */
    function upgradeImgForScreenshot(im, aggressiveClone) {
      try {
        im.removeAttribute('loading');
      } catch (e0) { /* noop */ }
      var cur = (im.getAttribute('src') || '').trim();
      var hiRaw =
        im.getAttribute('data-src') ||
        im.getAttribute('data-lazy-src') ||
        im.getAttribute('data-original') ||
        im.getAttribute('data-zoom-image') ||
        im.getAttribute('data-full-url') ||
        im.getAttribute('data-src-retina');
      var hit = (hiRaw || '').trim();
      var loadingLazy = (im.getAttribute('loading') || '').toLowerCase() === 'lazy';
      var useHi =
        !!hit &&
        (aggressiveClone ||
          !cur ||
          isLikelyLazyPlaceholderSrc(cur) ||
          loadingLazy ||
          (cur !== hit && /thumb|placeholder|spacer|pixel|1x1|blank/i.test(cur)));
      if (useHi) {
        im.setAttribute('src', hit);
      }
      var dss =
        im.getAttribute('data-srcset') ||
        im.getAttribute('data-lazy-srcset') ||
        im.getAttribute('data-original-set');
      if (dss) {
        if (aggressiveClone || !im.getAttribute('srcset')) {
          im.setAttribute('srcset', dss.trim());
        }
      }
    }

    function upgradePictureSourcesInRoot(root) {
      try {
        var sources = root.querySelectorAll('picture source[data-srcset]');
        var i;
        for (i = 0; i < sources.length; i++) {
          var so = sources[i];
          var ds = so.getAttribute('data-srcset');
          if (ds && !so.getAttribute('srcset')) {
            so.setAttribute('srcset', ds.trim());
          }
        }
      } catch (e) { /* noop */ }
    }

    /**
     * Live DOM: promote lazy attrs before capture (no explicit wait for load).
     * `imageFilter(im)` — if provided, only those images (e.g. visible viewport). Else all imgs + picture sources.
     * Disable with data-screenshot-hydrate-live="false" on the plugin script.
     */
    function hydrateLiveImagesForCapture(root, imageFilter) {
      try {
        var imgs = Array.prototype.slice.call(root.querySelectorAll('img'));
        if (typeof imageFilter === 'function') {
          imgs = imgs.filter(imageFilter);
        }
        var i;
        for (i = 0; i < imgs.length; i++) {
          upgradeImgForScreenshot(imgs[i], false);
        }
        upgradePictureSourcesInRoot(root);
      } catch (e) { /* noop */ }
    }

    /**
     * html2canvas clone: same hints so anything missed on live still resolves in the clone.
     */
    function screenshotOnClone(clonedDoc) {
      try {
        var imgs = clonedDoc.querySelectorAll('img');
        var i;
        for (i = 0; i < imgs.length; i++) {
          upgradeImgForScreenshot(imgs[i]);
        }
        upgradePictureSourcesInRoot(clonedDoc);
      } catch (e) { /* noop */ }
    }

    function captureOpenerPageAsJpegDataUrl(done) {
      loadHtml2Canvas(function (h2c) {
        if (!h2c) {
          done(null);
          return;
        }
        var el = getScreenshotRootElement();
        var fullPage = script && script.getAttribute('data-screenshot-mode') === 'full';
        var vp = getCaptureViewport();
        var visibleImgFilter = function (im) {
          return isImgInViewport(im, vp.w, vp.h);
        };
        if (!script || script.getAttribute('data-screenshot-hydrate-live') !== 'false') {
          hydrateLiveImagesForCapture(el, fullPage ? null : visibleImgFilter);
        }
        setTimeout(function () {
          requestAnimationFrame(function () {
            requestAnimationFrame(function () {
              var scroll = getScreenshotScroll();
              var scale;
              var h2cOpts = {
                useCORS: true,
                allowTaint: true,
                logging: false,
                imageTimeout: 20000,
                removeContainer: false,
                ignoreElements: shouldIgnoreScreenshotNode,
                onclone: function (clonedDoc, _el) {
                  screenshotOnClone(clonedDoc);
                },
              };
              if (fullPage) {
                var sw = Math.max(el.scrollWidth || 0, vp.w || 800);
                scale = Math.min(0.42, 1280 / sw);
                h2cOpts.scale = scale;
                h2cOpts.scrollX = -scroll.sx;
                h2cOpts.scrollY = -scroll.sy;
                h2cOpts.windowWidth = el.scrollWidth;
                h2cOpts.windowHeight = el.scrollHeight;
              } else {
                // documentElement uses parseDocumentSize() in html2canvas, which defaults the
                // canvas to full scrollWidth/scrollHeight; windowWidth/windowHeight only size the
                // clone iframe — so we must set width/height to capture the visible viewport only.
                var vw = Math.ceil(vp.w || 800);
                var vh = Math.ceil(vp.h || 600);
                scale = Math.min(0.42, 1280 / vw);
                h2cOpts.scale = scale;
                h2cOpts.scrollX = -vp.sx;
                h2cOpts.scrollY = -vp.sy;
                h2cOpts.windowWidth = vw;
                h2cOpts.windowHeight = vh;
                h2cOpts.width = vw;
                h2cOpts.height = vh;
              }
              h2c(el, h2cOpts)
                .then(function (canvas) {
                  var sent = false;
                  var blobTimer;
                  function deliver(p) {
                    if (sent) return;
                    sent = true;
                    if (blobTimer != null) {
                      clearTimeout(blobTimer);
                    }
                    done(p);
                  }
                  function fallbackDataUrl() {
                    if (sent) return;
                    try {
                      var d = canvas.toDataURL('image/jpeg', 0.4);
                      if (d.length > 2500000) {
                        d = canvas.toDataURL('image/jpeg', 0.26);
                      }
                      if (d.length > 8000000) {
                        d = canvas.toDataURL('image/jpeg', 0.18);
                      }
                      deliver({ imageDataUrl: d });
                    } catch (e2) {
                      deliver(null);
                    }
                  }
                  blobTimer = setTimeout(fallbackDataUrl, 4000);
                  try {
                    canvas.toBlob(
                      function (blob) {
                        if (blob && blob.size > 80) {
                          deliver({ imageBlob: blob });
                          return;
                        }
                        fallbackDataUrl();
                      },
                      'image/jpeg',
                      0.4
                    );
                  } catch (e) {
                    fallbackDataUrl();
                  }
                })
                .catch(function () {
                  done(null);
                });
            });
          });
        }, 220);
      });
    }

    var patternUrlList = patternUrlsForButton();

    /**
     * Host notifications (handshake, url, closed). Always targetOrigin '*' so delivery is reliable;
     * validate event.origin in the parent listener. data-post-message-origin is unused here on purpose.
     */
    function notifyHost(data) {
      try {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage(data, '*');
        } else {
          window.postMessage(data, '*');
        }
      } catch (e) { /* noop */ }
    }

    /**
     * @returns {function} cleanup — clearInterval + remove load listener (call before next session).
     */
    function attachPopupMessaging(popupWin, initialSrc, sessionId, productImageUrl) {
      var lastUrl = initialSrc;

      function readPopupUrl() {
        try {
          if (!popupWin || popupWin.closed) return null;
          return popupWin.location.href;
        } catch (err) {
          return null;
        }
      }

      /** Always use '*' toward the popup so delivery works during redirects / transient origins. */
      function postRawToPopup(payload) {
        try {
          if (!popupWin || popupWin.closed) return;
          popupWin.postMessage(payload, '*');
        } catch (e) { /* noop */ }
      }

      function postToPopup(phase) {
        var current = readPopupUrl();
        var url = current || lastUrl;
        var msg = {
          type: POPUP_PARENT_HANDSHAKE,
          source: 'vc-plugin',
          sessionId: sessionId,
          phase: phase,
          /** Resolved location when same-origin; else last known / initial. */
          url: url,
          /** Always the URL passed to window.open (stable for the session). */
          initialUrl: initialSrc,
        };
        if (phase === 'open') {
          try {
            msg.openerUrl = window.location.href;
          } catch (e) { /* noop */ }
        }
        if (productImageUrl && typeof productImageUrl === 'string' && productImageUrl.trim()) {
          msg.productImageUrl = productImageUrl.trim();
        }
        postRawToPopup(msg);
      }

      function emitHandshake(phase, urlHint) {
        var u = urlHint != null ? urlHint : readPopupUrl() || lastUrl;
        var known = phase === 'closed' ? false : readPopupUrl() != null || phase === 'open';
        notifyHost({
          type: POPUP_HANDSHAKE,
          source: 'vc-plugin',
          sessionId: sessionId,
          phase: phase,
          url: u,
          urlKnown: known,
        });
      }

      function emitUrl(url) {
        if (!url) return;
        notifyHost({
          type: POPUP_URL,
          source: 'vc-plugin',
          sessionId: sessionId,
          url: url,
        });
      }

      function postUrlToPopup(u) {
        if (!u) return;
        postRawToPopup({
          type: POPUP_URL,
          source: 'vc-plugin',
          sessionId: sessionId,
          url: u,
        });
      }

      function pingOpenToPopup() {
        postToPopup('open');
        postUrlToPopup(initialSrc);
      }

      var screenshotSent = false;
      function sendScreenshotToPopup(payload) {
        if (!payload || screenshotSent) return;
        var msg = {
          type: POPUP_SCREENSHOT,
          source: 'vc-plugin',
          sessionId: sessionId,
        };
        if (payload.imageBlob instanceof Blob) {
          msg.imageBlob = payload.imageBlob;
        } else if (payload.imageDataUrl) {
          msg.imageDataUrl = payload.imageDataUrl;
        } else {
          return;
        }
        screenshotSent = true;
        postRawToPopup(msg);
      }
      if (!script || script.getAttribute('data-screenshot') !== 'false') {
        captureOpenerPageAsJpegDataUrl(sendScreenshotToPopup);
      }

      emitHandshake('open', initialSrc);
      emitUrl(initialSrc);
      pingOpenToPopup();
      [0, 50, 120, 300, 700, 1500, 3000].forEach(function (ms) {
        setTimeout(pingOpenToPopup, ms);
      });

      var onPopupLoad = function () {
        pingOpenToPopup();
        var u = readPopupUrl();
        if (u && u !== lastUrl) {
          lastUrl = u;
          emitUrl(u);
          postUrlToPopup(u);
          emitHandshake('navigate', u);
        }
        postToPopup('navigate');
      };
      try {
        popupWin.addEventListener('load', onPopupLoad);
      } catch (e) { /* noop */ }

      var poll = setInterval(function () {
        if (!popupWin || popupWin.closed) {
          clearInterval(poll);
          notifyHost({
            type: POPUP_CLOSED,
            source: 'vc-plugin',
            sessionId: sessionId,
          });
          emitHandshake('closed', lastUrl);
          try {
            popupWin.removeEventListener('load', onPopupLoad);
          } catch (e0) { /* noop */ }
          vcPluginTabCleanup = null;
          return;
        }
        var u = readPopupUrl();
        if (u && u !== lastUrl) {
          lastUrl = u;
          emitUrl(u);
          postUrlToPopup(u);
          emitHandshake('navigate', u);
          postToPopup('navigate');
        }
      }, 600);

      return function cleanupVcPluginTabSession() {
        try {
          clearInterval(poll);
        } catch (e1) { /* noop */ }
        try {
          popupWin.removeEventListener('load', onPopupLoad);
        } catch (e2) { /* noop */ }
      };
    }
  
    function ensureIframeInDoc(doc, src) {
      if (!doc || !doc.body || !src) return;
      if (doc.getElementById(HOST_ID)) return;
  
      var host = doc.createElement('div');
      host.id = HOST_ID;
      host.style.cssText =
        'position:fixed;inset:0;z-index:2147483646;background:rgba(15,23,42,.5);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;';
  
      var panel = doc.createElement('div');
      panel.style.cssText =
        'position:relative;width:min(960px,100%);height:min(90vh,800px);background:#fff;border-radius:12px;box-shadow:0 25px 50px -12px rgba(0,0,0,.25);overflow:hidden;display:flex;flex-direction:column;';
  
      var closeBar = doc.createElement('div');
      closeBar.style.cssText =
        'flex:0 0 auto;display:flex;justify-content:flex-end;padding:8px 10px;border-bottom:1px solid #e2e8f0;';
  
      var closeBtn = doc.createElement('button');
      closeBtn.type = 'button';
      closeBtn.textContent = 'Close';
      closeBtn.style.cssText =
        'padding:6px 14px;border-radius:8px;border:1px solid #e2e8f0;background:#f8fafc;cursor:pointer;font:600 13px system-ui,sans-serif;';
      closeBtn.addEventListener('click', function () {
        host.remove();
      });
  
      var iframe = doc.createElement('iframe');
      iframe.src = src;
      iframe.setAttribute('title', 'Embedded content');
      iframe.style.cssText = 'flex:1;min-height:0;width:100%;border:0;';
  
      closeBar.appendChild(closeBtn);
      panel.appendChild(closeBar);
      panel.appendChild(iframe);
      host.appendChild(panel);
      doc.body.appendChild(host);
    }

    /**
     * Opens `src` in a named tab so repeat clicks focus the same tab and re-send URL + screenshot.
     */
    function openIframeInNewTab(src, productImageUrl) {
      if (!src) return null;
      if (typeof vcPluginTabCleanup === 'function') {
        try {
          vcPluginTabCleanup();
        } catch (e) { /* noop */ }
        vcPluginTabCleanup = null;
      }
      var targetName = makePluginTabTargetName(src);
      var w = window.open(src, targetName);
      if (!w || w.closed) return null;
      try {
        w.focus();
      } catch (e2) { /* noop */ }
      var sessionId =
        'vc_pop_' +
        Date.now().toString(36) +
        '_' +
        Math.random().toString(36).slice(2, 12);
      vcPluginTabCleanup = attachPopupMessaging(w, src, sessionId, productImageUrl);
      return w;
    }
  
    function openInParent() {
      var src = iframeSrc;
      if (!src) return;
      var sel = getActiveImageSelectorForHref(window.location.href);
      var productImageUrl = sel ? resolveProductImageUrlFromSelector(sel) : '';
      if (openIframeInNewTab(src, productImageUrl)) return;
      try {
        if (window.parent === window) {
          ensureIframeInDoc(document, src);
          return;
        }
        ensureIframeInDoc(window.parent.document, src);
      } catch (e) {
        try {
          window.parent.postMessage({ type: MSG_TYPE, src: src }, '*');
        } catch (err) { /* noop */ }
      }
    }
  
    if (window === window.top) {
      window.addEventListener('message', function (ev) {
        var d = ev && ev.data;
        if (!d || d.type !== MSG_TYPE || typeof d.src !== 'string' || !d.src) return;
        ensureIframeInDoc(document, d.src);
      });
    }
  
    if (!iframeSrc || patternUrlList.length === 0) return;

    var href = window.location.href;
    var matches = patternUrlList.some(function (u) {
      return href.indexOf(u) !== -1;
    });
    console.log(matches,patternUrlList, href);
    if (!matches) return;
  
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'ruffle-parent-iframe-trigger';
    btn.textContent = btnText;
    btn.style.cssText =
      'position:fixed;bottom:28px;right:28px;z-index:99997;padding:12px 18px;border-radius:10px;border:none;background:#0f172a;color:#fff;font:600 14px system-ui,-apple-system,sans-serif;cursor:pointer;box-shadow:0 4px 18px rgba(15,23,42,.35);';
    btn.addEventListener('click', openInParent);
  
    function mount() {
      if (document.body) document.body.appendChild(btn);
      else document.addEventListener('DOMContentLoaded', mount, { once: true });
    }
    mount();
  })();
  
