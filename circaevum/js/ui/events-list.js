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

  function navigateToEvent(start, end) {
    var s = start instanceof Date ? start : new Date(start);
    var e = end instanceof Date ? end : new Date(end);
    if (!s || isNaN(s.getTime())) return;
    if (!e || isNaN(e.getTime()) || e <= s) e = oneDayLater(s) || s;
    var mid = new Date((s.getTime() + e.getTime()) / 2);
    try {
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

  function calendarLayerVisibilityToggle(ev, gl, layerId) {
    ev.preventDefault();
    ev.stopPropagation();
    var cur = gl.getLayer(layerId);
    var v = cur ? cur.visible !== false : true;
    if (typeof gl.setLayerVisibility === 'function') gl.setLayerVisibility(layerId, !v);
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
    gl.on('eventsIngested', r);
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
      det.appendChild(sum);
      det.appendChild(body);
      listEl.appendChild(det);
    });
  }
  window.refreshCalendarLayersList = refreshCalendarLayersList;

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

  function nearbyHalfSpanMs(zoom) {
    var day = 86400000;
    var z = typeof zoom === 'number' && !isNaN(zoom) ? zoom : (typeof currentZoom !== 'undefined' ? currentZoom : 2);
    if (z >= 9) return day;
    if (z >= 8) return 2 * day;
    if (z >= 7) return 7 * day;
    if (z >= 5) return 30 * day;
    if (z >= 3) return 120 * day;
    return 365 * day;
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
    if (z === 7) return days > 1 && days <= 7;
    if (z === 8) return days > 0 && days <= 1;
    return true;
  }

  function rangesOverlap(a0, a1, b0, b1) {
    return a1 >= b0 && a0 <= b1;
  }

  function updateEventListHorizonRing(drawAll, z, halfMs, ref) {
    var row = document.getElementById('event-list-horizon-ring-row');
    var arc = document.getElementById('event-list-horizon-arc');
    var cap = document.getElementById('event-list-horizon-ring-caption');
    if (!row || !arc || !cap) return;
    if (drawAll) {
      row.style.display = 'none';
      return;
    }
    row.style.display = 'flex';
    var frac;
    if (z === 3 || z === 4) {
      frac = 1;
      cap.textContent = 'Full ring = calendar ' + ref.getFullYear() + ' (same scope as the list). Cyan matches the timeline accent; red would read as an error.';
    } else {
      frac = Math.min(1, (2 * halfMs) / (365 * 86400000));
      cap.textContent = 'Cyan arc ≈ list time window vs one year (~±' + Math.round(halfMs / 86400000) + 'd half-span at zoom ' + z + ').';
    }
    var len = Math.max(1.5, frac * EVENT_LIST_RING_C);
    arc.setAttribute('stroke-dasharray', len + ' ' + (EVENT_LIST_RING_C - len));
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
  }
  window.syncEventListFocusHighlightRows = syncEventListFocusHighlightRows;

  function refreshEventsList(drawAll) {
    var listEl = document.getElementById('events-panel-list');
    var ctxEl = document.getElementById('events-panel-context');
    if (!listEl) return;
    window.eventsListHorizonRingActive = !drawAll;
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
    ensureCalendarLayersGLListeners(gl);

    var ref = (typeof getSelectedDateTime === 'function') ? getSelectedDateTime() : new Date();
    if (!ref || !(ref instanceof Date) || isNaN(ref.getTime())) ref = new Date();
    var z = typeof currentZoom !== 'undefined' ? currentZoom : 2;
    var halfMs = nearbyHalfSpanMs(z);
    var yearBounds = getSelectedCalendarYearLocalBounds(ref);
    if (ctxEl) {
      if (drawAll) ctxEl.textContent = 'Showing all loaded events and lines (Draw all).';
      else if (z === 3 || z === 4) {
        ctxEl.textContent = z === 3
          ? ('Year zoom: calendar ' + ref.getFullYear() + '. List only includes spans longer than 31 days; shorter events stay gray in-scene. Draw all shows every loaded item.')
          : ('Quarter zoom: calendar ' + ref.getFullYear() + '. List includes spans longer than 7 days; shorter events stay gray in-scene. Draw all shows every loaded item.');
      } else {
        ctxEl.textContent = 'Near selected time ' + formatDate(ref) + ' — ±' + Math.max(1, Math.round(halfMs / 86400000)) + 'd at zoom ' + z + '. Month (5)+: sub-week multi-day in list; week (7)+: instant / sub-day.';
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
      listEl.innerHTML = '<p class="event-horizon-empty">No events or lines yet. Click <strong>Test event lines</strong> in the nav to add sample lines, then Refresh.</p>';
      return;
    }

    if (!drawAll) {
      if (z === 3 || z === 4) {
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
        events = events.filter(function(item) {
          var s = item.ev.start;
          if (!s || isNaN(s.getTime())) return false;
          var e = item.ev.end && item.ev.end > s ? item.ev.end : oneDayLater(s);
          if (!e || isNaN(e.getTime())) e = s;
          return rangesOverlap(s.getTime(), e.getTime(), ref.getTime() - halfMs, ref.getTime() + halfMs);
        });
        lines = lines.filter(function(line) {
          var s = line.start instanceof Date ? line.start.getTime() : NaN;
          var e = line.end instanceof Date ? line.end.getTime() : NaN;
          if (isNaN(s)) return false;
          if (isNaN(e)) e = s + 86400000;
          return rangesOverlap(s, e, ref.getTime() - halfMs, ref.getTime() + halfMs);
        });
      }
      events = events.filter(function(item) { return eventDurationEligible(eventDurationDaysForListItem(item.ev), z); });
      lines = lines.filter(function(line) {
        var s = line.start;
        var e = line.end;
        if (!s || !(s instanceof Date) || isNaN(s.getTime())) return false;
        if (!e || !(e instanceof Date) || isNaN(e.getTime()) || e <= s) e = new Date(s.getTime() + 86400000);
        return eventDurationEligible(durationDaysBetweenLocal(s, e), z);
      });
    }

    updateEventListHorizonRing(drawAll, z, halfMs, ref);
    if (events.length === 0 && lines.length === 0) {
      listEl.innerHTML = '<p class="event-horizon-empty">Nothing in this time window (' + totalEv + ' event(s), ' + totalLn + ' line(s) loaded overall). Move <strong>selected time</strong> or zoom, use <strong>Draw all</strong>, or switch the 1Y / all-time events control, then Refresh.</p>';
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
      var ev = item.ev;
      var start = ev.start;
      if (!start || !(start instanceof Date) || isNaN(start.getTime())) return;
      var end = ev.end;
      var endForLine = end && end > start ? end : oneDayLater(start);
      var endForNav = end && end > start ? end : endForLine;
      var name = ev.summary || ev.uid || 'Event';
      var row = document.createElement('div');
      var inList = !!drawAll || shouldShowEventTextAtZoomLocal(ev.start, ev.end && ev.end > ev.start ? ev.end : null, z);
      row.className = 'event-row' + (inList ? ' event-row--in-list' : ' event-row--outside-list');
      var rowUidStr = String(ev.uid || ev.id || '');
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
      row.title = inList ? 'Click to focus on this event' : 'In the time window but hidden until you zoom in (same dimming as the 3D view). Click to focus.';
      var details = [];
      if (ev.location) details.push('<div class="event-detail event-location">' + linkifyText(ev.location) + '</div>');
      if (ev.description) details.push('<div class="event-detail event-description">' + linkifyText(ev.description) + '</div>');
      if (ev.url) details.push('<div class="event-detail event-url"><a class="event-link" href="' + escapeHtml(ev.url) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(ev.url) + '</a></div>');
      row.innerHTML = '<div class="event-title">' + escapeHtml(name) + '</div><div class="event-meta">' + formatDate(start) + (end ? ' → ' + formatDate(end) : '') + '</div>' + details.join('') + '<button type="button" class="events-panel-edit-btn edit-line-btn">Edit</button>';
      row.onclick = function() {
        setCircaevumSelectedLayerId(item.layerId || USER_EVENTS_LAYER);
        if (rowUidStr && typeof gl.setEventHighlight === 'function') {
          gl.setEventHighlight(item.layerId || USER_EVENTS_LAYER, rowUidStr);
        }
        navigateToEvent(start, endForNav);
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
      listEl.appendChild(row);
    });

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

    requestAnimationFrame(function() {
      var panelBody = listEl.parentElement;
      if (!panelBody || typeof panelBody.clientHeight !== 'number') return;
      var dividerTop = selectedTimeDivider.offsetTop;
      var dividerCenter = dividerTop + (selectedTimeDivider.offsetHeight / 2);
      var targetScrollTop = dividerCenter - (panelBody.clientHeight / 2);
      panelBody.scrollTop = Math.max(0, targetScrollTop);
    });
  }
  window.refreshEventsList = refreshEventsList;

  document.addEventListener('DOMContentLoaded', function() {
    var refreshBtn = document.getElementById('events-panel-refresh');
    if (refreshBtn) refreshBtn.onclick = function() { refreshEventsList(false); };
    var drawAllBtn = document.getElementById('events-panel-draw-all');
    if (drawAllBtn) drawAllBtn.onclick = function() { refreshEventsList(true); };

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
