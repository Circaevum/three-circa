(function() {
  var USER_EVENTS_LAYER = 'user-events';
  window.addEventListener('message', function(event) {
    var data = event.data;
    if (!data || typeof data !== 'object' || !data.type) return;
    if (data.type === 'CIRCAEVUM_SET_FLATTEN') {
      if (typeof window.applyFlattenFromEmbed === 'function') {
        window.applyFlattenFromEmbed(!!data.flatten, typeof data.intensity === 'number' ? data.intensity : undefined);
      }
      return;
    }
    if (data.type === 'CIRCAEVUM_TOGGLE_ABOUT' && typeof window.toggleAboutPanel === 'function') {
      window.toggleAboutPanel();
      return;
    }
    var gl = window.circaevumGL || (window.getGL && window.getGL());
    if (!gl || typeof gl.ingestEvents !== 'function') return;
    if (data.type === 'CIRCAEVUM_INGEST_EVENTS' && data.layerId && Array.isArray(data.events)) {
      try {
        console.log('[Circaevum GL] Ingesting events from wrapper:', data.layerId, 'count=', data.events.length);
      } catch (e) {}
      gl.ingestEvents(data.layerId, data.events, data.options || {});
      if (typeof window.refreshCalendarLayersList === 'function') window.refreshCalendarLayersList();
      if (typeof window.refreshEventsList === 'function') window.refreshEventsList(false);
      // Do not auto fitToLayer here – it would jump selected time to earliest event (e.g. May 2025). Caller may send CIRCAEVUM_FIT_VIEW when focusing on a layer.
    } else if (data.type === 'CIRCAEVUM_FIT_VIEW' && data.focus != null && typeof data.zoom === 'number') {
      if (typeof gl.setZoomLevel === 'function') gl.setZoomLevel(data.zoom);
      if (typeof gl.navigateToTime === 'function') gl.navigateToTime(data.focus);
      var cam = typeof window !== 'undefined' && window.cameraRotation;
      if (cam) {
        if (typeof data.rx === 'number' && !isNaN(data.rx)) {
          cam.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, data.rx));
        }
        if (typeof data.ry === 'number' && !isNaN(data.ry)) {
          cam.y = data.ry;
        }
      }
      if (data.resetPolar === true && typeof window.requestCircaevumPolarReseed === 'function') {
        try { window.requestCircaevumPolarReseed(); } catch (e) {}
      }
    } else if (data.type === 'CIRCAEVUM_CLEAR_EVENTS' && data.layerId) {
      gl.updateEvents(data.layerId, []);
      if (typeof window.refreshCalendarLayersList === 'function') window.refreshCalendarLayersList();
      if (typeof window.refreshEventsList === 'function') window.refreshEventsList(false);
    } else if (data.type === 'CIRCAEVUM_OPEN_EVENT_LIST' && typeof window.openEventListPanel === 'function') {
      window.openEventListPanel();
    } else if (data.type === 'CIRCAEVUM_HIGHLIGHT_EVENT' && typeof gl.setEventHighlight === 'function') {
      gl.setEventHighlight(data.layerId || USER_EVENTS_LAYER, data.uid != null ? data.uid : null);
    } else if (data.type === 'CIRCAEVUM_DRAW_ALL_EVENTS' && typeof window.refreshEventsList === 'function') {
      window.refreshEventsList(true);
    }
  });

  if (window.self !== window.top && window.parent.postMessage) {
    setTimeout(function() {
      try {
        window.parent.postMessage({
          type: 'CIRCAEVUM_THEME',
          lightMode: document.body.classList.contains('light-mode'),
          appearanceTheme: (typeof window.getAppearanceTheme === 'function' ? window.getAppearanceTheme() : (document.body.classList.contains('sky-theme') ? 'sky' : (document.body.classList.contains('light-mode') ? 'light' : 'dark')))
        }, '*');
      } catch (e) {}
    }, 1200);
    // Notify parent when GL is ready so wrapper can send FIT_VIEW (restore zoom/focus from URL)
    var readySent = false;
    function trySendReady() {
      if (readySent) return;
      var gl = window.circaevumGL || (window.getGL && window.getGL());
      if (!gl || typeof gl.setZoomLevel !== 'function' || typeof gl.navigateToTime !== 'function') return;
      readySent = true;
      try {
        window.parent.postMessage({ type: 'CIRCAEVUM_READY' }, '*');
      } catch (e) {}
    }
    var t0 = setInterval(function() {
      trySendReady();
      if (readySent) clearInterval(t0);
    }, 100);
    setTimeout(function() { clearInterval(t0); }, 8000);
  }

  // Monkey-patch setZoomLevel to notify parent wrapper about zoom changes.
  if (window.self !== window.top && window.parent.postMessage && typeof window.setZoomLevel === 'function') {
    var originalSetZoomLevel = window.setZoomLevel;
    window.setZoomLevel = function(level) {
      originalSetZoomLevel(level);
      try {
        window.parent.postMessage({ type: 'CIRCAEVUM_ZOOM', level: level }, '*');
      } catch (e) {}
    };
  }
})();
