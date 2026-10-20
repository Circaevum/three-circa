(function() {
  var UI = window.CircaevumUI || {};
  var USER_EVENTS_LAYER = (typeof UI.getUserEventsLayerId === 'function' ? UI.getUserEventsLayerId() : null) || 'user-events';
  var EVENT_LIST_RING_C = 100;
  var formatDate = typeof UI.formatDate === 'function' ? UI.formatDate : function(d) { return String(d || '—'); };
  var escapeHtml = typeof UI.escapeHtml === 'function' ? UI.escapeHtml : function(s) { return String(s == null ? '' : s); };
  var layerSwatchColor = typeof UI.layerSwatchColor === 'function' ? UI.layerSwatchColor : function() { return null; };
  var oneDayLater = typeof UI.oneDayLater === 'function' ? UI.oneDayLater : function(d) { return d; };

  function setCircaevumSelectedLayerId(layerId) {
    if (!layerId) return;
    window.circaevumSelectedLayerId = layerId;
  }
  window.setCircaevumSelectedLayerId = setCircaevumSelectedLayerId;

  function calendarVisibilitySvg(visible) {
    if (visible) {
      return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
    }
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
  }

  function zoomDisplayName(z) {
    var names = {
      0: 'Hour',
      1: 'Century',
      2: 'Decade',
      3: 'Year',
      4: 'Quarter',
      5: 'Month',
      6: 'Lunar',
      7: 'Week',
      8: 'Day',
      9: 'Clock'
    };
    return names[z] || ('Zoom ' + z);
  }

  /** Smallest zoom where this span is in the focused list/label band (see EventRenderer). */
  /** Events panel calendar never goes past weekly frame (Z7). Scene may be 8/9/0. */
  var EVENTS_PANEL_MAX_CALENDAR_ZOOM = 7;

  function eventsPanelCalendarZoom(sceneZ) {
    var zl = typeof sceneZ === 'number' && !isNaN(sceneZ) ? Math.floor(sceneZ) : 5;
    if (zl >= EVENTS_PANEL_MAX_CALENDAR_ZOOM || zl === 0) return EVENTS_PANEL_MAX_CALENDAR_ZOOM;
    return zl;
  }

  /**
   * Base Event-panel frame from scene zoom — one zoom → one frame.
   * Highlight / scroll come after; this only picks the calendar skeleton.
   *
   *  Z  | name    | frame id   | layout
   * ----|---------|------------|------------------
   *  1  | Century | century    | list
   *  2  | Decade  | decade     | year
   *  3  | Year    | year       | year
   *  4  | Quarter | quarter    | quarter
   *  5  | Month   | month      | month
   *  6  | Lunar   | lunar      | month
   *  7  | Week    | week       | month + week-stretch (cyan = week)
   * 8/9/0 | Day+  | week-day   | same week-stretch; cyan = selected day only
   */
  function getEventsPanelBaseFrame(sceneZ) {
    var z = typeof sceneZ === 'number' && !isNaN(sceneZ) ? Math.floor(sceneZ) : 4;
    if (z === 0 || z >= 8) {
      return {
        id: 'week-day',
        layout: 'month',
        variant: 'week-stretch-day',
        calendarZoom: 7,
        stretchWeek: true,
        daySelectOnly: true
      };
    }
    if (z === 7) {
      return { id: 'week', layout: 'month', variant: 'week-stretch', calendarZoom: 7, stretchWeek: true, daySelectOnly: false };
    }
    if (z === 6) {
      return { id: 'lunar', layout: 'month', variant: 'month', calendarZoom: 6, stretchWeek: false, daySelectOnly: false };
    }
    if (z === 5) {
      return { id: 'month', layout: 'month', variant: 'month', calendarZoom: 5, stretchWeek: false, daySelectOnly: false };
    }
    if (z === 4) {
      return { id: 'quarter', layout: 'quarter', variant: 'quarter', calendarZoom: 4, stretchWeek: false, daySelectOnly: false };
    }
    if (z === 3) {
      return { id: 'year', layout: 'year', variant: 'year', calendarZoom: 3, stretchWeek: false, daySelectOnly: false };
    }
    if (z === 2) {
      return { id: 'decade', layout: 'year', variant: 'decade', calendarZoom: 2, stretchWeek: false, daySelectOnly: false };
    }
    return { id: 'century', layout: 'list', variant: 'list', calendarZoom: 1, stretchWeek: false, daySelectOnly: false };
  }

  function capNavigateZoomForEventsPanel(z) {
    var zl = typeof z === 'number' && !isNaN(z) ? Math.floor(z) : EVENTS_PANEL_MAX_CALENDAR_ZOOM;
    if (zl > EVENTS_PANEL_MAX_CALENDAR_ZOOM || zl === 0) return EVENTS_PANEL_MAX_CALENDAR_ZOOM;
    return zl;
  }

  function preferredZoomForEventSpan(start, end) {
    var s = start instanceof Date ? start : new Date(start);
    var e = end instanceof Date ? end : new Date(end);
    if (!s || isNaN(s.getTime())) return typeof currentZoom !== 'undefined' ? currentZoom : 5;
    if (!e || isNaN(e.getTime()) || e <= s) e = oneDayLater(s) || s;
    var days = durationDaysBetweenLocal(s, e);
    return capNavigateZoomForEventsPanel(eventTextLabelsMinZoomForDurationDaysLocal(days));
  }

  /**
   * Day-block click: Selected time → that day, scene → Weekly (Z7) stretched panel.
   * Never hops to Day/Clock (8/9/0) from the Events calendar.
   */
  function navigateToCalendarDay(dayStart, dayEnd) {
    var s = dayStart instanceof Date ? dayStart : new Date(dayStart);
    var e = dayEnd instanceof Date ? dayEnd : new Date(dayEnd);
    if (!s || isNaN(s.getTime())) return;
    if (!e || isNaN(e.getTime()) || e <= s) e = endOfLocalDay(s);
    var mid = new Date((s.getTime() + e.getTime()) / 2);
    try {
      var zNow = resolveEventsPanelZoom(
        typeof window.currentZoom === 'number' ? window.currentZoom : 5
      );
      if (zNow !== EVENTS_PANEL_MAX_CALENDAR_ZOOM) {
        if (typeof window.setZoomLevel === 'function') {
          window.setZoomLevel(EVENTS_PANEL_MAX_CALENDAR_ZOOM, mid);
        } else if (typeof window.setSelectedDateTime === 'function') {
          window.setSelectedDateTime(mid);
        }
      } else if (typeof window.smoothNavigateToTime === 'function') {
        window.smoothNavigateToTime(mid, 880);
      } else if (typeof window.setSelectedDateTime === 'function') {
        window.setSelectedDateTime(mid);
      }
      if (typeof window.refreshEventsList === 'function') {
        window.refreshEventsList(false, { zoom: EVENTS_PANEL_MAX_CALENDAR_ZOOM });
      }
    } catch (err) { /* ignore */ }
  }

  function navigateToEvent(start, end) {
    var s = start instanceof Date ? start : new Date(start);
    var e = end instanceof Date ? end : new Date(end);
    if (!s || isNaN(s.getTime())) return;
    if (!e || isNaN(e.getTime()) || e <= s) e = oneDayLater(s) || s;
    var mid = new Date((s.getTime() + e.getTime()) / 2);
    var days = durationDaysBetweenLocal(s, e);
    var zNow = resolveEventsPanelZoom(
      typeof window.currentZoom === 'number' ? window.currentZoom : 2
    );
    var zTarget = capNavigateZoomForEventsPanel(eventTextLabelsMinZoomForDurationDaysLocal(days));
    try {
      if (zNow !== zTarget && !eventDurationEligible(days, zNow)) {
        if (typeof window.setZoomLevel === 'function') {
          window.setZoomLevel(zTarget, mid);
        } else {
          var glZoom = window.circaevumGL || (window.getGL && window.getGL());
          if (glZoom) {
            if (typeof glZoom.setZoomLevel === 'function') glZoom.setZoomLevel(zTarget);
            if (typeof glZoom.navigateToTime === 'function') glZoom.navigateToTime(mid);
          }
        }
        if (typeof window.refreshEventsList === 'function') {
          window.refreshEventsList(false, { zoom: zTarget });
        }
        return;
      }
      if (typeof window.smoothNavigateToTime === 'function') {
        var ref = (typeof window.getSelectedDateTime === 'function')
          ? window.getSelectedDateTime()
          : new Date();
        var spanMs = Math.abs(mid.getTime() - ref.getTime());
        var dur = Math.min(2400, Math.max(880, Math.round(spanMs / 42)));
        window.smoothNavigateToTime(mid, dur);
      } else {
        var gl = window.circaevumGL || (window.getGL && window.getGL());
        if (gl && typeof gl.navigateToTime === 'function') {
          gl.navigateToTime(mid);
        }
      }
    } catch (e2) {}
  }
  window.navigateToEvent = navigateToEvent;
  window.navigateToCalendarDay = navigateToCalendarDay;
  window.preferredZoomForEventSpan = preferredZoomForEventSpan;
  window.zoomDisplayName = zoomDisplayName;
  window.eventsPanelCalendarZoom = eventsPanelCalendarZoom;
  window.getEventsPanelBaseFrame = getEventsPanelBaseFrame;

  function categoryStyleVisible(gl, layerId, category) {
    var layer = gl.getLayer(layerId);
    if (!layer) return true;
    var styles = layer.categoryStyles;
    if (!styles || !styles[category]) return true;
    return styles[category].visible !== false;
  }

  /** Effective on-scene visibility: layer on AND category style on. */
  function categoryVisibleInLayer(gl, layerId, category) {
    var layer = gl.getLayer(layerId);
    if (!layer || layer.visible === false) return false;
    return categoryStyleVisible(gl, layerId, category);
  }

  function calendarLayerVisibilityToggle(ev, gl, layerId) {
    ev.preventDefault();
    ev.stopPropagation();
    var cur = gl.getLayer(layerId);
    var v = cur ? cur.visible !== false : true;
    if (typeof gl.setLayerVisibility === 'function') gl.setLayerVisibility(layerId, !v);
    refreshCalendarLayersList();
    refreshEventsList(false);
  }

  function calendarCategoryVisibilityToggle(ev, gl, layerId, category) {
    ev.preventDefault();
    ev.stopPropagation();
    var vis = categoryStyleVisible(gl, layerId, category);
    if (typeof gl.setCategoryVisibility === 'function') {
      gl.setCategoryVisibility(layerId, category, !vis);
    }
    refreshCalendarLayersList();
    refreshEventsList(false);
  }

  function ensureCalendarLayersGLListeners(gl) {
    if (!gl || gl._calendarLayersUiHooked || typeof gl.on !== 'function') return;
    gl._calendarLayersUiHooked = true;
    var r = function() {
      refreshCalendarLayersList();
      scheduleEventsPanelRefresh(0);
      scheduleEventsPanelRefresh(120);
    };
    gl.on('layerAdded', r);
    gl.on('layerRemoved', r);
    gl.on('layerVisibilityChanged', r);
    gl.on('categoryVisibilityChanged', r);
    gl.on('eventsIngested', r);
  }

  var _eventsPanelRefreshTimers = [];
  /** Last zoom forced by setZoomLevel — beats stale DOM / GL options.zoomLevel. */
  var _eventsPanelLiveZoom = null;

  function setEventsPanelLiveZoom(z) {
    if (typeof z === 'number' && !isNaN(z)) {
      _eventsPanelLiveZoom = Math.floor(z);
    }
  }

  function cancelScheduledEventsPanelRefresh() {
    for (var i = 0; i < _eventsPanelRefreshTimers.length; i++) {
      try { clearTimeout(_eventsPanelRefreshTimers[i]); } catch (eC) { /* ignore */ }
    }
    _eventsPanelRefreshTimers.length = 0;
  }

  /** Coalesce + delayed passes so calendar sees events after merge/mesh settle. */
  function scheduleEventsPanelRefresh(delayMs) {
    var delay = typeof delayMs === 'number' && delayMs > 0 ? delayMs : 0;
    var t = setTimeout(function() {
      var ix = _eventsPanelRefreshTimers.indexOf(t);
      if (ix >= 0) _eventsPanelRefreshTimers.splice(ix, 1);
      try {
        // Always re-resolve from live scene so Z7→Z5 cannot keep a stretched week.
        var zLive = resolveEventsPanelZoom(
          typeof window.currentZoom === 'number' ? window.currentZoom : 4
        );
        refreshEventsList(false, { zoom: zLive, keepScheduled: true });
      } catch (e) { /* panel optional */ }
    }, delay);
    _eventsPanelRefreshTimers.push(t);
  }

  function hookGlListenersWhenReady() {
    var gl = window.circaevumGL || (window.getGL && window.getGL());
    if (gl && typeof gl.on === 'function') {
      ensureCalendarLayersGLListeners(gl);
      return true;
    }
    return false;
  }

  function refreshAtcLegend() {
    var host = document.getElementById('atc-legend-host');
    if (!host) return;
    var parts = [];
    if (typeof IonosphereShell !== 'undefined' && typeof IonosphereShell.renderLegendHtml === 'function') {
      parts.push(IonosphereShell.renderLegendHtml());
    }
    if (typeof MagnetosphereShell !== 'undefined' && typeof MagnetosphereShell.renderLegendHtml === 'function') {
      parts.push(MagnetosphereShell.renderLegendHtml());
    }
    if (typeof AtcBand !== 'undefined' && typeof AtcBand.renderLegendHtml === 'function') {
      parts.push(AtcBand.renderLegendHtml());
    }
    if (!parts.length) {
      host.innerHTML = '';
    } else {
      host.innerHTML =
        '<details class="calendar-shells-details">' +
        '<summary class="calendar-shells-summary">Shells &amp; bands</summary>' +
        '<div class="calendar-shells-body">' + parts.join('') + '</div>' +
        '</details>';
    }
    if (typeof window.syncGeophysicalShellsIcon === 'function') window.syncGeophysicalShellsIcon();
  }

  function refreshCalendarLayersList() {
    var listEl = document.getElementById('calendar-layers-list');
    if (!listEl) return;
    listEl.innerHTML = '';
    var gl = window.circaevumGL || (window.getGL && window.getGL());
    if (!gl || typeof gl.getLayerIds !== 'function') {
      listEl.innerHTML = '<p class="calendar-layers-empty">Scene not ready.</p>';
      return;
    }
    ensureCalendarLayersGLListeners(gl);
    var ids = gl.getLayerIds();
    if (!ids.length) {
      listEl.innerHTML = '<p class="calendar-layers-empty">No layers yet.</p>';
      refreshAtcLegend();
      return;
    }
    ids.forEach(function(layerId) {
      var layer = gl.getLayer(layerId);
      var displayName = (layer && layer.name) ? layer.name : layerId;
      var visible = layer ? layer.visible !== false : true;
      var hex = layerSwatchColor(layer);
      var nEv = (gl.getEventObjects && gl.getEventObjects(layerId)) ? gl.getEventObjects(layerId).length : 0;

      var catSet = {};
      if (gl.getEventObjects) {
        (gl.getEventObjects(layerId) || []).forEach(function (ev) {
          var c = ev.category != null ? String(ev.category).trim() : '';
          if (!c) c = 'Default';
          catSet[c] = (catSet[c] || 0) + 1;
        });
      }
      var catNames = Object.keys(catSet).sort();
      var hasCats = catNames.length > 1;

      var rowRoot;
      var sum;
      if (hasCats) {
        rowRoot = document.createElement('details');
        rowRoot.className = 'calendar-layer-details calendar-layer-details--has-cats';
        rowRoot.open = false;
        sum = document.createElement('summary');
        sum.className = 'calendar-layer-summary';
      } else {
        rowRoot = document.createElement('div');
        rowRoot.className = 'calendar-layer-row';
        sum = document.createElement('div');
        sum.className = 'calendar-layer-summary';
      }

      var sw = document.createElement('span');
      sw.className = 'calendar-layer-swatch';
      if (hex) sw.style.background = hex;
      else sw.classList.add('calendar-layer-swatch-default');

      var titleEl = document.createElement('span');
      titleEl.className = 'calendar-layer-title';
      titleEl.textContent = displayName;
      titleEl.title = 'Select layer';
      titleEl.onmousedown = function(e) { e.stopPropagation(); };
      titleEl.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        setCircaevumSelectedLayerId(layerId);
      };

      sum.appendChild(sw);
      sum.appendChild(titleEl);
      if (nEv > 0) {
        var countEl = document.createElement('span');
        countEl.className = 'calendar-layer-count';
        countEl.textContent = String(nEv);
        countEl.title = nEv + ' event' + (nEv !== 1 ? 's' : '');
        sum.appendChild(countEl);
      }

      var visBtn = document.createElement('button');
      visBtn.type = 'button';
      visBtn.className = 'calendar-layer-visibility-btn' + (visible ? ' is-on' : ' is-off');
      visBtn.setAttribute('aria-label', visible ? 'Hide layer' : 'Show layer');
      visBtn.innerHTML = calendarVisibilitySvg(visible);
      visBtn.onclick = function(e) { calendarLayerVisibilityToggle(e, gl, layerId); };
      sum.appendChild(visBtn);
      rowRoot.appendChild(sum);

      if (hasCats) {
        var body = document.createElement('div');
        body.className = 'calendar-layer-body';
        var catList = document.createElement('div');
        catList.className = 'calendar-layer-categories';
        catNames.forEach(function (cat) {
          var layerOn = layer ? layer.visible !== false : true;
          var catVis = categoryStyleVisible(gl, layerId, cat);
          var row = document.createElement('div');
          row.className = 'calendar-layer-category-row' + (layerOn ? '' : ' calendar-layer-category-row-muted');
          var catLabel = document.createElement('span');
          catLabel.className = 'calendar-layer-category-label';
          catLabel.textContent = cat + (catSet[cat] ? ' · ' + catSet[cat] : '');
          var catBtn = document.createElement('button');
          catBtn.type = 'button';
          catBtn.className = 'calendar-layer-visibility-btn calendar-layer-category-visibility-btn' + (catVis ? ' is-on' : ' is-off');
          catBtn.setAttribute('aria-label', catVis ? 'Hide ' + cat : 'Show ' + cat);
          catBtn.innerHTML = calendarVisibilitySvg(catVis);
          catBtn.onclick = function (e) { calendarCategoryVisibilityToggle(e, gl, layerId, cat); };
          row.appendChild(catLabel);
          row.appendChild(catBtn);
          catList.appendChild(row);
        });
        body.appendChild(catList);
        rowRoot.appendChild(body);
      }

      listEl.appendChild(rowRoot);
    });
    refreshAtcLegend();
  }
  window.refreshCalendarLayersList = refreshCalendarLayersList;
  window.refreshAtcLegend = refreshAtcLegend;

  function linkifyText(s) {
    var text = String(s == null ? '' : s);
    if (!text) return '';
    var escaped = escapeHtml(text);
    return escaped.replace(/(https?:\/\/[^\s<]+)/gi, function(url) {
      return '<a class="event-link" href="' + url + '" target="_blank" rel="noopener noreferrer">' + url + '</a>';
    });
  }

  function getSelectedCalendarYearLocalBounds(ref) {
    if (!ref || !(ref instanceof Date) || isNaN(ref.getTime())) ref = new Date();
    var y = ref.getFullYear();
    return {
      start: new Date(y, 0, 1, 0, 0, 0, 0),
      end: new Date(y, 11, 31, 23, 59, 59, 999)
    };
  }

  function nearbyHalfSpanMs(zoom, refDate) {
    var day = 86400000;
    var hour = 3600000;
    var z = typeof zoom === 'number' && !isNaN(zoom) ? zoom : (typeof currentZoom !== 'undefined' ? currentZoom : 2);
    if (z === 7 && typeof MoonMechanics !== 'undefined' && typeof MoonMechanics.fullMoonBoundsAroundRef === 'function') {
      var ref = refDate instanceof Date && !isNaN(refDate.getTime())
        ? refDate
        : (typeof getSelectedDateTime === 'function' ? getSelectedDateTime() : new Date());
      var b = MoonMechanics.fullMoonBoundsAroundRef(ref);
      return Math.max(day, (b.t1 - b.t0) / 2);
    }
    if (z === 0) return hour / 2;
    if (z >= 9) return day;
    if (z === 8) return 30 * day;  // match circadian disk STE month-range window
    if (z >= 5) return 30 * day;
    if (z >= 3) return 120 * day;
    return 365 * day;
  }

  function getSelectedHourLocalBounds(ref) {
    if (!ref || !(ref instanceof Date) || isNaN(ref.getTime())) ref = new Date();
    var start = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), ref.getHours(), 0, 0, 0);
    return {
      start: start,
      end: new Date(start.getTime() + 3600000)
    };
  }

  function durationDaysBetweenLocal(start, end) {
    if (!start || !(start instanceof Date) || isNaN(start.getTime())) return 0;
    if (!end || !(end instanceof Date) || isNaN(end.getTime()) || end <= start) return 0;
    return (end.getTime() - start.getTime()) / 86400000;
  }

  function eventTextLabelsMinZoomForDurationDaysLocal(durationDays) {
    if (typeof EventRenderer !== 'undefined' && typeof EventRenderer.eventTextLabelsMinZoomForDurationDays === 'function') {
      return EventRenderer.eventTextLabelsMinZoomForDurationDays(durationDays);
    }
    var d = typeof durationDays === 'number' && !isNaN(durationDays) ? durationDays : 0;
    if (d > 31) return 3;
    if (d > 7) return 4;
    if (d > 0) return 5;
    return 7;
  }

  function shouldShowEventTextAtZoomLocal(start, end, zoom) {
    var z = typeof zoom === 'number' && !isNaN(zoom) ? zoom : (typeof currentZoom !== 'undefined' ? currentZoom : 2);
    var days = durationDaysBetweenLocal(start, end);
    if (typeof EventRenderer !== 'undefined' && typeof EventRenderer.eventDurationEligibleForFullListAtZoom === 'function') {
      return EventRenderer.eventDurationEligibleForFullListAtZoom(days, z);
    }
    return z >= eventTextLabelsMinZoomForDurationDaysLocal(days);
  }

  function eventDurationDaysForListItem(ev) {
    var start = ev.start;
    if (!start || !(start instanceof Date) || isNaN(start.getTime())) return 0;
    var end = ev.end && ev.end > start ? ev.end : oneDayLater(start);
    if (!end || !(end instanceof Date) || isNaN(end.getTime())) end = start;
    return durationDaysBetweenLocal(start, end);
  }

  function eventDurationEligible(days, z) {
    if (typeof EventRenderer !== 'undefined' && typeof EventRenderer.eventDurationEligibleForFullListAtZoom === 'function') {
      return EventRenderer.eventDurationEligibleForFullListAtZoom(days, z);
    }
    return eventDurationMatchesSelectedZoom(days, z);
  }

  /**
   * One duration class per viewer zoom (not the onion-union `d > 1` scene rule).
   * Year → quarters; Quarter → months; Month → weeks; Week → days–lunation; Day → ≤1d.
   */
  function eventDurationMatchesSelectedZoom(days, z) {
    var Y = 365.25;
    var zz = typeof z === 'number' && !isNaN(z) ? Math.floor(z) : 2;
    var d = typeof days === 'number' && !isNaN(days) ? days : 0;
    if (zz <= 0 || zz >= 9) return d >= 0 && d < 1;
    if (zz === 1 || zz === 2) return d > Y;
    if (zz === 3) return d > 92 && d < Y;
    if (zz === 4) return d > 31 && d <= 92;
    if (zz === 5 || zz === 6) return d > 7 && d <= 31;
    if (zz === 7) {
      var synDays = (typeof MoonMechanics !== 'undefined' && MoonMechanics.SYNODIC_MONTH_DAYS)
        ? MoonMechanics.SYNODIC_MONTH_DAYS
        : 29.530588861;
      return d > 1 && d <= synDays;
    }
    if (zz === 8) return d > 0 && d <= 1;
    return true;
  }

  function filterEventsBySelectedZoom(events, z) {
    return events.filter(function(item) {
      return eventDurationMatchesSelectedZoom(eventDurationDaysForListItem(item.ev), z);
    });
  }

  function filterLinesBySelectedZoom(lines, z) {
    return lines.filter(function(line) {
      var s = line.start;
      if (!s || !(s instanceof Date) || isNaN(s.getTime())) return false;
      var e = line.end && line.end > s ? line.end : oneDayLater(s);
      return eventDurationMatchesSelectedZoom(durationDaysBetweenLocal(s, e), z);
    });
  }

  function rangesOverlap(a0, a1, b0, b1) {
    return a1 >= b0 && a0 <= b1;
  }

  function filterEventsByTimeRange(events, t0, t1) {
    return events.filter(function(item) {
      var s = item.ev.start;
      if (!s || isNaN(s.getTime())) return false;
      var e = item.ev.end && item.ev.end > s ? item.ev.end : oneDayLater(s);
      if (!e || isNaN(e.getTime())) e = s;
      return rangesOverlap(s.getTime(), e.getTime(), t0, t1);
    });
  }

  function filterLinesByTimeRange(lines, t0, t1, defaultSpanMs) {
    return lines.filter(function(line) {
      var s = line.start instanceof Date ? line.start.getTime() : NaN;
      var e = line.end instanceof Date ? line.end.getTime() : NaN;
      if (isNaN(s)) return false;
      if (isNaN(e)) e = s + (defaultSpanMs || 86400000);
      return rangesOverlap(s, e, t0, t1);
    });
  }

  var EVENT_LIST_RING_TRACK_R = 15.915;

  function monthShort(d) {
    return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
  }

  function formatContextWindowRange(t0, t1) {
    var a = new Date(t0);
    var b = new Date(t1);
    if (isNaN(a.getTime()) || isNaN(b.getTime())) return '';
    var sameDay = a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    if (sameDay) {
      var pad = function(n) { return n < 10 ? '0' + n : String(n); };
      return monthShort(a) + ' ' + a.getDate() + '  ' + pad(a.getHours()) + ':' + pad(a.getMinutes()) + '–' + pad(b.getHours()) + ':' + pad(b.getMinutes());
    }
    var sameMonth = a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
    if (sameMonth) return monthShort(a) + ' ' + a.getDate() + '–' + b.getDate();
    if (a.getFullYear() === b.getFullYear()) return monthShort(a) + ' ' + a.getDate() + ' – ' + monthShort(b) + ' ' + b.getDate();
    return monthShort(a) + ' ' + a.getDate() + ' ' + a.getFullYear() + ' – ' + monthShort(b) + ' ' + b.getDate() + ' ' + b.getFullYear();
  }

  function getSelectedContextWindowBounds(z, ref) {
    if (typeof window.getSelectedContextArcTimeBoundsMs === 'function') {
      var b = window.getSelectedContextArcTimeBoundsMs(z, ref);
      if (b && isFinite(b.t0) && isFinite(b.t1) && b.t1 >= b.t0) return b;
    }
    if (typeof window.getListContextDiscArcTimeBoundsMs === 'function') {
      var d = window.getListContextDiscArcTimeBoundsMs(z, ref);
      if (d && isFinite(d.t0) && isFinite(d.t1) && d.t1 >= d.t0) return d;
    }
    return null;
  }

  function resolveEventsPanelZoom(fallbackZ, forcedZoom) {
    // Explicit hop wins, then live scene — never let a stale stamp stick past Z7→Z5.
    if (typeof forcedZoom === 'number' && !isNaN(forcedZoom)) {
      _eventsPanelLiveZoom = Math.floor(forcedZoom);
      return _eventsPanelLiveZoom;
    }
    if (typeof window.getCurrentZoomLevel === 'function') {
      try {
        var cz = window.getCurrentZoomLevel();
        if (typeof cz === 'number' && !isNaN(cz)) {
          _eventsPanelLiveZoom = Math.floor(cz);
          return _eventsPanelLiveZoom;
        }
      } catch (eC) { /* ignore */ }
    }
    if (typeof window.currentZoom === 'number' && !isNaN(window.currentZoom)) {
      _eventsPanelLiveZoom = Math.floor(window.currentZoom);
      return _eventsPanelLiveZoom;
    }
    if (typeof _eventsPanelLiveZoom === 'number' && !isNaN(_eventsPanelLiveZoom)) {
      return Math.floor(_eventsPanelLiveZoom);
    }
    var glZ = window.circaevumGL || (window.getGL && window.getGL());
    if (glZ && glZ.options && typeof glZ.options.zoomLevel === 'number' && !isNaN(glZ.options.zoomLevel)) {
      return Math.floor(glZ.options.zoomLevel);
    }
    var active = document.querySelector('.zoom-option.active[data-zoom]');
    if (active) {
      var dz = parseInt(active.getAttribute('data-zoom'), 10);
      if (!isNaN(dz)) return dz;
    }
    if (typeof fallbackZ === 'number' && !isNaN(fallbackZ)) return Math.floor(fallbackZ);
    return 4;
  }

  /**
   * Grain label follows scene zoom. Panel layout may still show a week/month grid
   * at Z8+ without the stretched “whole week selected” frame.
   */
  function grainNameForContextWindow(z, bounds) {
    var zl = typeof z === 'number' && !isNaN(z) ? Math.floor(z) : 4;
    if (zl === 7) return 'Week';
    if (zl === 8) return 'Day';
    if (zl === 0 || zl >= 9) return 'Day';
    if (zl === 5 || zl === 6) return 'Month';
    if (zl === 4) return 'Quarter';
    if (zl === 3) return 'Year';
    var paintZ = bounds && typeof bounds.paintZoom === 'number' ? bounds.paintZoom : null;
    if (paintZ == null && typeof window.getSelectedContextArcPaintZoom === 'function') {
      try { paintZ = window.getSelectedContextArcPaintZoom(z); } catch (eP) { paintZ = null; }
    }
    if (paintZ === 4) return 'Year';
    if (paintZ === 5) return 'Quarter';
    if (paintZ === 6 || paintZ === 7) return 'Month';
    if (paintZ === 8) return 'Week';
    return zoomDisplayName(zl);
  }

  function updateEventListHorizonRing(drawAll, z, ref, bounds) {
    var row = document.getElementById('event-list-horizon-ring-row');
    var arc = document.getElementById('event-list-horizon-arc');
    var arcInner = document.getElementById('event-list-horizon-arc-inner');
    var fill = document.getElementById('event-list-horizon-fill');
    var cap = document.getElementById('event-list-horizon-ring-caption');
    var grainEl = document.getElementById('event-list-horizon-ring-grain');
    if (!row || !arc || !cap) return;
    if (drawAll) {
      row.style.display = 'none';
      return;
    }
    row.style.display = 'flex';
    var radii = (typeof window.getListContextDiscRadiiForPanel === 'function')
      ? window.getListContextDiscRadiiForPanel(z)
      : null;
    var innerFrac = radii && radii.innerFrac > 0 ? radii.innerFrac : 0.42;
    if (arcInner) {
      arcInner.setAttribute('r', String((EVENT_LIST_RING_TRACK_R * innerFrac).toFixed(3)));
    }
    var panelArc = (typeof window.getListContextDiscArcForPanel === 'function')
      ? window.getListContextDiscArcForPanel(z)
      : null;
    var spanMs = bounds ? Math.max(0, bounds.t1 - bounds.t0) : 0;
    var len = panelArc ? panelArc.arcLen : Math.max(1.5, Math.min(100, (spanMs / (365 * 86400000)) * EVENT_LIST_RING_C));
    var gap = panelArc ? panelArc.arcGap : EVENT_LIST_RING_C - len;
    var offset = panelArc && !panelArc.fullCircle ? panelArc.arcOffset : 0;
    var dash = len + ' ' + gap;
    var dashOff = String(-offset);
    arc.setAttribute('stroke-dasharray', dash);
    arc.setAttribute('stroke-dashoffset', dashOff);
    if (fill) {
      fill.setAttribute('stroke-dasharray', dash);
      fill.setAttribute('stroke-dashoffset', dashOff);
    }
    if (arcInner) {
      arcInner.setAttribute('stroke-dasharray', dash);
      arcInner.setAttribute('stroke-dashoffset', dashOff);
    }
    if (grainEl) grainEl.textContent = grainNameForContextWindow(z, bounds);
    cap.textContent = bounds ? formatContextWindowRange(bounds.t0, bounds.t1) : '';
  }

  function eventColorToRgbaPanelBackground(color, layerHex, alphaStrong, alphaWeak, inList) {
    var raw = color || layerHex || '#00b4d8';
    var t = String(raw).trim();
    var r = 0, g = 180, b = 216;
    var m6 = t.match(/^#([0-9a-f]{6})$/i);
    var m3 = t.match(/^#([0-9a-f]{3})$/i);
    if (m6) {
      r = parseInt(m6[1].slice(0, 2), 16);
      g = parseInt(m6[1].slice(2, 4), 16);
      b = parseInt(m6[1].slice(4, 6), 16);
    } else if (m3) {
      r = parseInt(m3[1][0] + m3[1][0], 16);
      g = parseInt(m3[1][1] + m3[1][1], 16);
      b = parseInt(m3[1][2] + m3[1][2], 16);
    } else if (/^rgba?\(/i.test(t)) {
      var nums = t.replace(/rgba?\(/i, '').replace(/\)/, '').split(',');
      if (nums.length >= 3) {
        r = parseInt(nums[0], 10) || 0;
        g = parseInt(nums[1], 10) || 0;
        b = parseInt(nums[2], 10) || 0;
      }
    }
    var a = inList ? alphaStrong : alphaWeak;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  function updateEventFocusClearButton() {
    var btn = document.getElementById('events-focus-clear-btn');
    if (!btn) return;
    var gl = window.circaevumGL || (window.getGL && window.getGL());
    var evFocus = gl && typeof gl.getEventFocus === 'function' ? gl.getEventFocus() : null;
    btn.style.display = evFocus && evFocus.uid ? 'inline-block' : 'none';
  }

  function clearEventFocus() {
    if (typeof window.closeMobileEventDetailSheet === 'function') {
      window.closeMobileEventDetailSheet();
    }
    var gl = window.circaevumGL || (window.getGL && window.getGL());
    if (!gl || typeof gl.setEventHighlight !== 'function') return;
    var cur = typeof gl.getEventFocus === 'function' ? gl.getEventFocus() : null;
    if (!cur || !cur.uid) return;
    gl.setEventHighlight(cur.layerId, null);
    updateEventFocusClearButton();
  }
  window.clearEventFocus = clearEventFocus;
  window.updateEventFocusClearButton = updateEventFocusClearButton;

  function findEventListRow(layerId, uid) {
    var listEl = document.getElementById('events-panel-list');
    if (!listEl || !layerId || uid == null || String(uid).trim() === '') return null;
    var uidStr = String(uid);
    var rows = listEl.querySelectorAll('.event-row');
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (row.getAttribute('data-event-layer') === layerId && row.getAttribute('data-event-uid') === uidStr) {
        return row;
      }
    }
    return null;
  }

  /** Scroll the event list panel so the focused event row is visible. @returns {boolean} */
  function scrollEventListToFocusedEvent() {
    var listEl = document.getElementById('events-panel-list');
    if (!listEl) return false;
    var gl = window.circaevumGL || (window.getGL && window.getGL());
    var evFocus = gl && typeof gl.getEventFocus === 'function' ? gl.getEventFocus() : null;
    if (!evFocus || !evFocus.uid) return false;
    var row = findEventListRow(evFocus.layerId, evFocus.uid);
    if (!row) return false;
    var rowTop = row.offsetTop;
    var rowH = row.offsetHeight;
    var viewH = listEl.clientHeight;
    var target = rowTop - Math.max(0, (viewH - rowH) / 2);
    listEl.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
    return true;
  }
  window.scrollEventListToFocusedEvent = scrollEventListToFocusedEvent;

  function syncEventListFocusHighlightRows() {
    var gl = window.circaevumGL || (window.getGL && window.getGL());
    var evFocus = gl && typeof gl.getEventFocus === 'function' ? gl.getEventFocus() : null;
    var listEl = document.getElementById('events-panel-list');
    if (!listEl) return;
    var rows = listEl.querySelectorAll('.event-row');
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      row.classList.remove('event-row--focus-selected', 'event-row--focus-dim');
      if (!evFocus || !evFocus.uid) continue;
      var lid = row.getAttribute('data-event-layer');
      var uid = row.getAttribute('data-event-uid');
      if (lid === evFocus.layerId && uid === String(evFocus.uid)) row.classList.add('event-row--focus-selected');
      else row.classList.add('event-row--focus-dim');
    }
    updateEventFocusClearButton();
  }
  window.syncEventListFocusHighlightRows = syncEventListFocusHighlightRows;

  window.syncEventListFocusHighlightRows = syncEventListFocusHighlightRows;

  var eventListSearchQuery = '';

  function gatherAllLoadedEvents(gl) {
    var events = [];
    if (!gl || typeof gl.getEventObjects !== 'function') return events;
    if (typeof gl.getLayerIds === 'function') {
      gl.getLayerIds().forEach(function(lid) {
        (gl.getEventObjects(lid) || []).forEach(function(o) { events.push({ layerId: lid, ev: o }); });
      });
    } else {
      (gl.getEventObjects(USER_EVENTS_LAYER) || []).forEach(function(o) {
        events.push({ layerId: USER_EVENTS_LAYER, ev: o });
      });
    }
    return events.filter(function(item) {
      var cat = item.ev && item.ev.category != null ? String(item.ev.category).trim() : '';
      if (!cat) cat = 'Default';
      return categoryVisibleInLayer(gl, item.layerId, cat);
    });
  }

  function eventMatchesSearchQuery(ev, q) {
    if (!q) return true;
    var hay = [
      ev.summary,
      ev.description,
      ev.location,
      ev.url,
      ev.category,
      ev.uid,
      ev.id
    ].filter(function(v) { return v != null && String(v).trim() !== ''; }).join(' ').toLowerCase();
    return hay.indexOf(q) >= 0;
  }

  function listTimeBoundsMs(z, ref) {
    var halfMs = nearbyHalfSpanMs(z, ref);
    var yearBounds = getSelectedCalendarYearLocalBounds(ref);
    if (z === 0) {
      var hourBounds = getSelectedHourLocalBounds(ref);
      return { t0: hourBounds.start.getTime(), t1: hourBounds.end.getTime() };
    }
    if (z === 3 || z === 4) {
      return { t0: yearBounds.start.getTime(), t1: yearBounds.end.getTime() };
    }
    var t0;
    var t1;
    if (z === 7 && typeof MoonMechanics !== 'undefined' && typeof MoonMechanics.fullMoonBoundsAroundRef === 'function') {
      var moonBounds = MoonMechanics.fullMoonBoundsAroundRef(ref);
      t0 = moonBounds.t0;
      t1 = moonBounds.t1;
    } else {
      t0 = ref.getTime() - halfMs;
      t1 = ref.getTime() + halfMs;
    }
    if (z >= 5) {
      t0 = Math.max(t0, yearBounds.start.getTime());
      t1 = Math.min(t1, yearBounds.end.getTime());
    }
    return { t0: t0, t1: t1 };
  }

  function eventIncludedInDefaultList(item, z, ref) {
    var ev = item.ev;
    var s = ev.start;
    if (!s || isNaN(s.getTime())) return false;
    var e = ev.end && ev.end > s ? ev.end : oneDayLater(s);
    if (!e || isNaN(e.getTime())) e = s;
    var bounds = getSelectedContextWindowBounds(z, ref);
    if (!bounds) return false;
    if (!rangesOverlap(s.getTime(), e.getTime(), bounds.t0, bounds.t1)) return false;
    return eventDurationMatchesSelectedZoom(eventDurationDaysForListItem(ev), z);
  }

  function createEventListRow(gl, item, opts) {
    opts = opts || {};
    var z = opts.z != null ? opts.z : (typeof currentZoom !== 'undefined' ? currentZoom : 2);
    var drawAll = !!opts.drawAll;
    var evFocus = opts.evFocus;
    var metaExtra = opts.metaExtra || '';
    var forceInList = opts.forceInList;
    var rowClassExtra = opts.rowClassExtra || '';
    var titleOverride = opts.titleOverride;

    var ev = item.ev;
    var start = ev.start;
    if (!start || !(start instanceof Date) || isNaN(start.getTime())) return null;
    var end = ev.end;
    var name = ev.summary || ev.uid || 'Event';
    var inList = forceInList != null
      ? !!forceInList
      : (!!drawAll || shouldShowEventTextAtZoomLocal(ev.start, ev.end && ev.end > start ? ev.end : null, z));
    var row = document.createElement('div');
    var rowUidStr = String(ev.uid || ev.id || '');
    row.className = 'event-row' + (inList ? ' event-row--in-list' : ' event-row--outside-list') + (rowClassExtra ? ' ' + rowClassExtra : '');
    row.setAttribute('data-event-layer', item.layerId || '');
    row.setAttribute('data-event-uid', rowUidStr);
    if (evFocus && evFocus.uid) {
      var matchFocus = evFocus.layerId === item.layerId && String(evFocus.uid) === rowUidStr;
      if (matchFocus) row.classList.add('event-row--focus-selected');
      else row.classList.add('event-row--focus-dim');
    }
    var layer = gl.getLayer ? gl.getLayer(item.layerId) : null;
    var borderColor = ev.color || ev.colorId || layerSwatchColor(layer) || 'rgba(0, 180, 216, 0.5)';
    row.style.cssText = 'padding:10px 12px;margin-bottom:8px;border-radius:8px;cursor:pointer;border-left:' + (inList ? '4px' : '3px') + ' solid ' + borderColor + ';background:' + eventColorToRgbaPanelBackground(ev.color || ev.colorId, layerSwatchColor(layer), 0.22, 0.09, inList) + ';' + (inList ? '' : 'opacity:0.5;filter:saturate(0.4) brightness(0.92);');
    row.title = titleOverride || (inList
      ? 'Click to focus; click again or Clear selection / Esc / empty scene to unselect.'
      : 'In the time window but hidden until you zoom in (same dimming as the 3D view). Click to focus.');
    var details = [];
    if (ev.location) details.push('<div class="event-detail event-location">' + linkifyText(ev.location) + '</div>');
    if (ev.description) {
      var rawDesc = ev.description;
      var shortDesc = rawDesc.length > 120 ? rawDesc.slice(0, 120).trimEnd() + '…' : rawDesc;
      details.push('<div class="event-detail event-description">' + linkifyText(shortDesc) + '</div>');
    }
    if (ev.url) details.push('<div class="event-detail event-url"><a class="event-link" href="' + escapeHtml(ev.url) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(ev.url) + '</a></div>');
    var metaLine = formatDate(start) + (end ? ' → ' + formatDate(end) : '') + metaExtra;
    row.innerHTML = '<div class="event-title">' + escapeHtml(name) + '</div><div class="event-meta">' + metaLine + '</div>' + details.join('') + '<button type="button" class="events-panel-edit-btn edit-line-btn">Edit</button>';
    row.onclick = function() {
      focusCalendarEvent(gl, item);
    };
    row.querySelectorAll('a').forEach(function(a) { a.onclick = function(e) { e.stopPropagation(); }; });
    var editBtn = row.querySelector('.events-panel-edit-btn');
    if (editBtn && window.self !== window.top && window.parent.postMessage) {
      editBtn.onclick = function(e) {
        e.stopPropagation();
        window.parent.postMessage({
          type: 'CIRCAEVUM_EDIT_EVENT',
          event: {
            uid: ev.uid || ev.id,
            key: ev.key,
            summary: ev.summary || name,
            description: ev.description || null,
            location: ev.location || null,
            url: ev.url || null,
            color: ev.color || ev.colorId || null,
            layerId: item.layerId || USER_EVENTS_LAYER,
            dtstart: ev.dtstart || { dateTime: start.toISOString() },
            dtend: ev.dtend || (end && end > start ? { dateTime: end.toISOString() } : { dateTime: new Date(start.getTime() + 86400000).toISOString() }),
            isTrip: ev.isTrip === true,
            isWorkEvent: ev.isWorkEvent === true
          }
        }, '*');
      };
    } else if (editBtn) editBtn.style.display = 'none';
    return row;
  }

  function renderEventListSearchResults(listEl, ctxEl, gl, searchQ, ref, z) {
    var all = gatherAllLoadedEvents(gl);
    var matches = all.filter(function(item) { return eventMatchesSearchQuery(item.ev, searchQ); });
    matches.sort(function(a, b) {
      var as = a.ev && a.ev.start instanceof Date ? a.ev.start.getTime() : 0;
      var bs = b.ev && b.ev.start instanceof Date ? b.ev.start.getTime() : 0;
      return as - bs;
    });
    if (ctxEl) {
      ctxEl.textContent = matches.length
        ? ('Search “' + searchQ + '”: ' + matches.length + ' of ' + all.length + ' loaded events (ignores list time window).')
        : ('No events match “' + searchQ + '” among ' + all.length + ' loaded events.');
    }
    updateEventListHorizonRing(true, z, 0, ref);
    if (!matches.length) {
      listEl.innerHTML = '<p class="event-horizon-empty">No matches. Check spelling or clear the search.</p>';
      updateEventFocusClearButton();
      return;
    }
    var evFocus = (typeof gl.getEventFocus === 'function' ? gl.getEventFocus() : null);
    matches.forEach(function(item) {
      var inWindow = eventIncludedInDefaultList(item, z, ref);
      var metaExtra = '';
      var row = createEventListRow(gl, item, {
        z: z,
        drawAll: false,
        evFocus: evFocus,
        metaExtra: metaExtra,
        forceInList: inWindow
      });
      if (row) listEl.appendChild(row);
    });
    updateEventFocusClearButton();
    requestAnimationFrame(function() {
      if (evFocus && evFocus.uid && scrollEventListToFocusedEvent()) return;
    });
  }

  function getContextCalendarPaintZoom(z) {
    if (typeof window.getSelectedContextArcPaintZoom === 'function') {
      return window.getSelectedContextArcPaintZoom(z);
    }
    return typeof z === 'number' && !isNaN(z) ? Math.floor(z) : 5;
  }

  /** @deprecated Prefer getEventsPanelBaseFrame(sceneZ).layout */
  function getContextCalendarKind(z) {
    return getEventsPanelBaseFrame(z).layout;
  }

  function startOfLocalDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  }

  function endOfLocalDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  }

  function dayKeyLocal(d) {
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }

  function monthKeyLocal(d) {
    var m = d.getMonth() + 1;
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m;
  }

  function eventSpanMs(item) {
    var s = item.ev && item.ev.start;
    if (!s || !(s instanceof Date) || isNaN(s.getTime())) return null;
    var e = item.ev.end && item.ev.end > s ? item.ev.end : oneDayLater(s);
    if (!e || !(e instanceof Date) || isNaN(e.getTime())) e = s;
    return { t0: s.getTime(), t1: e.getTime(), start: s, end: e };
  }

  /** Nest DUR_SUPER_MONTH — long spans become calendar outlines, not daily chips. */
  var CTX_CAL_SUPER_MONTH_DAYS = 31;

  function eventDurationDaysLocal(item) {
    var span = eventSpanMs(item);
    if (!span) return 0;
    return Math.max(0, (span.t1 - span.t0) / 86400000);
  }

  function isSuperMonthCalendarItem(item) {
    return eventDurationDaysLocal(item) > CTX_CAL_SUPER_MONTH_DAYS;
  }

  function partitionCalendarEvents(events) {
    var dayItems = [];
    var spanItems = [];
    (events || []).forEach(function(item) {
      if (isSuperMonthCalendarItem(item)) spanItems.push(item);
      else dayItems.push(item);
    });
    return { dayItems: dayItems, spanItems: spanItems };
  }

  function formatSpanRangeLabel(span) {
    if (!span) return '';
    var a = new Date(span.t0);
    var b = new Date(span.t1);
    return monthShort(a) + ' ' + a.getDate() + ' – ' + monthShort(b) + ' ' + b.getDate();
  }

  /** One outline row per super-month event (no daily chip spam). */
  function appendSuperMonthSpanOutlines(host, gl, spanItems, monthStartMs, monthEndMs, evFocus) {
    if (!spanItems || !spanItems.length) return;
    var box = document.createElement('div');
    box.className = 'ctx-cal-spans';
    spanItems.forEach(function(item) {
      var span = eventSpanMs(item);
      if (!span) return;
      if (span.t1 < monthStartMs || span.t0 > monthEndMs) return;
      var clip0 = Math.max(span.t0, monthStartMs);
      var clip1 = Math.min(span.t1, monthEndMs);
      var monthLen = Math.max(1, monthEndMs - monthStartMs);
      var leftPct = ((clip0 - monthStartMs) / monthLen) * 100;
      var widthPct = Math.max(2.5, ((clip1 - clip0) / monthLen) * 100);
      var name = (item.ev && (item.ev.summary || item.ev.uid)) || 'Event';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ctx-cal-span-bar';
      var uid = String((item.ev && (item.ev.uid || item.ev.id)) || '');
      if (evFocus && evFocus.uid && String(evFocus.uid) === uid && evFocus.layerId === item.layerId) {
        btn.classList.add('ctx-cal-span-bar--focus');
      }
      btn.style.borderLeftColor = eventChipColor(gl, item);
      btn.style.setProperty('--span-left', leftPct.toFixed(2) + '%');
      btn.style.setProperty('--span-width', widthPct.toFixed(2) + '%');
      btn.title = name + ' · ' + formatSpanRangeLabel(span);
      btn.innerHTML =
        '<span class="ctx-cal-span-bar-track" aria-hidden="true"></span>' +
        '<span class="ctx-cal-span-bar-label">' + escapeHtml(name.length > 36 ? name.slice(0, 34) + '…' : name) + '</span>' +
        '<span class="ctx-cal-span-bar-meta">' + escapeHtml(formatSpanRangeLabel({ t0: clip0, t1: clip1 })) + '</span>';
      btn.onclick = function(e) {
        e.stopPropagation();
        focusCalendarEvent(gl, item);
      };
      box.appendChild(btn);
    });
    if (box.childNodes.length) host.appendChild(box);
  }

  function markCellsUnderSuperMonthSpans(grid, year, month, startPad, daysInMonth, spanItems) {
    if (!grid || !spanItems || !spanItems.length) return;
    var monthStart = new Date(year, month, 1, 0, 0, 0, 0).getTime();
    var monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999).getTime();
    var cells = grid.querySelectorAll ? grid.querySelectorAll('.ctx-cal-cell') : grid.children;
    for (var i = 0; i < cells.length; i++) {
      var dayNum = i - startPad + 1;
      if (dayNum < 1 || dayNum > daysInMonth) continue;
      var dayStart = new Date(year, month, dayNum, 0, 0, 0, 0).getTime();
      var dayEnd = new Date(year, month, dayNum, 23, 59, 59, 999).getTime();
      for (var s = 0; s < spanItems.length; s++) {
        var span = eventSpanMs(spanItems[s]);
        if (!span) continue;
        if (span.t1 < monthStart || span.t0 > monthEnd) continue;
        if (rangesOverlap(span.t0, span.t1, dayStart, dayEnd)) {
          cells[i].classList.add('ctx-cal-cell--span-wash');
          break;
        }
      }
    }
  }

  function eventsOverlappingRange(events, t0, t1) {
    return events.filter(function(item) {
      var span = eventSpanMs(item);
      if (!span) return false;
      return rangesOverlap(span.t0, span.t1, t0, t1);
    });
  }

  function focusCalendarEvent(gl, item) {
    if (!item || !item.ev) return;
    var ev = item.ev;
    var start = ev.start;
    if (!start || !(start instanceof Date) || isNaN(start.getTime())) return;
    var end = ev.end && ev.end > start ? ev.end : oneDayLater(start);
    var lid = item.layerId || USER_EVENTS_LAYER;
    var rowUidStr = String(ev.uid || ev.id || '');
    setCircaevumSelectedLayerId(lid);
    var curFocus = typeof gl.getEventFocus === 'function' ? gl.getEventFocus() : null;
    if (
      rowUidStr &&
      typeof gl.setEventHighlight === 'function' &&
      curFocus &&
      curFocus.uid &&
      curFocus.layerId === lid &&
      String(curFocus.uid) === rowUidStr
    ) {
      gl.setEventHighlight(lid, null);
      updateEventFocusClearButton();
      if (typeof window.closeMobileEventDetailSheet === 'function') {
        window.closeMobileEventDetailSheet();
      }
      return;
    }
    if (rowUidStr && typeof gl.setEventHighlight === 'function') {
      gl.setEventHighlight(lid, rowUidStr);
    }
    updateEventFocusClearButton();
    navigateToEvent(start, end);
    if (typeof window.showMobileEventDetailSheet === 'function') {
      window.showMobileEventDetailSheet({
        vevent: ev,
        layerId: lid,
        start: start,
        end: end
      });
    }
  }

  function eventChipColor(gl, item) {
    var layer = gl.getLayer ? gl.getLayer(item.layerId) : null;
    return item.ev.color || item.ev.colorId || layerSwatchColor(layer) || '#22d3ee';
  }

  function appendEventChips(host, gl, items, evFocus, maxChips) {
    var max = maxChips != null ? maxChips : 3;
    var shown = items.slice(0, max);
    shown.forEach(function(item) {
      var name = (item.ev && (item.ev.summary || item.ev.uid)) || 'Event';
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'ctx-cal-chip';
      var uid = String((item.ev && (item.ev.uid || item.ev.id)) || '');
      if (evFocus && evFocus.uid && String(evFocus.uid) === uid && evFocus.layerId === item.layerId) {
        chip.classList.add('ctx-cal-chip--focus');
      }
      chip.style.borderLeftColor = eventChipColor(gl, item);
      chip.textContent = name.length > 28 ? name.slice(0, 26) + '…' : name;
      chip.title = name;
      chip.onclick = function(e) {
        e.stopPropagation();
        focusCalendarEvent(gl, item);
      };
      host.appendChild(chip);
    });
    if (items.length > max) {
      var more = document.createElement('div');
      more.className = 'ctx-cal-chip-more';
      more.textContent = '+' + (items.length - max);
      host.appendChild(more);
    }
  }

  function makeCalTitle(text) {
    var el = document.createElement('div');
    el.className = 'ctx-cal-title';
    el.textContent = text;
    return el;
  }

  function weekdayHeaderRow() {
    var row = document.createElement('div');
    row.className = 'ctx-cal-weekdays';
    ['S', 'M', 'T', 'W', 'T', 'F', 'S'].forEach(function(lab) {
      var c = document.createElement('div');
      c.className = 'ctx-cal-weekday';
      c.textContent = lab;
      row.appendChild(c);
    });
    return row;
  }

  function isSameLocalDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function buildMonthDayGrid(gl, year, month, events, ref, windowBounds, evFocus, opts) {
    var options = opts || {};
    var connectMultiDay = !!options.connectMultiDay;
    var stretchSelectedWeek = !!options.stretchSelectedWeek;
    // Z8+/0: keep vertical week stretch; cyan chrome on Selected day only (not whole week).
    var daySelectOnly = !!options.daySelectOnly;
    var wrap = document.createElement('div');
    wrap.className = 'ctx-cal-month' + (connectMultiDay ? ' ctx-cal-month--span-days' : '');
    if (stretchSelectedWeek) wrap.classList.add('ctx-cal-month--week-focus');
    if (daySelectOnly) wrap.classList.add('ctx-cal-month--day-select');
    wrap.setAttribute('data-ctx-cal-ym', year + '-' + month);
    if (ref && ref.getFullYear() === year && ref.getMonth() === month) {
      wrap.classList.add('ctx-cal-month--selected-time');
    }
    wrap.appendChild(makeCalTitle(monthShort(new Date(year, month, 1)) + ' ' + year));
    var parts = partitionCalendarEvents(events);
    var monthStartMs = new Date(year, month, 1, 0, 0, 0, 0).getTime();
    var monthEndMs = new Date(year, month + 1, 0, 23, 59, 59, 999).getTime();
    appendSuperMonthSpanOutlines(wrap, gl, parts.spanItems, monthStartMs, monthEndMs, evFocus);

    var multiDayItems = [];
    var singleDayItems = [];
    if (connectMultiDay) {
      (parts.dayItems || []).forEach(function(item) {
        if (eventDurationDaysLocal(item) > 1) multiDayItems.push(item);
        else singleDayItems.push(item);
      });
    } else {
      singleDayItems = parts.dayItems || [];
    }

    wrap.appendChild(weekdayHeaderRow());
    var first = new Date(year, month, 1);
    var startPad = first.getDay();
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var totalCells = Math.ceil((startPad + daysInMonth) / 7) * 7;
    var weekCount = totalCells / 7;
    var w0 = windowBounds ? windowBounds.t0 : -Infinity;
    var w1 = windowBounds ? windowBounds.t1 : Infinity;
    // Stretch + day-select: chips for whole month. Else clip to cyan window.
    var chipW0 = (stretchSelectedWeek || daySelectOnly) ? monthStartMs : w0;
    var chipW1 = (stretchSelectedWeek || daySelectOnly) ? monthEndMs : w1;
    var selectedWeekIdx = -1;
    if (ref && (stretchSelectedWeek || daySelectOnly)) {
      selectedWeekIdx = Math.floor((startPad + (ref.getDate() - 1)) / 7);
      if (ref.getFullYear() !== year || ref.getMonth() !== month) {
        selectedWeekIdx = -1;
        var refDay = startOfLocalDay(ref).getTime();
        for (var wi = 0; wi < weekCount; wi++) {
          var ws = new Date(year, month, 1 - startPad + wi * 7, 0, 0, 0, 0).getTime();
          var we = ws + 7 * 86400000 - 1;
          if (refDay >= ws && refDay <= we) {
            selectedWeekIdx = wi;
            break;
          }
        }
      }
    }
    var weeksHost = document.createElement('div');
    weeksHost.className = 'ctx-cal-month-weeks';
    var selectedWeekEl = null;

    for (var week = 0; week < weekCount; week++) {
      var weekBlock = document.createElement('div');
      weekBlock.className = 'ctx-cal-month-week';
      var stretchThisWeek = stretchSelectedWeek && week === selectedWeekIdx;
      // Week cyan outline only at Z7; Z8 keeps --selected-context for stretch layout.
      var weekCyanChrome = stretchThisWeek && !daySelectOnly;
      if (stretchThisWeek) {
        weekBlock.classList.add('ctx-cal-month-week--selected-context');
        selectedWeekEl = weekBlock;
      }
      if (daySelectOnly && week === selectedWeekIdx) {
        weekBlock.classList.add('ctx-cal-month-week--has-selected-day');
        if (!selectedWeekEl) selectedWeekEl = weekBlock;
      }
      var daysRow = document.createElement('div');
      daysRow.className = 'ctx-cal-grid ctx-cal-grid--month';
      for (var dow = 0; dow < 7; dow++) {
        var i = week * 7 + dow;
        var dayNum = i - startPad + 1;
        var cellDate = new Date(year, month, dayNum);
        var inMonth = dayNum >= 1 && dayNum <= daysInMonth;
        var cell = document.createElement('div');
        cell.className = 'ctx-cal-cell';
        if (!inMonth) cell.classList.add('ctx-cal-cell--outside');
        var dayStart = startOfLocalDay(cellDate);
        var dayEnd = endOfLocalDay(cellDate);
        var inChipWindow = dayEnd.getTime() >= chipW0 && dayStart.getTime() <= chipW1;
        var inCyanWeek = dayEnd.getTime() >= w0 && dayStart.getTime() <= w1;
        if (inMonth && !inChipWindow) cell.classList.add('ctx-cal-cell--outside-window');
        // Dim outside cyan week only when the week itself is the selection (Z7).
        if (inMonth && weekCyanChrome && !inCyanWeek) cell.classList.add('ctx-cal-cell--outside-week-context');
        if (inMonth && isSameLocalDay(cellDate, ref)) cell.classList.add('ctx-cal-cell--selected');
        if (weekCyanChrome && inMonth) cell.classList.add('ctx-cal-cell--in-selected-week');
        var head = document.createElement('div');
        head.className = 'ctx-cal-cell-num';
        head.textContent = String(cellDate.getDate());
        cell.appendChild(head);
        if (inMonth && inChipWindow) {
          var dayEvents = eventsOverlappingRange(singleDayItems, dayStart.getTime(), dayEnd.getTime());
          var chips = document.createElement('div');
          chips.className = 'ctx-cal-cell-chips';
          appendEventChips(chips, gl, dayEvents, evFocus, stretchThisWeek ? 6 : (connectMultiDay ? 2 : 3));
          cell.appendChild(chips);
          cell.onclick = (function(d0, d1) {
            return function() { navigateToCalendarDay(d0, d1); };
          })(dayStart, dayEnd);
        }
        daysRow.appendChild(cell);
      }
      weekBlock.appendChild(daysRow);
      if (connectMultiDay && multiDayItems.length) {
        appendWeekMultiDayBarsInDayGrid(
          daysRow, gl, multiDayItems, year, month, week, startPad, daysInMonth, evFocus, monthStartMs, monthEndMs
        );
      }
      weeksHost.appendChild(weekBlock);
    }
    markCellsUnderSuperMonthSpans(weeksHost, year, month, startPad, daysInMonth, parts.spanItems);
    wrap.appendChild(weeksHost);
    if (selectedWeekEl) wrap._ctxCalSelectedWeekEl = selectedWeekEl;
    return wrap;
  }

  /**
   * Multi-day bars live inside the day-cell grid (bottom of the week row),
   * not on a between-week lane — so they clearly belong to those days.
   */
  function appendWeekMultiDayBarsInDayGrid(daysRow, gl, items, year, month, week, startPad, daysInMonth, evFocus, monthStartMs, monthEndMs) {
    if (!daysRow) return;
    daysRow.classList.add('ctx-cal-grid--with-multiday');
    var weekStartIdx = week * 7;
    var weekEndIdx = weekStartIdx + 6;
    var lane = 0;
    items.forEach(function(item) {
      var span = eventSpanMs(item);
      if (!span) return;
      if (span.t1 < monthStartMs || span.t0 > monthEndMs) return;
      var clip0 = Math.max(span.t0, monthStartMs);
      var clip1 = Math.min(span.t1, monthEndMs);
      var d0 = new Date(clip0);
      var d1 = new Date(clip1);
      var dayStart = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate(), 0, 0, 0, 0);
      var dayEnd = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate(), 0, 0, 0, 0);
      if (d1.getHours() === 0 && d1.getMinutes() === 0 && d1.getSeconds() === 0 && d1.getMilliseconds() === 0 && clip1 > clip0) {
        dayEnd = new Date(dayEnd.getTime() - 86400000);
      }
      if (dayEnd < dayStart) dayEnd = dayStart;

      var segLo = null;
      var segHi = null;
      for (var t = new Date(dayStart.getTime()); t <= dayEnd; t = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1)) {
        if (t.getMonth() !== month || t.getFullYear() !== year) continue;
        var dayNum = t.getDate();
        if (dayNum < 1 || dayNum > daysInMonth) continue;
        var cellIdx = startPad + (dayNum - 1);
        if (cellIdx < weekStartIdx || cellIdx > weekEndIdx) continue;
        var dow = cellIdx % 7;
        if (segLo == null) segLo = dow;
        segHi = dow;
      }
      if (segLo == null) return;
      var name = (item.ev && (item.ev.summary || item.ev.uid)) || 'Event';
      var uid = String((item.ev && (item.ev.uid || item.ev.id)) || '');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ctx-cal-multiday-bar ctx-cal-multiday-bar--in-cells';
      if (evFocus && evFocus.uid && String(evFocus.uid) === uid && evFocus.layerId === item.layerId) {
        btn.classList.add('ctx-cal-multiday-bar--focus');
      }
      btn.style.borderLeftColor = eventChipColor(gl, item);
      var leftPct = (segLo / 7) * 100;
      var widthPct = ((segHi - segLo + 1) / 7) * 100;
      btn.style.left = 'calc(' + leftPct.toFixed(3) + '% + 2px)';
      btn.style.width = 'calc(' + widthPct.toFixed(3) + '% - 4px)';
      btn.style.bottom = (4 + lane * 15) + 'px';
      btn.title = name + ' · ' + formatSpanRangeLabel(span);
      btn.textContent = name.length > 32 ? name.slice(0, 30) + '…' : name;
      btn.onclick = (function(it) {
        return function(e) {
          e.stopPropagation();
          focusCalendarEvent(gl, it);
        };
      })(item);
      daysRow.appendChild(btn);
      lane = Math.min(lane + 1, 2);
    });
    if (lane > 0) {
      daysRow.style.setProperty('--ctx-multiday-lanes', String(lane));
    }
  }

  function buildYearMonthGrid(gl, year, events, ref, windowBounds, evFocus) {
    var wrap = document.createElement('div');
    wrap.className = 'ctx-cal-year';
    wrap.appendChild(makeCalTitle(String(year)));
    var parts = partitionCalendarEvents(events);
    var yearStartMs = new Date(year, 0, 1, 0, 0, 0, 0).getTime();
    var yearEndMs = new Date(year, 11, 31, 23, 59, 59, 999).getTime();
    appendSuperMonthSpanOutlines(wrap, gl, parts.spanItems, yearStartMs, yearEndMs, evFocus);
    var grid = document.createElement('div');
    grid.className = 'ctx-cal-grid ctx-cal-grid--year';
    for (var m = 0; m < 12; m++) {
      var mStart = new Date(year, m, 1, 0, 0, 0, 0);
      var mEnd = new Date(year, m + 1, 0, 23, 59, 59, 999);
      var cell = document.createElement('div');
      cell.className = 'ctx-cal-cell ctx-cal-cell--month-tile';
      if (ref.getFullYear() === year && ref.getMonth() === m) cell.classList.add('ctx-cal-cell--selected');
      var w0 = windowBounds ? windowBounds.t0 : -Infinity;
      var w1 = windowBounds ? windowBounds.t1 : Infinity;
      if (mEnd.getTime() < w0 || mStart.getTime() > w1) cell.classList.add('ctx-cal-cell--outside-window');
      var head = document.createElement('div');
      head.className = 'ctx-cal-cell-num';
      head.textContent = monthShort(mStart);
      cell.appendChild(head);
      var monthEvents = eventsOverlappingRange(parts.dayItems, mStart.getTime(), mEnd.getTime());
      var chips = document.createElement('div');
      chips.className = 'ctx-cal-cell-chips';
      appendEventChips(chips, gl, monthEvents, evFocus, 2);
      cell.appendChild(chips);
      cell.onclick = (function(a, b) {
        return function() { navigateToEvent(a, b); };
      })(mStart, mEnd);
      grid.appendChild(cell);
    }
    wrap.appendChild(grid);
    return wrap;
  }

  function buildWeekGrid(gl, weekStart, events, ref, windowBounds, evFocus) {
    var wrap = document.createElement('div');
    wrap.className = 'ctx-cal-week';
    var weekEnd = new Date(weekStart.getTime() + 6 * 86400000);
    wrap.appendChild(makeCalTitle(
      monthShort(weekStart) + ' ' + weekStart.getDate() + ' – ' + monthShort(weekEnd) + ' ' + weekEnd.getDate()
    ));
    var parts = partitionCalendarEvents(events);
    var weekStartMs = startOfLocalDay(weekStart).getTime();
    var weekEndMs = endOfLocalDay(weekEnd).getTime();
    appendSuperMonthSpanOutlines(wrap, gl, parts.spanItems, weekStartMs, weekEndMs, evFocus);
    var grid = document.createElement('div');
    grid.className = 'ctx-cal-grid ctx-cal-grid--week';
    for (var i = 0; i < 7; i++) {
      var day = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i);
      var dayStart = startOfLocalDay(day);
      var dayEnd = endOfLocalDay(day);
      var cell = document.createElement('div');
      cell.className = 'ctx-cal-cell ctx-cal-cell--week-day';
      if (isSameLocalDay(day, ref)) cell.classList.add('ctx-cal-cell--selected');
      var head = document.createElement('div');
      head.className = 'ctx-cal-cell-num';
      head.textContent = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day.getDay()] + ' ' + day.getDate();
      cell.appendChild(head);
      var dayEvents = eventsOverlappingRange(parts.dayItems, dayStart.getTime(), dayEnd.getTime());
      var chips = document.createElement('div');
      chips.className = 'ctx-cal-cell-chips';
      appendEventChips(chips, gl, dayEvents, evFocus, 8);
      cell.appendChild(chips);
      cell.onclick = (function(a, b) {
        return function() { navigateToEvent(a, b); };
      })(dayStart, dayEnd);
      grid.appendChild(cell);
    }
    wrap.appendChild(grid);
    return wrap;
  }

  function buildDayHourGrid(gl, day, events, ref, evFocus) {
    var wrap = document.createElement('div');
    wrap.className = 'ctx-cal-day';
    wrap.appendChild(makeCalTitle(monthShort(day) + ' ' + day.getDate() + ', ' + day.getFullYear()));
    var parts = partitionCalendarEvents(events);
    var dayStartMs = startOfLocalDay(day).getTime();
    var dayEndMs = endOfLocalDay(day).getTime();
    appendSuperMonthSpanOutlines(wrap, gl, parts.spanItems, dayStartMs, dayEndMs, evFocus);
    var grid = document.createElement('div');
    grid.className = 'ctx-cal-grid ctx-cal-grid--day';
    for (var h = 0; h < 24; h++) {
      var h0 = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, 0, 0, 0);
      var h1 = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, 59, 59, 999);
      var cell = document.createElement('div');
      cell.className = 'ctx-cal-cell ctx-cal-cell--hour';
      if (isSameLocalDay(day, ref) && ref.getHours() === h) cell.classList.add('ctx-cal-cell--selected');
      var head = document.createElement('div');
      head.className = 'ctx-cal-cell-num';
      head.textContent = (h < 10 ? '0' : '') + h + ':00';
      cell.appendChild(head);
      var hourEvents = eventsOverlappingRange(parts.dayItems, h0.getTime(), h1.getTime());
      var chips = document.createElement('div');
      chips.className = 'ctx-cal-cell-chips';
      appendEventChips(chips, gl, hourEvents, evFocus, 4);
      cell.appendChild(chips);
      cell.onclick = (function(a, b) {
        return function() { navigateToEvent(a, b); };
      })(h0, h1);
      grid.appendChild(cell);
    }
    wrap.appendChild(grid);
    return wrap;
  }

  function renderContextCalendarView(listEl, gl, events, zScene, ref, windowBounds, evFocus) {
    var frame = getEventsPanelBaseFrame(zScene);
    var kind = frame.layout;
    if (kind === 'list') return false;

    var stretchWeek = !!frame.stretchWeek;
    var daySelectOnly = !!frame.daySelectOnly;
    var root = document.createElement('div');
    root.className = 'ctx-cal ctx-cal--' + kind + ' ctx-cal-frame--' + frame.id;
    if (stretchWeek) root.classList.add('ctx-cal--week-in-month');
    if (daySelectOnly) root.classList.add('ctx-cal--week-day-select');
    root.setAttribute('data-ctx-cal-zoom', String(frame.calendarZoom));
    root.setAttribute('data-ctx-scene-zoom', String(Math.floor(zScene)));
    root.setAttribute('data-panel-frame', frame.id);
    root.setAttribute('data-panel-variant', frame.variant);

    var bounds = windowBounds || { t0: ref.getTime(), t1: ref.getTime() };
    var anchor = new Date(Math.min(Math.max(ref.getTime(), bounds.t0), bounds.t1));
    if (isNaN(anchor.getTime())) anchor = ref;

    if (kind === 'year') {
      root.appendChild(buildYearMonthGrid(gl, anchor.getFullYear(), events, ref, windowBounds, evFocus));
    } else if (kind === 'quarter') {
      var q = Math.floor(anchor.getMonth() / 3);
      var qWrap = document.createElement('div');
      qWrap.className = 'ctx-cal-quarter';
      qWrap.appendChild(makeCalTitle('Q' + (q + 1) + ' ' + anchor.getFullYear()));
      var partsQ = partitionCalendarEvents(events);
      var qStartMs = new Date(anchor.getFullYear(), q * 3, 1, 0, 0, 0, 0).getTime();
      var qEndMs = new Date(anchor.getFullYear(), q * 3 + 3, 0, 23, 59, 59, 999).getTime();
      appendSuperMonthSpanOutlines(qWrap, gl, partsQ.spanItems, qStartMs, qEndMs, evFocus);
      var monthsRow = document.createElement('div');
      monthsRow.className = 'ctx-cal-quarter-months';
      for (var m = q * 3; m < q * 3 + 3; m++) {
        monthsRow.appendChild(buildMonthDayGrid(gl, anchor.getFullYear(), m, partsQ.dayItems, ref, windowBounds, evFocus, {
          connectMultiDay: true
        }));
      }
      qWrap.appendChild(monthsRow);
      root.appendChild(qWrap);
    } else if (kind === 'month') {
      root.appendChild(buildMonthDayGrid(gl, anchor.getFullYear(), anchor.getMonth(), events, ref, windowBounds, evFocus, {
        connectMultiDay: true,
        stretchSelectedWeek: stretchWeek,
        daySelectOnly: daySelectOnly
      }));
    } else if (kind === 'week') {
      var wk = startOfLocalDay(anchor);
      wk.setDate(wk.getDate() - wk.getDay());
      root.appendChild(buildWeekGrid(gl, wk, events, ref, windowBounds, evFocus));
    } else if (kind === 'day') {
      root.appendChild(buildDayHourGrid(gl, startOfLocalDay(anchor), events, ref, evFocus));
    } else {
      return false;
    }
    listEl.appendChild(root);
    if (kind === 'quarter' || kind === 'year' || kind === 'month') {
      scrollContextCalendarToSelectedTime(listEl, root, ref, zScene, stretchWeek);
    }
    return true;
  }

  /** Keep selected month / week / day in view inside the Events panel scroller. */
  function scrollContextCalendarToSelectedTime(listEl, root, ref, zScene, stretchWeek) {
    if (!listEl || !root || !ref) return;
    var weekStretch = !!stretchWeek;
    var z = Math.floor(zScene);
    var preferDay = !weekStretch && (z >= 8 || z === 0 || root.getAttribute('data-panel-frame') === 'week-day');
    var run = function() {
      var weekEl = root.querySelector('.ctx-cal-month-week--selected-context')
        || root.querySelector('.ctx-cal-month-week--has-selected-day');
      var dayCell = root.querySelector('.ctx-cal-cell--selected');
      var monthEl = root.querySelector('.ctx-cal-month--selected-time');
      var target = preferDay ? (dayCell || weekEl || monthEl) : (weekEl || dayCell || monthEl);
      if (!target || typeof target.scrollIntoView !== 'function') return;
      try {
        target.scrollIntoView({
          block: weekStretch ? 'center' : 'nearest',
          inline: 'nearest',
          behavior: 'auto'
        });
      } catch (eScroll) {
        target.scrollIntoView(true);
      }
      var focusEl = weekStretch ? (weekEl || monthEl) : (dayCell || weekEl || monthEl);
      if (focusEl && listEl.contains(focusEl)) {
        var listRect = listEl.getBoundingClientRect();
        var focusRect = focusEl.getBoundingClientRect();
        var delta =
          (focusRect.top - listRect.top) -
          Math.max(0, (listRect.height - focusRect.height) * (weekStretch ? 0.08 : 0.2));
        if (Math.abs(delta) > 4) {
          listEl.scrollTop = Math.max(0, listEl.scrollTop + delta);
        }
      }
    };
    requestAnimationFrame(function() { requestAnimationFrame(run); });
  }

  function refreshEventsList(drawAll, opts) {
    var listEl = document.getElementById('events-panel-list');
    var ctxEl = document.getElementById('events-panel-context');
    if (!listEl) return;
    var options = opts && typeof opts === 'object' ? opts : null;
    if (options && typeof options.zoom === 'number' && !isNaN(options.zoom)) {
      setEventsPanelLiveZoom(options.zoom);
      // Keep sibling delayed passes (0ms + 80ms) unless this is a hard hop cancel.
      if (!options.keepScheduled) cancelScheduledEventsPanelRefresh();
    }
    window.eventsListHorizonRingActive = !drawAll;
    // Set context immediately so something is always visible even if an error occurs below.
    if (ctxEl) ctxEl.textContent = drawAll ? 'Showing all loaded events.' : 'Loading event list…';
    try {
      if (typeof window.updateListHorizonEarthRingScene === 'function') {
        window.updateListHorizonEarthRingScene();
      }
    } catch (eRing) {}
    listEl.innerHTML = '';
    var gl = window.circaevumGL || (window.getGL && window.getGL());
    if (!gl || typeof gl.getEventObjects !== 'function') {
      listEl.innerHTML = '<p class="event-horizon-empty">Circaevum GL not available. Reload the page and try again.</p>';
      return;
    }
    try {
    ensureCalendarLayersGLListeners(gl);

    var ref = (typeof getSelectedDateTime === 'function') ? getSelectedDateTime() : new Date();
    if (!ref || !(ref instanceof Date) || isNaN(ref.getTime())) ref = new Date();
    var forcedZ = options && typeof options.zoom === 'number' && !isNaN(options.zoom)
      ? options.zoom
      : null;
    var zScene = resolveEventsPanelZoom(
      typeof window.currentZoom === 'number' ? window.currentZoom : 4,
      forcedZ
    );
    var frame = getEventsPanelBaseFrame(zScene);
    var z = frame.calendarZoom;
    var searchQ = (eventListSearchQuery || '').trim().toLowerCase();
    if (searchQ) {
      renderEventListSearchResults(listEl, ctxEl, gl, searchQ, ref, zScene);
      return;
    }

    // Cyan caption/ring follows scene Selected Context Arc; calendar skeleton follows frame.
    var windowBounds = drawAll ? null : getSelectedContextWindowBounds(zScene, ref);
    if (!drawAll && !windowBounds && typeof window.getParentUnitTimeBoundsMs === 'function') {
      try {
        var syn = window.getParentUnitTimeBoundsMs(zScene, ref);
        if (syn && isFinite(syn.t0) && isFinite(syn.t1)) {
          windowBounds = { t0: syn.t0, t1: syn.t1, ref: syn.ref || ref, unit: syn.unit || 'synthesized' };
        }
      } catch (eSyn) { /* optional */ }
    }
    // Month body chips: need full month when week / week-day frame is shown.
    var filterBounds = windowBounds;
    if (!drawAll && ref && (frame.id === 'week' || frame.id === 'week-day')) {
      filterBounds = {
        t0: new Date(ref.getFullYear(), ref.getMonth(), 1, 0, 0, 0, 0).getTime(),
        t1: new Date(ref.getFullYear(), ref.getMonth() + 1, 0, 23, 59, 59, 999).getTime(),
        ref: ref,
        unit: 'month-for-week-panel',
        paintZoom: windowBounds && windowBounds.paintZoom
      };
    }
    if (ctxEl) {
      ctxEl.textContent = drawAll
        ? 'Showing all loaded events.'
        : (windowBounds
          ? ('Events in selected context window ' + formatContextWindowRange(windowBounds.t0, windowBounds.t1) + '.')
          : 'Events in selected context window.');
    }

    var events = gatherAllLoadedEvents(gl);
    var lines = [];
    if (typeof gl.removeEventLines === 'function') gl.removeEventLines('event-lines');
    (gl.getEventLines('event-lines') || []).forEach(function(ln) { lines.push({ start: ln.start, end: ln.end, label: ln.label }); });

    var totalEv = events.length;
    var totalLn = lines.length;
    if (totalEv === 0 && totalLn === 0 && (drawAll || frame.layout === 'list')) {
      listEl.innerHTML = '<p class="event-horizon-empty">No events or lines yet. Add calendars from the Layers panel to see events here.</p>';
      updateEventListHorizonRing(drawAll, zScene, ref, windowBounds);
      return;
    }

    if (!drawAll) {
      if (filterBounds) {
        events = filterEventsByTimeRange(events, filterBounds.t0, filterBounds.t1);
        lines = filterLinesByTimeRange(lines, filterBounds.t0, filterBounds.t1, 86400000);
      }
      // Year / century / decade (Z≤3): no daily chips — super-day+ only.
      if (zScene <= 3) {
        events = events.filter(function(item) {
          return eventDurationDaysLocal(item) > 1;
        });
      }
    } else {
      /* All events: keep full loaded set */
    }

    updateEventListHorizonRing(drawAll, zScene, ref, windowBounds);

    var evFocus = (typeof gl.getEventFocus === 'function' ? gl.getEventFocus() : null);

    // Always paint calendar skeleton for this zoom frame — even with zero chips.
    if (!drawAll && frame.layout !== 'list') {
      events.sort(function(a, b) {
        var as = a.ev && a.ev.start instanceof Date ? a.ev.start.getTime() : 0;
        var bs = b.ev && b.ev.start instanceof Date ? b.ev.start.getTime() : 0;
        return as - bs;
      });
      var calBounds = windowBounds || filterBounds || {
        t0: ref.getTime(),
        t1: ref.getTime(),
        ref: ref,
        unit: 'point'
      };
      if (renderContextCalendarView(listEl, gl, events, zScene, ref, calBounds, evFocus)) {
        updateEventFocusClearButton();
        return;
      }
    }

    if (events.length === 0 && lines.length === 0) {
      if (!drawAll && totalEv > 0) {
        listEl.innerHTML = '<p class="event-horizon-empty event-horizon-empty--window" aria-hidden="true"></p>';
        updateEventFocusClearButton();
        return;
      }
      listEl.innerHTML = '<p class="event-horizon-empty">No events or lines yet. Add calendars from the Layers panel to see events here.</p>';
      return;
    }

    events.sort(function(a, b) {
      var as = a.ev && a.ev.start instanceof Date ? a.ev.start.getTime() : 0;
      var bs = b.ev && b.ev.start instanceof Date ? b.ev.start.getTime() : 0;
      return as - bs;
    });
    lines.sort(function(a, b) {
      var as = a.start instanceof Date ? a.start.getTime() : 0;
      var bs = b.start instanceof Date ? b.start.getTime() : 0;
      return as - bs;
    });

    events.forEach(function(item) {
      var row = createEventListRow(gl, item, { z: z, drawAll: drawAll, evFocus: evFocus });
      if (row) listEl.appendChild(row);
    });

    var selectedTimeDivider = document.createElement('div');
    selectedTimeDivider.className = 'events-selected-time-mark';
    selectedTimeDivider.setAttribute('aria-hidden', 'true');
    listEl.appendChild(selectedTimeDivider);

    lines.forEach(function(item) {
      var t = (item.label && String(item.label).trim()) ? String(item.label).trim() : (formatDate(item.start) + ' – ' + formatDate(item.end));
      var row = document.createElement('div');
      row.className = 'line-row';
      row.style.cssText = 'padding:10px 12px;margin-bottom:8px;border-radius:6px;cursor:pointer;';
      row.title = 'Click to focus on this span';
      row.innerHTML = '<div class="event-title">' + escapeHtml(t) + '</div><div class="event-meta">' + formatDate(item.start) + ' → ' + formatDate(item.end) + '</div>';
      row.onclick = function() { navigateToEvent(item.start, item.end); };
      listEl.appendChild(row);
    });

    updateEventFocusClearButton();
    requestAnimationFrame(function() {
      if (evFocus && evFocus.uid && scrollEventListToFocusedEvent()) return;
      if (typeof listEl.clientHeight !== 'number') return;
      var dividerTop = selectedTimeDivider.offsetTop;
      var dividerCenter = dividerTop + (selectedTimeDivider.offsetHeight / 2);
      var targetScrollTop = dividerCenter - (listEl.clientHeight / 2);
      listEl.scrollTop = Math.max(0, targetScrollTop);
    });
    } catch (evListErr) {
      listEl.innerHTML = '<p class="event-horizon-empty" style="color:#f87171;white-space:pre-wrap;">Event list error: ' + String(evListErr) + '\n' + (evListErr && evListErr.stack ? evListErr.stack : '') + '</p>';
      if (ctxEl && ctxEl.textContent === 'Loading event list…') ctxEl.textContent = 'Error loading events.';
    }
  }
  window.refreshEventsList = refreshEventsList;
  window.setEventsPanelLiveZoom = setEventsPanelLiveZoom;

  document.addEventListener('DOMContentLoaded', function() {
    var clearFocusBtn = document.getElementById('events-focus-clear-btn');
    if (clearFocusBtn) clearFocusBtn.onclick = function() {
      clearEventFocus();
      refreshEventsList(false);
    };

    var searchInput = document.getElementById('event-list-search');
    var searchClear = document.getElementById('event-list-search-clear');
    function syncEventListSearchClearBtn() {
      if (!searchClear) return;
      searchClear.hidden = !(eventListSearchQuery || '').trim();
    }
    if (searchInput) {
      searchInput.addEventListener('input', function() {
        eventListSearchQuery = searchInput.value;
        syncEventListSearchClearBtn();
        refreshEventsList(false);
      });
      searchInput.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
          eventListSearchQuery = '';
          searchInput.value = '';
          syncEventListSearchClearBtn();
          refreshEventsList(false);
          searchInput.blur();
        }
      });
    }
    if (searchClear) {
      searchClear.onclick = function() {
        eventListSearchQuery = '';
        if (searchInput) searchInput.value = '';
        syncEventListSearchClearBtn();
        refreshEventsList(false);
        if (searchInput) searchInput.focus();
      };
    }
    syncEventListSearchClearBtn();

    if (!hookGlListenersWhenReady()) {
      var tries = 0;
      var poll = setInterval(function() {
        tries++;
        if (hookGlListenersWhenReady() || tries > 80) clearInterval(poll);
      }, 100);
    }

    var _circaevumUIRefreshRaf = 0;
    window.circaevumOnSelectedTimeOrViewChanged = function() {
      if (typeof window.isSmoothNavigateToTimeActive === 'function' && window.isSmoothNavigateToTimeActive()) return;
      if (_circaevumUIRefreshRaf) return;
      _circaevumUIRefreshRaf = requestAnimationFrame(function() {
        _circaevumUIRefreshRaf = 0;
        var ep = document.getElementById('event-list-panel');
        if (ep && ep.classList.contains('open')) {
          refreshEventsList(false);
          scheduleEventsPanelRefresh(160);
        }
      });
    };

    window.scheduleEventsPanelRefresh = scheduleEventsPanelRefresh;
  });
})();
