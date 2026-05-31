/**
 * Edge Esmeralda 2026 — festival + week-span long-term events (CSV) and shared layer loader.
 * Session packs register via registerEdgeEsmeraldaWeekSessions (see edge-esmeralda-2026-sessions.js, generated from the real portal export).
 */
(function (global) {
  var LOC = 'Edge Esmeralda, Healdsburg, CA';
  var LAYER_ID = 'edge-esmeralda-2026';

  var longTermEvents = [
    {
      uid: 'ee26-festival',
      summary: 'Edge City Esmeralda 2026',
      description: 'Month-long popup village, Healdsburg CA (May 30 – June 27) — https://www.edgeesmeralda.com/',
      location: LOC,
      dtstart: { dateTime: '2026-05-30T16:00:00Z' },
      dtend: { dateTime: '2026-06-28T05:00:00Z' },
      color: '#f15bb5',
      categories: ['Edge-City-Esmeralda-2026'],
      status: 'CONFIRMED',
      url: 'https://www.edgeesmeralda.com/'
    },
    {
      uid: 'ee26-w1-span',
      summary: 'Protocols for Flourishing',
      description: 'Week 1 (June 1–7): Health & Longevity · Consciousness · Wellbeing · Bio & Neuro.',
      location: LOC,
      dtstart: { dateTime: '2026-06-01T13:00:00Z' },
      dtend: { dateTime: '2026-06-08T01:00:00Z' },
      color: '#00b4d8',
      categories: ['Edge-City-Esmeralda-2026'],
      status: 'CONFIRMED'
    },
    {
      uid: 'ee26-w2-span',
      summary: 'Intelligence & Autonomy',
      description: 'Week 2 (June 8–14): AI · Governance & Coordination · Hard Tech · Privacy · d/acc.',
      location: LOC,
      dtstart: { dateTime: '2026-06-08T09:00:00Z' },
      dtend: { dateTime: '2026-06-15T01:00:00Z' },
      color: '#9b5de5',
      categories: ['Edge-City-Esmeralda-2026'],
      status: 'CONFIRMED'
    },
    {
      uid: 'ee26-w3-span',
      summary: 'Emergent Futures & World Building',
      description: 'Week 3 (June 15–21): Art & Culture · Decentralized Tech · Creative AI · Spatial Computing.',
      location: LOC,
      dtstart: { dateTime: '2026-06-15T09:00:00Z' },
      dtend: { dateTime: '2026-06-22T01:00:00Z' },
      color: '#ffd166',
      categories: ['Edge-City-Esmeralda-2026'],
      status: 'CONFIRMED'
    },
    {
      uid: 'ee26-w4-span',
      summary: 'Environments of Tomorrow',
      description: 'Week 4 (June 22–27): New Urbanism · Education · Energy & Climate · Food Systems.',
      location: LOC,
      dtstart: { dateTime: '2026-06-22T09:00:00Z' },
      dtend: { dateTime: '2026-06-28T01:00:00Z' },
      color: '#06d6a0',
      categories: ['Edge-City-Esmeralda-2026'],
      status: 'CONFIRMED'
    }
  ];

  var weekMeta = {
    1: {
      label: 'W1',
      layerName: 'Edge Esmeralda W1',
      title: 'Protocols for Flourishing — health & longevity, consciousness, wellbeing, bio & neuro (June 1–7)',
      navigateTo: new Date(2026, 5, 4, 10, 0, 0),
      zoomLevel: 8
    },
    2: {
      label: 'W2',
      layerName: 'Edge Esmeralda W2',
      title: 'Intelligence & Autonomy — AI, governance, hard tech, privacy, d/acc (June 8–14)',
      navigateTo: new Date(2026, 5, 11, 10, 0, 0),
      zoomLevel: 7
    },
    3: {
      label: 'W3',
      layerName: 'Edge Esmeralda W3',
      title: 'Emergent Futures & World Building — art, decentralized tech, creative AI, spatial computing (June 15–21)',
      navigateTo: new Date(2026, 5, 18, 10, 0, 0),
      zoomLevel: 7
    },
    4: {
      label: 'W4',
      layerName: 'Edge Esmeralda W4',
      title: 'Environments of Tomorrow — new urbanism, education, energy & climate, food systems (June 22–27)',
      navigateTo: new Date(2026, 5, 25, 10, 0, 0),
      zoomLevel: 7
    }
  };

  var sessionsByWeek = { 1: [], 2: [], 3: [], 4: [] };
  var extraCategoryColors = {};

  function registerEdgeEsmeraldaWeekSessions(week, list) {
    var w = Number(week);
    if (w >= 1 && w <= 4 && Array.isArray(list)) {
      sessionsByWeek[w] = list;
    }
  }

  /** Session packs can register their track/kind colors so layers stay on-theme. */
  function registerEdgeEsmeraldaCategoryColors(map) {
    if (map && typeof map === 'object') {
      Object.keys(map).forEach(function (k) {
        extraCategoryColors[k] = map[k];
      });
    }
  }

  function edgeEventStartMs(e) {
    var s = e && e.dtstart;
    if (!s) return NaN;
    if (s.dateTime) return new Date(s.dateTime).getTime();
    if (s.date) return new Date(String(s.date).slice(0, 10) + 'T12:00:00').getTime();
    return NaN;
  }

  function edgeEventEndMs(e) {
    var x = e && e.dtend;
    if (!x) return NaN;
    if (x.dateTime) return new Date(x.dateTime).getTime();
    if (x.date) return new Date(String(x.date).slice(0, 10) + 'T12:00:00').getTime();
    return NaN;
  }

  // Festival-local (PDT = UTC-7) weekday test, and how far past a week's own
  // span we reach to scoop the bordering weekend from a neighbor week.
  var PDT_OFFSET_MS = 7 * 60 * 60 * 1000;
  var WEEKEND_PAD_MS = 3 * 24 * 60 * 60 * 1000;

  function isWeekendPdt(ms) {
    if (!isFinite(ms)) return false;
    var dow = new Date(ms - PDT_OFFSET_MS).getUTCDay(); // 0 Sun … 6 Sat, festival-local
    return dow === 0 || dow === 6;
  }

  /**
   * Weeks are cut at local Monday 00:00, so each week already owns its trailing
   * Sat/Sun. To keep lead-in / lead-out continuity we also pull the weekend that
   * borders this week from the neighbor weeks' pools — but only weekend (Sat/Sun)
   * occurrences within a few days of the week span, and never anything whose uid
   * is already loaded (dedup), so no event renders twice.
   * @param {1|2|3|4} week
   * @param {Array} base sessions that belong to this week
   * @returns {Array} base + bordering-weekend extras
   */
  function appendAdjacentWeekendEvents(week, base) {
    base = base || [];
    var out = [];
    var seen = {};
    var winStart = Infinity;
    var winEnd = -Infinity;
    for (var i = 0; i < base.length; i++) {
      var e = base[i];
      out.push(e);
      if (e && e.uid != null) seen[e.uid] = true;
      var s = edgeEventStartMs(e);
      var en = edgeEventEndMs(e);
      if (isFinite(s)) {
        if (s < winStart) winStart = s;
        if (s > winEnd) winEnd = s;
      }
      if (isFinite(en) && en > winEnd) winEnd = en;
    }
    if (!isFinite(winStart) || !isFinite(winEnd)) return out;

    var lo = winStart - WEEKEND_PAD_MS;
    var hi = winEnd + WEEKEND_PAD_MS;
    for (var wk = 1; wk <= 4; wk++) {
      if (wk === Number(week)) continue;
      var pool = sessionsByWeek[wk] || [];
      for (var j = 0; j < pool.length; j++) {
        var ev = pool[j];
        if (!ev || ev.uid == null || seen[ev.uid]) continue;
        var es = edgeEventStartMs(ev);
        if (!isFinite(es) || es < lo || es > hi) continue;
        if (!isWeekendPdt(es)) continue;
        seen[ev.uid] = true;
        out.push(ev);
      }
    }
    return out;
  }

  function toVEvents(raw) {
    if (typeof VEvent === 'undefined') return raw;
    return raw.map(function (e) {
      return VEvent.fromJSON(e);
    });
  }

  function buildLayerStyles(extra) {
    var meshStyle = { plotType: 'polygon3d', visible: true };
    var base = {
      'Edge-City-Esmeralda-2026': Object.assign({ color: '#f15bb5' }, meshStyle),
      Fitness: Object.assign({ color: '#ef476f' }, meshStyle),
      Wellness: Object.assign({ color: '#9b5de5' }, meshStyle),
      Salon: Object.assign({ color: '#00b4d8' }, meshStyle),
      Workshop: Object.assign({ color: '#7b2cbf' }, meshStyle),
      Bio: Object.assign({ color: '#06d6a0' }, meshStyle),
      Meal: Object.assign({ color: '#ffd166' }, meshStyle),
      Nature: Object.assign({ color: '#2ec4b6' }, meshStyle),
      Social: Object.assign({ color: '#f15bb5' }, meshStyle),
      Dance: Object.assign({ color: '#ff6b9d' }, meshStyle)
    };
    // Real Edge-track categories registered by the generated session pack.
    Object.keys(extraCategoryColors).forEach(function (cat) {
      base[cat] = Object.assign({ color: extraCategoryColors[cat] }, meshStyle);
    });
    return Object.assign(base, extra || {});
  }

  /**
   * @param {1|2|3|4} week
   * @param {{ navigateTo?: Date, zoomLevel?: number }} opts
   */
  function loadEdgeEsmeraldaWeek(week, opts) {
    opts = opts || {};
    var w = Number(week);
    var meta = weekMeta[w];
    if (!meta) {
      console.warn('Edge Esmeralda: unknown week', week);
      return 0;
    }

    var gl = typeof global.getGL === 'function' ? global.getGL() : null;
    if (!gl || typeof gl.ingestEvents !== 'function') {
      console.warn('CircaevumGL not ready; try again after scene init.');
      return 0;
    }

    // No concurrency cap: pass every real session through. The GL packs
    // overlapping sub-day events into readable radial lanes (see event-renderer).
    // Also fold in the weekend that borders this week (from neighbor weeks) for
    // continuity, deduped by uid so nothing loads twice.
    var weekSessions = appendAdjacentWeekendEvents(w, sessionsByWeek[w] || []);
    var combined = longTermEvents.concat(weekSessions);
    var vevents = toVEvents(combined);
    var mergedStyles = buildLayerStyles(
      gl.layerStylesByCategory && typeof gl.layerStylesByCategory === 'object'
        ? gl.layerStylesByCategory
        : {}
    );

    if (typeof gl.setTimelineEventFilter === 'function') {
      gl.setTimelineEventFilter('all');
    }

    var layer = gl.getLayer && gl.getLayer(LAYER_ID);
    if (!layer && typeof gl.addLayer === 'function') {
      gl.addLayer(LAYER_ID, {
        name: meta.layerName,
        plotType: 'polygon3d',
        opacity: 0.92,
        visible: true
      });
    } else if (layer) {
      layer.name = meta.layerName;
      layer.plotType = 'polygon3d';
      layer.opacity = 0.92;
      layer.visible = true;
    }

    gl.ingestEvents(LAYER_ID, vevents, {
      sessionId: 'edge-esmeralda-2026-w' + w,
      layerStyles: mergedStyles,
      timelineEventFilter: 'all',
      circadianShortEventScope: 'year'
    });

    if (typeof global.setCircadianShortEventScope === 'function') {
      global.setCircadianShortEventScope('year');
    }

    var anchor =
      opts.navigateTo instanceof Date && !isNaN(opts.navigateTo.getTime())
        ? opts.navigateTo
        : meta.navigateTo;
    var zoom = opts.zoomLevel != null ? opts.zoomLevel : meta.zoomLevel;
    var applyZoom = typeof global.setZoomLevel === 'function' ? global.setZoomLevel : null;
    if (applyZoom) {
      applyZoom(zoom, anchor);
    } else {
      if (typeof gl.setZoomLevel === 'function') gl.setZoomLevel(zoom);
      if (typeof gl.navigateToTime === 'function') gl.navigateToTime(anchor);
    }
    if (typeof global.createPlanets === 'function' && typeof global.currentZoom !== 'undefined') {
      global.createPlanets(global.currentZoom);
    }
    if (typeof gl.setLayerVisibility === 'function') {
      gl.setLayerVisibility(LAYER_ID, true);
    }
    if (typeof global.circaevumSelectedLayerId !== 'undefined') {
      global.circaevumSelectedLayerId = LAYER_ID;
    }
    if (typeof gl.refreshAllEventLayers === 'function') {
      gl.refreshAllEventLayers();
    }
    if (typeof global.refreshCalendarLayersList === 'function') global.refreshCalendarLayersList();
    if (typeof global.refreshEventsList === 'function') global.refreshEventsList(false);
    return vevents.length;
  }

  global.edgeEsmeralda2026LongTermEvents = longTermEvents;
  global.edgeEsmeralda2026LayerId = LAYER_ID;
  global.registerEdgeEsmeraldaWeekSessions = registerEdgeEsmeraldaWeekSessions;
  global.registerEdgeEsmeraldaCategoryColors = registerEdgeEsmeraldaCategoryColors;
  global.loadEdgeEsmeraldaWeek = loadEdgeEsmeraldaWeek;
  global.loadEdgeEsmeraldaWeek1Samples = function (opts) {
    return loadEdgeEsmeraldaWeek(1, opts);
  };
  global.loadEdgeEsmeraldaWeek2Samples = function (opts) {
    return loadEdgeEsmeraldaWeek(2, opts);
  };
  global.loadEdgeEsmeraldaWeek3Samples = function (opts) {
    return loadEdgeEsmeraldaWeek(3, opts);
  };
  global.loadEdgeEsmeraldaWeek4Samples = function (opts) {
    return loadEdgeEsmeraldaWeek(4, opts);
  };
})(typeof window !== 'undefined' ? window : this);
