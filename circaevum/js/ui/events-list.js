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
  function preferredZoomForEventSpan(start, end) {
    var s = start instanceof Date ? start : new Date(start);
    var e = end instanceof Date ? end : new Date(end);
    if (!s || isNaN(s.getTime())) return typeof currentZoom !== 'undefined' ? currentZoom : 5;
    if (!e || isNaN(e.getTime()) || e <= s) e = oneDayLater(s) || s;
    var days = durationDaysBetweenLocal(s, e);
    return eventTextLabelsMinZoomForDurationDaysLocal(days);
  }

  function navigateToEvent(start, end) {
    var s = start instanceof Date ? start : new Date(start);
    var e = end instanceof Date ? end : new Date(end);
    if (!s || isNaN(s.getTime())) return;
    if (!e || isNaN(e.getTime()) || e <= s) e = oneDayLater(s) || s;
    var mid = new Date((s.getTime() + e.getTime()) / 2);
    var days = durationDaysBetweenLocal(s, e);
    var zNow = typeof currentZoom !== 'undefined' ? currentZoom : 2;
    var zTarget = eventTextLabelsMinZoomForDurationDaysLocal(days);
    try {
      if (!eventDurationEligible(days, zNow)) {
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
          window.refreshEventsList(false);
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
  window.preferredZoomForEventSpan = preferredZoomForEventSpan;
  window.zoomDisplayName = zoomDisplayName;

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
      refreshEventsList(false);
    };
    gl.on('layerAdded', r);
    gl.on('layerRemoved', r);
    gl.on('layerVisibilityChanged', r);
    gl.on('categoryVisibilityChanged', r);
    gl.on('eventsIngested', r);
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
    host.innerHTML = parts.length ? parts.join('') : '';
    if (typeof window.syncGeophysicalShellsIcon === 'function') window.syncGeophysicalShellsIcon();
  }

  function refreshCalendarLayersList() {
    var listEl = document.getElementById('calendar-layers-list');
    if (!listEl) return;
    listEl.innerHTML = '';
    var gl = window.circaevumGL || (window.getGL && window.getGL());
    if (!gl || typeof gl.getLayerIds !== 'function') {
      listEl.innerHTML = '<p class="calendar-layers-empty">Circaevum GL not available yet. Open this tab after the scene loads.</p>';
      return;
    }
    ensureCalendarLayersGLListeners(gl);
    var ids = gl.getLayerIds();
    if (!ids.length) {
      listEl.innerHTML = '<p class="calendar-layers-empty">No calendar layers yet. Layers appear when calendars or events are added.</p>';
      refreshAtcLegend();
      return;
    }
    ids.forEach(function(layerId) {
      var layer = gl.getLayer(layerId);
      var displayName = (layer && layer.name) ? layer.name : layerId;
      var visible = layer ? layer.visible !== false : true;
      var hex = layerSwatchColor(layer);
      var nEv = (gl.getEventObjects && gl.getEventObjects(layerId)) ? gl.getEventObjects(layerId).length : 0;

      var det = document.createElement('details');
      det.className = 'calendar-layer-details';
      det.open = true;
      var sum = document.createElement('summary');
      sum.className = 'calendar-layer-summary';
      var sw = document.createElement('span');
      sw.className = 'calendar-layer-swatch';
      if (hex) sw.style.background = hex;
      else sw.classList.add('calendar-layer-swatch-default');

      var titleEl = document.createElement('span');
      titleEl.className = 'calendar-layer-title';
      titleEl.textContent = displayName;
      titleEl.style.cursor = 'pointer';
      titleEl.title = 'Select this layer';
      titleEl.onmousedown = function(e) { e.stopPropagation(); };
      titleEl.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        setCircaevumSelectedLayerId(layerId);
      };

      var visBtn = document.createElement('button');
      visBtn.type = 'button';
      visBtn.className = 'calendar-layer-visibility-btn' + (visible ? ' is-on' : ' is-off');
      visBtn.setAttribute('aria-label', visible ? 'Hide calendar layer' : 'Show calendar layer');
      visBtn.innerHTML = calendarVisibilitySvg(visible);
      visBtn.onclick = function(e) { calendarLayerVisibilityToggle(e, gl, layerId); };

      sum.appendChild(sw);
      sum.appendChild(titleEl);
      sum.appendChild(visBtn);

      var body = document.createElement('div');
      body.className = 'calendar-layer-body';
      var meta = document.createElement('div');
      meta.className = 'calendar-layer-meta';
      meta.textContent = layerId + (nEv ? ' · ' + nEv + ' event' + (nEv !== 1 ? 's' : '') : '');
      body.appendChild(meta);

      var catSet = {};
      if (gl.getEventObjects) {
        (gl.getEventObjects(layerId) || []).forEach(function (ev) {
          var c = ev.category != null ? String(ev.category).trim() : '';
          if (!c) c = 'Default';
          catSet[c] = (catSet[c] || 0) + 1;
        });
      }
      var catNames = Object.keys(catSet).sort();
      if (catNames.length > 1) {
        var catList = document.createElement('div');
        catList.className = 'calendar-layer-categories';
        catNames.forEach(function (cat) {
          var layerOn = layer ? layer.visible !== false : true;
          var catVis = categoryStyleVisible(gl, layerId, cat);
          var row = document.createElement('div');
          row.className = 'calendar-layer-category-row' + (layerOn ? '' : ' calendar-layer-category-row-muted');
          var catLabel = document.createElement('span');
          catLabel.className = 'calendar-layer-category-label';
          catLabel.textContent = cat + (catSet[cat] ? ' (' + catSet[cat] + ')' : '');
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
      }

      det.appendChild(sum);
      det.appendChild(body);
      listEl.appendChild(det);
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
    var Y = 365.25;
    if (z <= 0 || z >= 9) return days >= 0 && days < 1;
    if (z === 1) return days > 10 * Y && days <= 100 * Y;
    if (z === 2) return days > Y && days <= 10 * Y;
    if (z === 3) return days > 92 && days < Y;
    if (z === 4) return days > 31 && days <= 92;
    if (z === 5 || z === 6) return days > 7 && days <= 31;
    if (z === 7) {
      var synDays = (typeof MoonMechanics !== 'undefined' && MoonMechanics.SYNODIC_MONTH_DAYS)
        ? MoonMechanics.SYNODIC_MONTH_DAYS
        : 29.530588861;
      return days > 1 && days <= synDays;
    }
    if (z === 8) return days > 0 && days <= 1;
    return true;
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

  function updateEventListHorizonRing(drawAll, z, halfMs, ref) {
    var row = document.getElementById('event-list-horizon-ring-row');
    var arc = document.getElementById('event-list-horizon-arc');
    var arcInner = document.getElementById('event-list-horizon-arc-inner');
    var cap = document.getElementById('event-list-horizon-ring-caption');
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
      arcInner.setAttribute('stroke-dasharray', EVENT_LIST_RING_C + ' 0');
    }
    var dayMs = 86400000;
    var panelArc = (typeof window.getListContextDiscArcForPanel === 'function')
      ? window.getListContextDiscArcForPanel(z)
      : null;
    var spanHint = ' Dashed inner ring = spans not in the list at this zoom (context disc optional).';
    if (z === 0) {
      cap.textContent = 'Outer arc ≈ selected hour (' + ref.getHours() + ':00–' + ((ref.getHours() + 1) % 24) + ':00).' + spanHint;
    } else {
      cap.textContent = 'Outer arc ≈ list time window near selected time (±' + Math.max(1, Math.round(halfMs / dayMs)) + 'd).' + spanHint;
    }
    var len = panelArc ? panelArc.arcLen : Math.max(1.5, Math.min(100, (2 * halfMs) / (365 * dayMs) * EVENT_LIST_RING_C));
    var gap = panelArc ? panelArc.arcGap : EVENT_LIST_RING_C - len;
    var offset = panelArc && !panelArc.fullCircle ? panelArc.arcOffset : 0;
    arc.setAttribute('stroke-dasharray', len + ' ' + gap);
    arc.setAttribute('stroke-dashoffset', String(-offset));
    if (arcInner) {
      arcInner.setAttribute('stroke-dasharray', len + ' ' + gap);
      arcInner.setAttribute('stroke-dashoffset', String(-offset));
    }
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
    return events;
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
    var bounds = listTimeBoundsMs(z, ref);
    if (!rangesOverlap(s.getTime(), e.getTime(), bounds.t0, bounds.t1)) return false;
    return eventDurationEligible(eventDurationDaysForListItem(ev), z);
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
    var endForLine = end && end > start ? end : oneDayLater(start);
    var endForNav = end && end > start ? end : endForLine;
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
      setCircaevumSelectedLayerId(item.layerId || USER_EVENTS_LAYER);
      var lid = item.layerId || USER_EVENTS_LAYER;
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
        return;
      }
      if (rowUidStr && typeof gl.setEventHighlight === 'function') {
        gl.setEventHighlight(lid, rowUidStr);
      }
      updateEventFocusClearButton();
      navigateToEvent(start, endForNav);
      if (typeof window.isMobileEventSheetViewport === 'function' && window.isMobileEventSheetViewport() &&
          typeof window.showMobileEventDetailSheet === 'function') {
        window.showMobileEventDetailSheet({
          vevent: ev,
          layerId: item.layerId || USER_EVENTS_LAYER,
          start: start,
          end: endForNav
        });
      } else {
        requestAnimationFrame(function() { scrollEventListToFocusedEvent(); });
      }
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
      listEl.innerHTML = '<p class="event-horizon-empty">No matches. Check spelling or use <strong>All events</strong>.</p>';
      updateEventFocusClearButton();
      return;
    }
    var evFocus = (typeof gl.getEventFocus === 'function' ? gl.getEventFocus() : null);
    matches.forEach(function(item) {
      var inWindow = eventIncludedInDefaultList(item, z, ref);
      var metaExtra = inWindow ? '' : ' · outside current list window';
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

  function refreshEventsList(drawAll) {
    var listEl = document.getElementById('events-panel-list');
    var ctxEl = document.getElementById('events-panel-context');
    if (!listEl) return;
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
    var z = typeof currentZoom !== 'undefined' ? currentZoom : 2;
    var searchQ = (eventListSearchQuery || '').trim().toLowerCase();
    if (searchQ) {
      renderEventListSearchResults(listEl, ctxEl, gl, searchQ, ref, z);
      return;
    }

    var halfMs = nearbyHalfSpanMs(z, ref);
    var yearBounds = getSelectedCalendarYearLocalBounds(ref);
    if (ctxEl) {
      if (drawAll) {
        ctxEl.textContent = 'Showing all loaded events and lines.';
      } else if (z === 0) {
        var hourCtx = getSelectedHourLocalBounds(ref);
        ctxEl.textContent = 'Hour zoom: ' + hourCtx.start.getHours() + ':00–' + hourCtx.end.getHours() + ':00 on '
          + formatDate(ref) + '. List shows sub-day spans in that hour only.';
      } else if (z === 3 || z === 4) {
        ctxEl.textContent = z === 3
          ? ('Year zoom: calendar ' + ref.getFullYear() + '. List only includes spans longer than 31 days; shorter events stay gray in-scene. Use All events to see everything.')
          : ('Quarter zoom: calendar ' + ref.getFullYear() + '. List includes spans longer than 7 days; shorter events stay gray in-scene. Use All events to see everything.');
      } else if (z >= 5) {
        ctxEl.textContent = 'Calendar ' + ref.getFullYear() + ' only at month zoom and finer — ±'
          + Math.max(1, Math.round(halfMs / 86400000)) + 'd near selected time. Span band matches zoom (no longer-scale items).';
      } else {
        ctxEl.textContent = 'Near selected time ' + formatDate(ref) + ' — ±' + Math.max(1, Math.round(halfMs / 86400000)) + 'd at zoom ' + z + '. List matches this zoom\'s span band only.';
      }
    }

    var events = [];
    var lines = [];
    if (typeof gl.getLayerIds === 'function') {
      gl.getLayerIds().forEach(function(lid) {
        (gl.getEventObjects(lid) || []).forEach(function(o) { events.push({ layerId: lid, ev: o }); });
      });
    } else {
      (gl.getEventObjects(USER_EVENTS_LAYER) || []).forEach(function(o) { events.push({ layerId: USER_EVENTS_LAYER, ev: o }); });
    }
    if (typeof gl.removeEventLines === 'function') gl.removeEventLines('event-lines');
    (gl.getEventLines('event-lines') || []).forEach(function(ln) { lines.push({ start: ln.start, end: ln.end, label: ln.label }); });

    var totalEv = events.length;
    var totalLn = lines.length;
    if (totalEv === 0 && totalLn === 0) {
      listEl.innerHTML = '<p class="event-horizon-empty">No events or lines yet. Add calendars from the Layers panel to see events here.</p>';
      return;
    }

    if (!drawAll) {
      if (z === 0) {
        var hourBounds = getSelectedHourLocalBounds(ref);
        var h0 = hourBounds.start.getTime();
        var h1 = hourBounds.end.getTime();
        events = events.filter(function(item) {
          var s = item.ev.start;
          if (!s || isNaN(s.getTime())) return false;
          var e = item.ev.end && item.ev.end > s ? item.ev.end : oneDayLater(s);
          if (!e || isNaN(e.getTime())) e = s;
          return rangesOverlap(s.getTime(), e.getTime(), h0, h1);
        });
        lines = lines.filter(function(line) {
          var s = line.start instanceof Date ? line.start.getTime() : NaN;
          var e = line.end instanceof Date ? line.end.getTime() : NaN;
          if (isNaN(s)) return false;
          if (isNaN(e)) e = s + 3600000;
          return rangesOverlap(s, e, h0, h1);
        });
      } else if (z === 3 || z === 4) {
        events = events.filter(function(item) {
          var s = item.ev.start;
          if (!s || isNaN(s.getTime())) return false;
          var e = item.ev.end && item.ev.end > s ? item.ev.end : oneDayLater(s);
          if (!e || isNaN(e.getTime())) e = s;
          return rangesOverlap(s.getTime(), e.getTime(), yearBounds.start.getTime(), yearBounds.end.getTime());
        });
        lines = lines.filter(function(line) {
          var s = line.start instanceof Date ? line.start.getTime() : NaN;
          var e = line.end instanceof Date ? line.end.getTime() : NaN;
          if (isNaN(s)) return false;
          if (isNaN(e)) e = s + 86400000;
          return rangesOverlap(s, e, yearBounds.start.getTime(), yearBounds.end.getTime());
        });
      } else {
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
          var y0 = yearBounds.start.getTime();
          var y1 = yearBounds.end.getTime();
          t0 = Math.max(t0, y0);
          t1 = Math.min(t1, y1);
        }
        events = filterEventsByTimeRange(events, t0, t1);
        lines = filterLinesByTimeRange(lines, t0, t1, 86400000);
      }
    }
    var afterTimeFilter = events.slice();
    if (!drawAll) {
      events = events.filter(function(item) { return eventDurationEligible(eventDurationDaysForListItem(item.ev), z); });
      lines = lines.filter(function(line) {
        var s = line.start;
        var e = line.end;
        if (!s || !(s instanceof Date) || isNaN(s.getTime())) return false;
        if (!e || !(e instanceof Date) || isNaN(e.getTime()) || e <= s) e = new Date(s.getTime() + 86400000);
        return eventDurationEligible(durationDaysBetweenLocal(s, e), z);
      });
    }

    var contextArcFinerZoom = [];
    if (!drawAll && typeof window.getListContextDiscArcTimeBoundsMs === 'function') {
      var arcBounds = window.getListContextDiscArcTimeBoundsMs(z, ref);
      if (arcBounds && arcBounds.t0 != null && arcBounds.t1 != null) {
        contextArcFinerZoom = afterTimeFilter.filter(function(item) {
          var days = eventDurationDaysForListItem(item.ev);
          if (eventDurationEligible(days, z)) return false;
          var s = item.ev.start;
          if (!s || isNaN(s.getTime())) return false;
          var e = item.ev.end && item.ev.end > s ? item.ev.end : oneDayLater(s);
          if (!e || isNaN(e.getTime())) e = s;
          return rangesOverlap(s.getTime(), e.getTime(), arcBounds.t0, arcBounds.t1);
        });
      }
    }
    if (ctxEl && !drawAll && contextArcFinerZoom.length > 0) {
      ctxEl.textContent += ' ' + contextArcFinerZoom.length + ' on context arc need finer zoom (section below). Click one to jump.';
    }

    updateEventListHorizonRing(drawAll, z, halfMs, ref);
    if (events.length === 0 && lines.length === 0 && contextArcFinerZoom.length === 0) {
      if (!drawAll && totalEv > 0) {
        // Auto-expand: nothing in the zoom window but events exist — show all so the list isn't blank.
        refreshEventsList(true);
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

    var evFocus = (typeof gl.getEventFocus === 'function' ? gl.getEventFocus() : null);

    events.forEach(function(item) {
      var row = createEventListRow(gl, item, { z: z, drawAll: drawAll, evFocus: evFocus });
      if (row) listEl.appendChild(row);
    });

    if (contextArcFinerZoom.length > 0) {
      contextArcFinerZoom.sort(function(a, b) {
        var as = a.ev && a.ev.start instanceof Date ? a.ev.start.getTime() : 0;
        var bs = b.ev && b.ev.start instanceof Date ? b.ev.start.getTime() : 0;
        return as - bs;
      });
      var arcHdr = document.createElement('div');
      arcHdr.className = 'events-nearby-lines-header';
      arcHdr.textContent = 'In context arc — click to open at finer zoom';
      arcHdr.style.margin = '16px 0 10px';
      arcHdr.style.borderTop = '1px solid rgba(0,180,216,0.2)';
      arcHdr.style.paddingTop = '10px';
      listEl.appendChild(arcHdr);
      contextArcFinerZoom.forEach(function(item) {
        var ev = item.ev;
        var start = ev.start;
        if (!start || !(start instanceof Date) || isNaN(start.getTime())) return;
        var end = ev.end;
        var endForLine = end && end > start ? end : oneDayLater(start);
        var endForNav = end && end > start ? end : endForLine;
        var name = ev.summary || ev.uid || 'Event';
        var days = eventDurationDaysForListItem(ev);
        var targetZ = eventTextLabelsMinZoomForDurationDaysLocal(days);
        var row = document.createElement('div');
        var rowUidStr = String(ev.uid || ev.id || '');
        row.className = 'event-row event-row--outside-list event-row--context-arc-finer';
        row.setAttribute('data-event-layer', item.layerId || '');
        row.setAttribute('data-event-uid', rowUidStr);
        if (evFocus && evFocus.uid) {
          var matchFocus = evFocus.layerId === item.layerId && String(evFocus.uid) === rowUidStr;
          if (matchFocus) row.classList.add('event-row--focus-selected');
          else row.classList.add('event-row--focus-dim');
        }
        var layer = gl.getLayer ? gl.getLayer(item.layerId) : null;
        var borderColor = ev.color || ev.colorId || layerSwatchColor(layer) || 'rgba(0, 180, 216, 0.5)';
        row.style.cssText = 'padding:10px 12px;margin-bottom:8px;border-radius:8px;cursor:pointer;border-left:3px solid ' + borderColor + ';background:' + eventColorToRgbaPanelBackground(ev.color || ev.colorId, layerSwatchColor(layer), 0.16, 0.08, false) + ';opacity:0.82;';
        row.title = 'Shown in context arc at ' + zoomDisplayName(z) + '. Click to jump to ' + zoomDisplayName(targetZ) + ' and focus this span.';
        var details = [];
        if (ev.location) details.push('<div class="event-detail event-location">' + linkifyText(ev.location) + '</div>');
        if (ev.description) {
          var rawDescArc = ev.description;
          var shortDescArc = rawDescArc.length > 120 ? rawDescArc.slice(0, 120).trimEnd() + '…' : rawDescArc;
          details.push('<div class="event-detail event-description">' + linkifyText(shortDescArc) + '</div>');
        }
        row.innerHTML = '<div class="event-title">' + escapeHtml(name) + '</div><div class="event-meta">' + formatDate(start) + (end ? ' → ' + formatDate(end) : '') + ' · opens at ' + zoomDisplayName(targetZ) + '</div>' + details.join('') + '<button type="button" class="events-panel-edit-btn edit-line-btn">Edit</button>';
        row.onclick = function() {
          setCircaevumSelectedLayerId(item.layerId || USER_EVENTS_LAYER);
          var lid = item.layerId || USER_EVENTS_LAYER;
          if (rowUidStr && typeof gl.setEventHighlight === 'function') {
            gl.setEventHighlight(lid, rowUidStr);
          }
          updateEventFocusClearButton();
          navigateToEvent(start, endForNav);
          requestAnimationFrame(function() { scrollEventListToFocusedEvent(); });
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
                dtend: ev.dtend || (end && end > start ? { dateTime: end.toISOString() } : { dateTime: new Date(start.getTime() + 86400000).toISOString() })
              }
            }, '*');
          };
        } else if (editBtn) editBtn.style.display = 'none';
        listEl.appendChild(row);
      });
    }

    var selectedTimeDivider = document.createElement('div');
    selectedTimeDivider.className = 'events-nearby-lines-header';
    selectedTimeDivider.textContent = 'Selected time — ' + formatDate(ref);
    selectedTimeDivider.style.margin = '8px 0 12px';
    selectedTimeDivider.style.borderTop = '1px solid rgba(0,180,216,0.25)';
    selectedTimeDivider.style.paddingTop = '8px';
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

  document.addEventListener('DOMContentLoaded', function() {
    var clearFocusBtn = document.getElementById('events-focus-clear-btn');
    if (clearFocusBtn) clearFocusBtn.onclick = function() { clearEventFocus(); };

    var showAllBtn = document.getElementById('events-show-all-btn');
    if (showAllBtn) showAllBtn.onclick = function() { refreshEventsList(true); };

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

    var _circaevumUIRefreshRaf = 0;
    window.circaevumOnSelectedTimeOrViewChanged = function() {
      if (typeof window.isSmoothNavigateToTimeActive === 'function' && window.isSmoothNavigateToTimeActive()) return;
      if (_circaevumUIRefreshRaf) return;
      _circaevumUIRefreshRaf = requestAnimationFrame(function() {
        _circaevumUIRefreshRaf = 0;
        var ep = document.getElementById('event-list-panel');
        if (ep && ep.classList.contains('open')) refreshEventsList(false);
      });
    };
  });
})();
