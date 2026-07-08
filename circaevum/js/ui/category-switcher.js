/**
 * Category Switcher — domain selector for Circaevum layers.
 *
 * Five domains, Taiji-coherent: Basic stays a *separately* toggleable base (Yin spine),
 * the other four swap as the active expression (Yang). So you ride:
 *   Basic + Health · Basic + Financial · Basic + Cryptographic · Basic + Technological
 *
 * Why a DOM widget (not a Three.js mesh): `#xr-ui-layer` is reused as the WebXR DOM overlay
 * (see index.html), so one control serves BOTH flat-PC and hand-tracking XR. Hit targets are
 * sized large + use pointerup so a pinch/tap from hand-tracking lands reliably.
 *
 * Public GL API used (all already in api/circaevum-gl.js):
 *   gl.getLayerIds() · gl.getLayer(id) → { name, visible } · gl.setLayerVisibility(id, bool)
 *
 * Drop-in: include AFTER events-list.js and git-timeline.js. No build step, r128-safe (pure DOM).
 */
(function (global) {
  'use strict';

  // ---- Domain model -------------------------------------------------------
  // Order matters: a layer is claimed by the FIRST matching expressive domain;
  // anything unclaimed falls to Basic (the catch-all base spine).
  var DOMAINS = [
    {
      id: 'health', label: 'Health', glyph: '❤', accent: '#3fb950', key: '1',
      match: /garmin|health|sleep|\bhr\b|heart|fitness|strava|steps|workout|biometr|circadian/i
    },
    {
      id: 'financial', label: 'Financial', glyph: '$', accent: '#e3b341', key: '2',
      match: /financ|money|ledger|invoice|plaid|\bbank|expense|transaction|payroll|treasur|dao.*token|equity/i
    },
    {
      id: 'crypto', label: 'Cryptographic', glyph: '⚿', accent: '#d2a8ff', key: '3',
      match: /git|commit|sign|gpg|ssh|crypto|attest|\bcert|keyring|\bkey\b|verif|hash|signer/i
    },
    {
      id: 'tech', label: 'Technological', glyph: '⚙', accent: '#58a6ff', key: '4',
      match: /device|session|oauth|build|\bci\b|deploy|server|\bapi\b|nakama|\biss\b|webhook|integration|leaf/i
    }
  ];
  var BASIC = { id: 'basic', label: 'Basic', glyph: '◯', accent: '#cbd5e1', key: '0' };

  var STORE_KEY = 'circaevum_active_domain';
  var STORE_BASIC = 'circaevum_basic_on';

  var state = {
    active: readStore(STORE_KEY, 'crypto'),  // which expressive domain is showing
    basicOn: readStore(STORE_BASIC, '1') !== '0'
  };

  function readStore(k, dflt) {
    try { var v = global.localStorage && global.localStorage.getItem(k); return v == null ? dflt : v; }
    catch (e) { return dflt; }
  }
  function writeStore(k, v) { try { global.localStorage && global.localStorage.setItem(k, v); } catch (e) {} }

  function gl() { return global.circaevumGL || (global.getGL && global.getGL()) || null; }

  // ---- Classification -----------------------------------------------------
  function domainOf(layerId) {
    var g = gl();
    var layer = g && g.getLayer ? g.getLayer(layerId) : null;
    var hay = (layerId + ' ' + ((layer && layer.name) || '')).toLowerCase();
    for (var i = 0; i < DOMAINS.length; i++) {
      if (DOMAINS[i].match.test(hay)) return DOMAINS[i].id;
    }
    return 'basic';
  }

  // ---- Apply visibility ---------------------------------------------------
  function apply() {
    var g = gl();
    if (!g || typeof g.getLayerIds !== 'function') return;
    var ids = g.getLayerIds() || [];
    ids.forEach(function (id) {
      var d = domainOf(id);
      var visible = (d === 'basic') ? state.basicOn : (d === state.active);
      if (typeof g.setLayerVisibility === 'function') g.setLayerVisibility(id, visible);
    });
    if (typeof global.refreshCalendarLayersList === 'function') global.refreshCalendarLayersList();
    pulse();
    render();
  }

  function setActive(domainId) {
    if (state.active === domainId) return;
    state.active = domainId;
    writeStore(STORE_KEY, domainId);
    apply();
  }
  function toggleBasic() {
    state.basicOn = !state.basicOn;
    writeStore(STORE_BASIC, state.basicOn ? '1' : '0');
    apply();
  }

  // ---- DOM build ----------------------------------------------------------
  var root, pulseTimer;

  function mountPoint() {
    return document.getElementById('xr-ui-layer') || document.body;
  }

  function injectCSS() {
    if (document.getElementById('circa-cat-switcher-css')) return;
    var css = document.createElement('style');
    css.id = 'circa-cat-switcher-css';
    css.textContent = [
      '#circa-cat-switcher{position:absolute;left:14px;bottom:14px;z-index:40;',
      'font-family:system-ui,-apple-system,"Segoe UI",sans-serif;user-select:none;',
      '-webkit-user-select:none;touch-action:manipulation;}',
      '#circa-cat-switcher .ccs-panel{display:flex;flex-direction:column;gap:8px;',
      'background:rgba(13,17,23,.82);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);',
      'border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:10px;',
      'box-shadow:0 8px 30px rgba(0,0,0,.45);transition:transform .18s ease,opacity .18s ease;}',
      '#circa-cat-switcher.ccs-collapsed .ccs-panel{display:none;}',
      '#circa-cat-switcher .ccs-basic{display:flex;align-items:center;gap:10px;',
      'padding:8px 10px;border-radius:12px;border:1px dashed rgba(203,213,225,.4);}',
      '#circa-cat-switcher .ccs-basic .ccs-eye{min-width:44px;min-height:44px;border-radius:10px;',
      'border:none;cursor:pointer;font-size:18px;color:#0d1117;font-weight:700;background:#cbd5e1;',
      'display:flex;align-items:center;justify-content:center;}',
      '#circa-cat-switcher .ccs-basic.is-off .ccs-eye{background:#39414d;color:#8b949e;}',
      '#circa-cat-switcher .ccs-basic .ccs-lbl{color:#e6edf3;font-size:14px;font-weight:600;}',
      '#circa-cat-switcher .ccs-basic .ccs-sub{color:#8b949e;font-size:11px;}',
      '#circa-cat-switcher .ccs-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;}',
      '#circa-cat-switcher .ccs-btn{min-width:112px;min-height:88px;border-radius:14px;cursor:pointer;',
      'border:2px solid rgba(255,255,255,.10);background:rgba(255,255,255,.04);color:#e6edf3;',
      'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;',
      'transition:transform .12s ease,border-color .15s ease,background .15s ease;padding:6px;}',
      '#circa-cat-switcher .ccs-btn:hover{transform:translateY(-2px);background:rgba(255,255,255,.08);}',
      '#circa-cat-switcher .ccs-btn:active{transform:scale(.96);}',
      '#circa-cat-switcher .ccs-btn .ccs-glyph{font-size:26px;line-height:1;}',
      '#circa-cat-switcher .ccs-btn .ccs-name{font-size:13px;font-weight:600;}',
      '#circa-cat-switcher .ccs-btn .ccs-key{font-size:10px;color:#8b949e;}',
      '#circa-cat-switcher .ccs-btn.is-active{background:rgba(255,255,255,.10);box-shadow:0 0 0 2px currentColor inset;}',
      '#circa-cat-switcher .ccs-legend{display:flex;flex-direction:column;gap:3px;',
      'padding:6px 8px;border-radius:10px;background:rgba(255,255,255,.03);}',
      '#circa-cat-switcher .ccs-legend .ccs-leg-row{display:flex;align-items:center;gap:7px;',
      'font-size:11px;color:#c9d1d9;}',
      '#circa-cat-switcher .ccs-legend .ccs-dot{width:11px;height:11px;border-radius:50%;flex:0 0 auto;}',
      '#circa-cat-switcher .ccs-fab{min-width:48px;min-height:48px;border-radius:50%;cursor:pointer;',
      'border:1px solid rgba(255,255,255,.14);background:rgba(13,17,23,.82);color:#e6edf3;',
      'font-size:20px;display:none;align-items:center;justify-content:center;}',
      '#circa-cat-switcher.ccs-collapsed .ccs-fab{display:flex;}',
      '#circa-cat-switcher .ccs-head{display:flex;align-items:center;justify-content:space-between;gap:8px;}',
      '#circa-cat-switcher .ccs-head .ccs-title{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#8b949e;}',
      '#circa-cat-switcher .ccs-min{background:none;border:none;color:#8b949e;cursor:pointer;font-size:16px;min-width:32px;min-height:32px;}',
      '#circa-cat-switcher.ccs-flash .ccs-panel{transform:scale(1.015);}',
      '@media (max-width:600px){#circa-cat-switcher .ccs-btn{min-width:84px;min-height:78px;}}'
    ].join('');
    document.head.appendChild(css);
  }

  function build() {
    if (document.getElementById('circa-cat-switcher')) { render(); return; }
    injectCSS();
    root = document.createElement('div');
    root.id = 'circa-cat-switcher';

    var fab = document.createElement('button');
    fab.type = 'button'; fab.className = 'ccs-fab'; fab.textContent = '◐';
    fab.title = 'Layer domains'; fab.setAttribute('aria-label', 'Open layer domains');
    onTap(fab, function () { root.classList.remove('ccs-collapsed'); });

    var panel = document.createElement('div');
    panel.className = 'ccs-panel';

    // header
    var head = document.createElement('div'); head.className = 'ccs-head';
    var title = document.createElement('span'); title.className = 'ccs-title'; title.textContent = 'Domains';
    var min = document.createElement('button');
    min.type = 'button'; min.className = 'ccs-min'; min.textContent = '–';
    min.title = 'Collapse'; min.setAttribute('aria-label', 'Collapse');
    onTap(min, function () { root.classList.add('ccs-collapsed'); });
    head.appendChild(title); head.appendChild(min);

    // Basic: separate, always-toggleable base
    var basic = document.createElement('div'); basic.className = 'ccs-basic'; basic.dataset.role = 'basic';
    var eye = document.createElement('button');
    eye.type = 'button'; eye.className = 'ccs-eye'; eye.textContent = BASIC.glyph;
    eye.title = 'Toggle Basic base layer (0)'; eye.setAttribute('aria-label', 'Toggle Basic layer');
    onTap(eye, toggleBasic);
    var bl = document.createElement('div');
    var blName = document.createElement('div'); blName.className = 'ccs-lbl'; blName.textContent = 'Basic';
    var blSub = document.createElement('div'); blSub.className = 'ccs-sub'; blSub.textContent = 'base spine · stays on its own';
    bl.appendChild(blName); bl.appendChild(blSub);
    basic.appendChild(eye); basic.appendChild(bl);

    // 4 expressive domains
    var grid = document.createElement('div'); grid.className = 'ccs-grid';
    DOMAINS.forEach(function (d) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'ccs-btn'; b.dataset.domain = d.id;
      b.style.color = d.accent;
      b.title = d.label + '  (' + d.key + ')';
      b.setAttribute('aria-label', 'Show ' + d.label + ' layers');
      var g = document.createElement('span'); g.className = 'ccs-glyph'; g.textContent = d.glyph;
      var n = document.createElement('span'); n.className = 'ccs-name'; n.textContent = d.label; n.style.color = '#e6edf3';
      var k = document.createElement('span'); k.className = 'ccs-key'; k.textContent = 'key ' + d.key;
      b.appendChild(g); b.appendChild(n); b.appendChild(k);
      onTap(b, function () { setActive(d.id); });
      grid.appendChild(b);
    });

    var legend = document.createElement('div'); legend.className = 'ccs-legend'; legend.dataset.role = 'legend';

    panel.appendChild(head);
    panel.appendChild(basic);
    panel.appendChild(grid);
    panel.appendChild(legend);
    root.appendChild(panel);
    root.appendChild(fab);
    mountPoint().appendChild(root);
    render();
  }

  // ---- Render reflective state -------------------------------------------
  function render() {
    if (!root) return;
    var basic = root.querySelector('.ccs-basic');
    if (basic) basic.classList.toggle('is-off', !state.basicOn);
    var btns = root.querySelectorAll('.ccs-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('is-active', btns[i].dataset.domain === state.active);
    }
    renderLegend();
  }

  // Cryptographic domain shows the git signature-state color key (ties color-coding to the switcher).
  function renderLegend() {
    var el = root && root.querySelector('.ccs-legend');
    if (!el) return;
    el.innerHTML = '';
    if (state.active === 'crypto' && global.GIT_SIGNATURE_STYLES) {
      var styles = global.GIT_SIGNATURE_STYLES;
      ['verified', 'unverified', 'dco', 'unsigned'].forEach(function (k) {
        var s = styles[k]; if (!s) return;
        var row = document.createElement('div'); row.className = 'ccs-leg-row';
        var dot = document.createElement('span'); dot.className = 'ccs-dot'; dot.style.background = s.color;
        var t = document.createElement('span'); t.textContent = s.glyph + '  ' + s.label;
        row.appendChild(dot); row.appendChild(t); el.appendChild(row);
      });
      el.style.display = '';
    } else {
      el.style.display = 'none';
    }
  }

  function pulse() {
    if (!root) return;
    root.classList.add('ccs-flash');
    clearTimeout(pulseTimer);
    pulseTimer = setTimeout(function () { root && root.classList.remove('ccs-flash'); }, 180);
  }

  // ---- Input helpers ------------------------------------------------------
  // pointerup (not click) so hand-tracking pinch-release registers; guard double-fire.
  function onTap(el, fn) {
    var handled = false;
    el.addEventListener('pointerup', function (e) {
      handled = true; e.preventDefault(); fn(e);
      setTimeout(function () { handled = false; }, 350);
    });
    el.addEventListener('click', function (e) { if (!handled) fn(e); });
  }

  function onKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;
    if (e.key === BASIC.key) { toggleBasic(); return; }
    for (var i = 0; i < DOMAINS.length; i++) {
      if (e.key === DOMAINS[i].key) { setActive(DOMAINS[i].id); return; }
    }
  }

  // ---- Lifecycle ----------------------------------------------------------
  function waitForGL(cb, tries) {
    tries = tries || 0;
    if (gl() && typeof gl().getLayerIds === 'function') { cb(); return; }
    if (tries > 200) return; // ~40s ceiling
    setTimeout(function () { waitForGL(cb, tries + 1); }, 200);
  }

  function init() {
    build();
    document.addEventListener('keydown', onKey);
    // Re-apply once GL + layers are live, and whenever layers change.
    waitForGL(function () {
      apply();
      var g = gl();
      if (g && typeof g.on === 'function') {
        g.on('layerVisibilityChanged', render);
        g.on('eventsIngested', function () { render(); });
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ---- Public hook --------------------------------------------------------
  global.CircaCategorySwitcher = {
    setActive: setActive,
    toggleBasic: toggleBasic,
    apply: apply,
    domainOf: domainOf,
    state: state,
    DOMAINS: DOMAINS
  };
})(typeof window !== 'undefined' ? window : this);
