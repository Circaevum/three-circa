(function() {
  var USER_EVENTS_LAYER = 'user-events';

  function getEmbedContextArcPayload() {
    var z = typeof window.currentZoom === 'number' && !isNaN(window.currentZoom) ? window.currentZoom : 4;
    var sel = typeof window.getSelectedDateTime === 'function' ? window.getSelectedDateTime() : new Date();
    var b = null;
    if (typeof window.getSelectedContextArcTimeBoundsMs === 'function') {
      try {
        b = window.getSelectedContextArcTimeBoundsMs(z, sel);
      } catch (e) { b = null; }
    }
    return {
      zoom: z,
      focus: sel && !isNaN(sel.getTime()) ? sel.toISOString() : null,
      contextArc: b && isFinite(b.t0) && isFinite(b.t1) ? { t0: b.t0, t1: b.t1 } : null
    };
  }
  window.getEmbedContextArcPayload = getEmbedContextArcPayload;

  var _viewFocusNotifyTimer = null;
  var _viewFocusNotifyKey = '';
  /** Debounced: scrub + navigate both call setSelectedDateTime — portal needs new cyan pie. */
  window.notifyParentViewFocus = function () {
    if (window.self === window.top || !window.parent || !window.parent.postMessage) return;
    if (_viewFocusNotifyTimer) clearTimeout(_viewFocusNotifyTimer);
    _viewFocusNotifyTimer = setTimeout(function () {
      _viewFocusNotifyTimer = null;
      try {
        var payload = Object.assign({ type: 'CIRCAEVUM_VIEW_FOCUS' }, getEmbedContextArcPayload());
        var key = (payload.focus || '') + '|' + (payload.contextArc ? payload.contextArc.t0 + ':' + payload.contextArc.t1 : '') + '|' + payload.zoom;
        if (key === _viewFocusNotifyKey) return;
        _viewFocusNotifyKey = key;
        window.parent.postMessage(payload, '*');
      } catch (e) {}
    }, 90);
  };
  window.addEventListener('message', function(event) {
    var data = event.data;
    if (!data || typeof data !== 'object' || !data.type) return;
    if (
      data.type === 'CIRCAEVUM_INTRO_SET' ||
      data.type === 'CIRCAEVUM_INTRO_PROMPT' ||
      data.type === 'CIRCAEVUM_INTRO_START'
    ) {
      if (typeof window.applyCircaevumIntroEmbedCommand === 'function') {
        window.applyCircaevumIntroEmbedCommand(data);
      }
      return;
    }
    if (data.type === 'CIRCAEVUM_SET_BIRTHDAY') {
      if (typeof window.applyUserBirthdayView === 'function') {
        window.applyUserBirthdayView(data.date || data.monthDay);
      }
      return;
    }
    if (data.type === 'CIRCAEVUM_SET_FLATTEN') {
      if (typeof window.applyFlattenFromEmbed === 'function') {
        window.applyFlattenFromEmbed(!!data.flatten, typeof data.intensity === 'number' ? data.intensity : undefined);
      }
      return;
    }
    if (data.type === 'CIRCAEVUM_SET_SHIFT_PREVIEW') {
      if (typeof window.setCircadianShortEventsShiftPreview === 'function') {
        window.setCircadianShortEventsShiftPreview(!!data.active);
      }
      return;
    }
    if (data.type === 'CIRCAEVUM_TOGGLE_ABOUT' && typeof window.toggleAboutPanel === 'function') {
      window.toggleAboutPanel();
      return;
    }
    if (data.type === 'CIRCAEVUM_OPEN_KEYBOARD_CONTROLS' && typeof window.openKeyboardControlsPanel === 'function') {
      window.openKeyboardControlsPanel();
      return;
    }
    if (data.type === 'CIRCAEVUM_EVENTS_LOADING') {
      if (typeof window.setEventIngestLoading === 'function') {
        window.setEventIngestLoading(!!data.active, data);
      }
      return;
    }
    if (data.type === 'CIRCAEVUM_INGEST_GIT_TIMELINE' && typeof window.ingestGitTimeline === 'function') {
      var glGit = window.circaevumGL || (window.getGL && window.getGL());
      if (!glGit) return;
      try {
        var counts = window.ingestGitTimeline(
          { commits: data.commits, branches: data.branches },
          data.options || {}
        );
        console.log('[Circaevum GL] Git timeline ingested:', counts);
      } catch (eGit) {
        console.error('[Circaevum GL] Git timeline ingest failed:', eGit);
      }
      if (typeof TimeseriesRenderer !== 'undefined' && typeof TimeseriesRenderer.resetRefreshCache === 'function') {
        TimeseriesRenderer.resetRefreshCache();
      }
      if (typeof window.refreshCalendarLayersList === 'function') window.refreshCalendarLayersList();
      if (typeof window.refreshEventsList === 'function') window.refreshEventsList(false);
      return;
    }
    var gl = window.circaevumGL || (window.getGL && window.getGL());
    if (!gl || typeof gl.ingestEvents !== 'function') return;
    if (data.type === 'CIRCAEVUM_INGEST_EVENTS' && data.layerId && Array.isArray(data.events)) {
      try {
        console.log('[Circaevum GL] Ingesting events from wrapper:', data.layerId, 'count=', data.events.length);
      } catch (e) {}
      gl.ingestEvents(data.layerId, data.events, data.options || {});
      if (typeof TimeseriesRenderer !== 'undefined' && typeof TimeseriesRenderer.resetRefreshCache === 'function') {
        TimeseriesRenderer.resetRefreshCache();
      }
      if (typeof window.refreshCalendarLayersList === 'function') window.refreshCalendarLayersList();
      if (typeof window.refreshEventsList === 'function') window.refreshEventsList(false);
      if (typeof window.scheduleEventsPanelRefresh === 'function') {
        window.scheduleEventsPanelRefresh(60);
        window.scheduleEventsPanelRefresh(220);
      }
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
    } else if (data.type === 'CIRCAEVUM_HOST_CHROME') {
      var hostLeft = typeof data.left === 'number' && data.left > 0 ? data.left : 0;
      var hostRight = typeof data.right === 'number' && data.right > 0 ? data.right : 0;
      document.documentElement.style.setProperty('--host-chrome-left', hostLeft + 'px');
      document.documentElement.style.setProperty('--host-chrome-right', hostRight + 'px');
    } else if (data.type === 'CIRCAEVUM_OPEN_EVENT_LIST' && typeof window.openEventListPanel === 'function') {
      window.openEventListPanel();
    } else if (data.type === 'CIRCAEVUM_HIGHLIGHT_EVENT' && typeof gl.setEventHighlight === 'function') {
      var highlightUid = data.uid != null ? data.uid : null;
      gl.setEventHighlight(data.layerId || USER_EVENTS_LAYER, highlightUid);
      if (highlightUid == null && typeof window.closeMobileEventDetailSheet === 'function') {
        window.closeMobileEventDetailSheet();
      }
    } else if (data.type === 'CIRCAEVUM_DRAW_ALL_EVENTS' && typeof window.refreshEventsList === 'function') {
      window.refreshEventsList(true);
    } else if (data.type === 'CIRCAEVUM_REFRESH_EVENT_LAYERS') {
      if (typeof window.refreshEventLayersIfNeeded === 'function') {
        try { window.refreshEventLayersIfNeeded(true); } catch (e) {}
      } else if (gl && typeof gl.refreshAllEventLayers === 'function') {
        try { gl.refreshAllEventLayers(); } catch (e) {}
      }
      if (typeof window.syncEventMeshesToContextArc === 'function') {
        try { window.syncEventMeshesToContextArc(); } catch (e) {}
      }
      if (typeof window.refreshEventsList === 'function') window.refreshEventsList(false);
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
      if (typeof sceneContentGroup === 'undefined' || !sceneContentGroup) return;
      readySent = true;
      try {
        window.parent.postMessage(Object.assign({ type: 'CIRCAEVUM_READY' }, getEmbedContextArcPayload()), '*');
      } catch (e) {}
    }
    var t0 = setInterval(function() {
      trySendReady();
      if (readySent) clearInterval(t0);
    }, 100);
    setTimeout(function() { clearInterval(t0); }, 8000);

    // Selected-time notify lives on setSelectedDateTime (covers scrub + navigateToTime).
  }

  // Monkey-patch setZoomLevel to notify parent wrapper about zoom changes.
  if (window.self !== window.top && window.parent.postMessage && typeof window.setZoomLevel === 'function') {
    var originalSetZoomLevel = window.setZoomLevel;
    window.setZoomLevel = function(level) {
      originalSetZoomLevel(level);
      try {
        window.parent.postMessage(
        Object.assign({ type: 'CIRCAEVUM_ZOOM', level: level }, getEmbedContextArcPayload()),
        '*'
      );
      } catch (e) {}
    };
  }
})();
