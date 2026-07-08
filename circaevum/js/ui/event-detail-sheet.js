/**
 * Mobile bottom sheet for event details (≤50vh). Desktop keeps the side Event List panel.
 */
(function() {
  var UI = window.CircaevumUI || {};
  var escapeHtml = typeof UI.escapeHtml === 'function' ? UI.escapeHtml : function(s) { return String(s == null ? '' : s); };
  var layerSwatchColor = typeof UI.layerSwatchColor === 'function' ? UI.layerSwatchColor : function() { return null; };
  var buildFullAppUrl = typeof UI.buildFullAppUrl === 'function' ? UI.buildFullAppUrl : function() { return ''; };

  var sheetEl = null;
  var backdropEl = null;
  var panelEl = null;
  var titleEl = null;
  var metaEl = null;
  var bodyEl = null;
  var layerEl = null;
  var editBtn = null;
  var closeBtn = null;
  var currentPayload = null;

  function linkifyText(s) {
    var text = String(s == null ? '' : s);
    if (!text) return '';
    var escaped = escapeHtml(text);
    return escaped.replace(/(https?:\/\/[^\s<]+)/gi, function(url) {
      return '<a class="event-link" href="' + url + '" target="_blank" rel="noopener noreferrer">' + url + '</a>';
    });
  }

  function isMobileEventSheetViewport() {
    return typeof window.matchMedia === 'function' &&
      window.matchMedia('(max-width: 768px)').matches;
  }

  function formatEventRange(start, end) {
    if (!start || !(start instanceof Date) || isNaN(start.getTime())) return '—';
    var dateOpts = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
    var timeOpts = { hour: 'numeric', minute: '2-digit' };
    var sameDay = end && end instanceof Date && !isNaN(end.getTime()) && end > start &&
      start.toDateString() === end.toDateString();
    var startStr = start.toLocaleString(undefined, sameDay
      ? Object.assign({}, dateOpts, timeOpts)
      : dateOpts);
    if (!end || !(end instanceof Date) || isNaN(end.getTime()) || end <= start) return startStr;
    var endStr = end.toLocaleString(undefined, sameDay
      ? timeOpts
      : Object.assign({}, dateOpts, timeOpts));
    return startStr + ' → ' + endStr;
  }

  function normalizeVeventDates(ve) {
    var startRaw = ve.start || ve.startTime || ve.date || (ve.dtstart && (ve.dtstart.dateTime || ve.dtstart.date)) || null;
    var endRaw = ve.end || ve.endTime || (ve.dtend && (ve.dtend.dateTime || ve.dtend.date)) || null;
    if (!startRaw && typeof ve.getStartDate === 'function') {
      var sd = ve.getStartDate();
      if (sd instanceof Date && !isNaN(sd.getTime())) startRaw = sd;
    }
    if (!endRaw && typeof ve.getEndDate === 'function') {
      var ed = ve.getEndDate();
      if (ed instanceof Date && !isNaN(ed.getTime())) endRaw = ed;
    }
    var start = startRaw instanceof Date ? startRaw : (startRaw ? new Date(startRaw) : null);
    var end = endRaw instanceof Date ? endRaw : (endRaw ? new Date(endRaw) : null);
    return { start: start, end: end };
  }

  function buildEditPayload(ve, layerId, start, end) {
    var name = ve.summary || ve.title || ve.uid || ve.id || 'Event';
    var endUse = end && end > start ? end : (start ? new Date(start.getTime() + 3600000) : null);
    var cat = ve.category;
    if (cat == null && Array.isArray(ve.categories) && ve.categories[0]) cat = ve.categories[0];
    return {
      uid: ve.uid || ve.id,
      key: ve.key,
      summary: name,
      description: ve.description || null,
      location: ve.location || null,
      url: ve.url || null,
      color: ve.color || ve.colorId || null,
      category: cat != null ? String(cat) : null,
      layerId: layerId || ve.layerId || null,
      calendarId: ve.calendarId || null,
      googleAccountEmail: ve.googleAccountEmail || null,
      googleCalendarId: ve.googleCalendarId || ve.calendarId || null,
      circaevumSource: ve.circaevumSource || null,
      circaevumSourceDetail: ve.circaevumSourceDetail || null,
      dtstart: ve.dtstart || (start ? { dateTime: start.toISOString() } : null),
      dtend: ve.dtend || (endUse ? { dateTime: endUse.toISOString() } : null),
      isTrip: ve.isTrip === true,
      isWorkEvent: ve.isWorkEvent === true
    };
  }

  function canEditEvent() {
    if (window.self !== window.top && window.parent && window.parent.postMessage) return true;
    return !!buildFullAppUrl(false);
  }

  function openEventEdit() {
    if (!currentPayload) return;
    var p = currentPayload;
    var editEvent = buildEditPayload(p.vevent, p.layerId, p.start, p.end);
    if (window.self !== window.top && window.parent.postMessage) {
      window.parent.postMessage({ type: 'CIRCAEVUM_EDIT_EVENT', event: editEvent }, '*');
      return;
    }
    var url = buildFullAppUrl(false);
    if (url) window.location.href = url;
  }

  function ensureSheetDom() {
    if (sheetEl) return;
    sheetEl = document.getElementById('event-detail-sheet');
    if (!sheetEl) return;
    backdropEl = sheetEl.querySelector('.event-detail-sheet-backdrop');
    panelEl = sheetEl.querySelector('.event-detail-sheet-panel');
    titleEl = document.getElementById('event-detail-sheet-title');
    metaEl = document.getElementById('event-detail-sheet-meta');
    layerEl = document.getElementById('event-detail-sheet-layer');
    bodyEl = document.getElementById('event-detail-sheet-body');
    editBtn = document.getElementById('event-detail-sheet-edit');
    closeBtn = document.getElementById('event-detail-sheet-close');

    if (backdropEl) {
      backdropEl.addEventListener('click', function() {
        closeMobileEventDetailSheet({ clearFocus: true });
      });
    }
    if (closeBtn) closeBtn.addEventListener('click', function() { closeMobileEventDetailSheet({ clearFocus: true }); });
    if (editBtn) editBtn.addEventListener('click', function(e) { e.stopPropagation(); openEventEdit(); });
    if (panelEl) {
      panelEl.addEventListener('click', function(e) { e.stopPropagation(); });
    }
  }

  function showMobileEventDetailSheet(payload) {
    if (!isMobileEventSheetViewport() || !payload || !payload.vevent) return false;
    ensureSheetDom();
    if (!sheetEl || !titleEl || !bodyEl) return false;

    var ve = payload.vevent;
    var dates = normalizeVeventDates(ve);
    var start = payload.start instanceof Date ? payload.start : dates.start;
    var end = payload.end instanceof Date ? payload.end : dates.end;
    if (!start || isNaN(start.getTime())) return false;

    currentPayload = {
      vevent: ve,
      layerId: payload.layerId || null,
      start: start,
      end: end
    };

    var gl = window.circaevumGL || (window.getGL && window.getGL());
    var layer = gl && payload.layerId && typeof gl.getLayer === 'function' ? gl.getLayer(payload.layerId) : null;
    var layerName = layer && layer.name ? String(layer.name) : (payload.layerId || '');
    var accent = ve.color || ve.colorId || layerSwatchColor(layer) || '#00b4d8';

    titleEl.textContent = ve.summary || ve.title || ve.uid || ve.id || 'Event';
    if (metaEl) metaEl.textContent = formatEventRange(start, end);
    if (layerEl) {
      layerEl.textContent = layerName ? 'Layer: ' + layerName : '';
      layerEl.hidden = !layerName;
    }
    if (panelEl) panelEl.style.borderTopColor = accent;

    var parts = [];
    if (ve.location) {
      parts.push('<div class="event-detail-sheet-field"><span class="event-detail-sheet-label">Location</span><div class="event-detail-sheet-value">' +
        linkifyText(ve.location) + '</div></div>');
    }
    if (ve.description) {
      parts.push('<div class="event-detail-sheet-field"><span class="event-detail-sheet-label">Notes</span><div class="event-detail-sheet-value event-detail-sheet-description">' +
        linkifyText(ve.description) + '</div></div>');
    }
    if (ve.url) {
      parts.push('<div class="event-detail-sheet-field"><span class="event-detail-sheet-label">Link</span><div class="event-detail-sheet-value"><a class="event-link" href="' +
        escapeHtml(ve.url) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(ve.url) + '</a></div></div>');
    }
    if (ve.categories && ve.categories.length) {
      parts.push('<div class="event-detail-sheet-field"><span class="event-detail-sheet-label">Category</span><div class="event-detail-sheet-value">' +
        escapeHtml(ve.categories.join(', ')) + '</div></div>');
    }
    if (!parts.length) {
      parts.push('<p class="event-detail-sheet-muted">No extra details for this event.</p>');
    }
    bodyEl.innerHTML = parts.join('');

    if (editBtn) {
      var editable = canEditEvent();
      editBtn.hidden = !editable;
      editBtn.textContent = window.self !== window.top ? 'Edit event' : 'Edit in full app';
    }

    sheetEl.classList.add('open');
    sheetEl.setAttribute('aria-hidden', 'false');
    document.body.classList.add('event-detail-sheet-open');
    if (closeBtn) closeBtn.focus();
    return true;
  }

  function closeMobileEventDetailSheet(opts) {
    opts = opts || {};
    if (!sheetEl) return;
    sheetEl.classList.remove('open');
    sheetEl.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('event-detail-sheet-open');
    currentPayload = null;
    if (opts.clearFocus) {
      var gl = window.circaevumGL || (window.getGL && window.getGL());
      if (gl && typeof gl.setEventHighlight === 'function') {
        var cur = typeof gl.getEventFocus === 'function' ? gl.getEventFocus() : null;
        if (cur && cur.uid) gl.setEventHighlight(cur.layerId, null);
      }
      if (typeof window.updateEventFocusClearButton === 'function') window.updateEventFocusClearButton();
    }
  }

  window.isMobileEventSheetViewport = isMobileEventSheetViewport;
  window.showMobileEventDetailSheet = showMobileEventDetailSheet;
  window.closeMobileEventDetailSheet = closeMobileEventDetailSheet;
  window.buildCircaevumEditPayload = buildEditPayload;
})();
