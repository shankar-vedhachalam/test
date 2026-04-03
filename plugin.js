(function () {
    const script =
      document.currentScript || document.querySelector('script[src*="plugin.js"]');
    const patternsStr = (script && script.getAttribute('data-url-patterns')) || '';
    const iframeSrc = (script && script.getAttribute('data-iframe-src')) || '';
    const btnText =
      (script && script.getAttribute('data-button-text')) || 'Open in frame';
    const HOST_ID = 'ruffle-parent-iframe-host';
    const MSG_TYPE = 'ruffle-parent-iframe-open';
  
    const patterns = patternsStr
      .split(',')
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean);
  
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
  
    function openInParent() {
      var src = iframeSrc;
      if (!src) return;
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
  
    if (!iframeSrc || patterns.length === 0) return;
  
    var href = window.location.href;
    var matches = patterns.some(function (u) {
      return href.indexOf(u) !== -1;
    });
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
  