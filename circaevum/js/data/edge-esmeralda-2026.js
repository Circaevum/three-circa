/**
 * Edge Esmeralda 2026 — festival + week-span long-term events (CSV) and shared layer loader.
 * Session packs register via registerEdgeEsmeraldaWeekSessions (e.g. week1-samples.js).
 */
(function (global) {
  var LOC = 'Edge Esmeralda, Healdsburg, CA';
  var LAYER_ID = 'edge-esmeralda-2026';

  var longTermEvents = [
    {
      uid: 'ee26-festival',
      summary: 'Edge City Esmeralda 2026',
      description: 'Full village season — https://www.edgeesmeralda.com/',
      location: LOC,
      dtstart: { dateTime: '2026-05-31T13:00:00Z' },
      dtend: { dateTime: '2026-06-29T02:00:00Z' },
      color: '#f15bb5',
      categories: ['Edge-City-Esmeralda-2026'],
      status: 'CONFIRMED',
      url: 'https://www.edgeesmeralda.com/'
    },
    {
      uid: 'ee26-w1-span',
      summary: 'Protocols for Flourishing',
      description: 'Health, longevity, consciousness, wellbeing.',
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
      description: 'AI, agents, and autonomous systems.',
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
      description: 'Art, culture, decentralized tech.',
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
      description: 'New urbanism, education, built environment.',
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
      title: 'Protocols for Flourishing — week span + June 1–7 sessions',
      navigateTo: new Date(2026, 5, 4, 10, 0, 0),
      zoomLevel: 8
    },
    2: {
      label: 'W2',
      layerName: 'Edge Esmeralda W2',
      title: 'Intelligence & Autonomy — week span (June 8–14)',
      navigateTo: new Date(2026, 5, 11, 10, 0, 0),
      zoomLevel: 7
    },
    3: {
      label: 'W3',
      layerName: 'Edge Esmeralda W3',
      title: 'Emergent Futures & World Building — week span (June 15–21)',
      navigateTo: new Date(2026, 5, 18, 10, 0, 0),
      zoomLevel: 7
    },
    4: {
      label: 'W4',
      layerName: 'Edge Esmeralda W4',
      title: 'Environments of Tomorrow — week span (June 22–27)',
      navigateTo: new Date(2026, 5, 25, 10, 0, 0),
      zoomLevel: 7
    }
  };

  var sessionsByWeek = { 1: [], 2: [], 3: [], 4: [] };

  function registerEdgeEsmeraldaWeekSessions(week, list) {
    var w = Number(week);
    if (w >= 1 && w <= 4 && Array.isArray(list)) {
      sessionsByWeek[w] = list;
    }
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

    var combined = longTermEvents.concat(sessionsByWeek[w] || []);
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
