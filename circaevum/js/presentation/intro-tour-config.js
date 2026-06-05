/**
 * Intro tour layer registry + default step timing/layers.
 * Edited values persist in localStorage (see intro-tour.js editor).
 */
(function (global) {
  var STORAGE_KEY = 'circaevum_tour_editor_v1';

  /** Scene flags controllable per tour step (passed to applyCircaevumTourScene). */
  var LAYER_DEFS = [
    { key: 'tourMinimalOrbitMode', label: 'Minimal orbit', hint: 'No helical worldlines / ghost orbit / Lagrange extras' },
    { key: 'tourHideAllTimeMarkers', label: 'Hide time markers', hint: 'Suppress all orbit time markers' },
    { key: 'tourOrbitMarkersFromCalendar', label: 'Calendar orbit markers', hint: 'Progressive markers from selected date' },
    { key: 'tourFlatCalendarStrip', label: '2D month strip', hint: 'Flat month strip overlay' },
    { key: 'tourNarrativeLightMode', label: 'Light scrub mode', hint: 'Throttle heavy rebuilds while scrubbing time' },
    { key: 'tourSolsticeCrossActive', label: 'Solstice cross', hint: 'Solstice overlay (usually runtime)' },
    { key: 'showTimeMarkerLines', label: 'Marker lines', hint: 'Time marker tick lines' },
    { key: 'showTimeMarkerText', label: 'Marker text', hint: 'Time marker labels' },
    { key: 'showFullYearTimeMarkers', label: 'Full-year markers', hint: 'All tiers on year zoom' },
    { key: 'moonLayer', label: 'Moon layer', hint: 'Moon mesh + lunar worldline' },
    { key: 'showDemoEvents', label: 'Demo events', hint: 'Tour narrative demo calendar layer' }
  ];

  /** Sliders / toggles for orbit rings, worldlines, and context arc (0–1 stored for opacity). */
  var VISUAL_ADJUSTER_DEFS = [
    {
      key: 'tourPlanetOrbitRingOpacityMul',
      label: 'Planet orbit rings',
      type: 'range',
      hint: 'Opacity of planetary orbital rings at selected time height'
    },
    {
      key: 'tourWorldlineOpacityMul',
      label: 'Worldline visibility',
      type: 'range',
      hint: 'Overall helical worldline opacity (separate from grow reveal)'
    },
    {
      key: 'tourContextArcVisible',
      label: 'Context arc',
      type: 'checkbox',
      hint: 'Event-list horizon context disc at selected time'
    }
  ];

  var MARKER_DENSITY_OPTIONS = [
    { value: '', label: 'Auto (from date)' },
    { value: 'quarters', label: 'Quarters' },
    { value: 'months', label: 'Months' },
    { value: 'weeks', label: 'Weeks' },
    { value: 'days', label: 'Days' }
  ];

  var FOCUS_OPTIONS = [
    { value: 'sun', label: 'Sun focus' },
    { value: 'earth', label: 'Earth focus' }
  ];

  /** Camera pitch presets (degrees); stored in step layers as `tourCameraPitch` radians. */
  var INCLINATION_PRESETS = [
    { deg: -45, label: 'Below' },
    { deg: 0, label: 'Horizon' },
    { deg: 45, label: 'Above' },
    { deg: 66, label: 'High above' }
  ];
  var DEFAULT_TOUR_CAMERA_PITCH = 1.15;
  var DEFAULT_TOUR_CAMERA_YAW = 0.4;
  var DEFAULT_TOUR_CAMERA_PITCH_EARTH = 0.48;

  function defaultLayers(partial) {
    var base = {
      tourMinimalOrbitMode: false,
      tourHideAllTimeMarkers: false,
      tourOrbitMarkersFromCalendar: false,
      tourFlatCalendarStrip: false,
      tourNarrativeLightMode: false,
      tourSolsticeCrossActive: false,
      tourWorldlineRevealProgress: null,
      tourYearMarkerReveal: null,
      tourMarkerDensityOverride: null,
      tourPlanetOrbitRingOpacityMul: 1,
      tourWorldlineOpacityMul: 1,
      tourContextArcVisible: false,
      tourCameraPitch: null,
      tourCameraYaw: null,
      showTimeMarkerLines: false,
      showTimeMarkerText: false,
      showFullYearTimeMarkers: false,
      moonLayer: false,
      showDemoEvents: false,
      focusTarget: 'sun'
    };
    if (partial) {
      for (var k in partial) {
        if (Object.prototype.hasOwnProperty.call(partial, k)) base[k] = partial[k];
      }
    }
    return base;
  }

  function defaultTiming(partial) {
    var base = {
      durationMs: 20000,
      baselineSpeed: 1,
      transitionInPct: 0.06,
      transitionOutPct: 0.08,
      transitionSlowdown: 0.35,
      speedKeyframes: [{ t: 0, v: 1 }, { t: 1, v: 1 }]
    };
    if (partial) {
      for (var k in partial) {
        if (Object.prototype.hasOwnProperty.call(partial, k)) base[k] = partial[k];
      }
    }
    return base;
  }

  /** Default seven-step narrative (layers + timing only; motion logic stays in intro-tour.js). */
  function buildDefaultTourDocument() {
    return {
      version: 1,
      steps: [
        {
          id: 'seq1',
          label: '1 · Earth orbits the Sun',
          zoomLevel: 3,
          timing: defaultTiming({
            durationMs: 20000,
            baselineSpeed: 1,
            transitionInPct: 0.04,
            transitionOutPct: 0.14,
            transitionSlowdown: 0.28,
            speedKeyframes: [
              { t: 0, v: 1 },
              { t: 0.82, v: 1 },
              { t: 1, v: 0.45 }
            ]
          }),
          layers: defaultLayers({
            tourMinimalOrbitMode: true,
            tourHideAllTimeMarkers: true,
            tourNarrativeLightMode: true,
            tourPlanetOrbitRingOpacityMul: 1,
            tourWorldlineOpacityMul: 0,
            tourContextArcVisible: false,
            tourCameraPitch: 1.15,
            moonLayer: false,
            focusTarget: 'sun'
          })
        },
        {
          id: 'seq2',
          label: '2 · Worldlines grow',
          zoomLevel: 3,
          timing: defaultTiming({
            durationMs: 20000,
            transitionInPct: 0.1,
            transitionOutPct: 0.1,
            speedKeyframes: [{ t: 0, v: 0.85 }, { t: 0.22, v: 1 }, { t: 1, v: 1 }]
          }),
          layers: defaultLayers({
            tourMinimalOrbitMode: false,
            tourWorldlineRevealProgress: 0,
            tourHideAllTimeMarkers: true,
            tourNarrativeLightMode: true,
            tourPlanetOrbitRingOpacityMul: 1,
            tourWorldlineOpacityMul: 1,
            tourContextArcVisible: false,
            tourCameraPitch: 1.15,
            moonLayer: false,
            focusTarget: 'sun'
          })
        },
        {
          id: 'seq3',
          label: '3 · Time markers by season',
          zoomLevel: 3,
          timing: defaultTiming({
            durationMs: 26000,
            baselineSpeed: 0.92,
            transitionInPct: 0.08,
            transitionOutPct: 0.12,
            speedKeyframes: [
              { t: 0, v: 1 },
              { t: 0.9, v: 1 },
              { t: 1, v: 0.35 }
            ]
          }),
          layers: defaultLayers({
            tourOrbitMarkersFromCalendar: true,
            tourFlatCalendarStrip: true,
            tourMarkerDensityOverride: 'quarters',
            tourNarrativeLightMode: true,
            tourPlanetOrbitRingOpacityMul: 1,
            tourWorldlineOpacityMul: 1,
            tourContextArcVisible: false,
            tourCameraPitch: 1.15,
            showTimeMarkerLines: true,
            showTimeMarkerText: true,
            moonLayer: false,
            focusTarget: 'sun'
          })
        },
        {
          id: 'seq4',
          label: '4 · Moon path (Q1)',
          zoomLevel: 6,
          timing: defaultTiming({ durationMs: 16000, baselineSpeed: 1.05 }),
          layers: defaultLayers({
            tourHideAllTimeMarkers: true,
            tourPlanetOrbitRingOpacityMul: 1,
            tourWorldlineOpacityMul: 1,
            tourContextArcVisible: false,
            tourCameraPitch: 0.5,
            tourCameraYaw: 0.42,
            moonLayer: true,
            focusTarget: 'earth'
          })
        },
        {
          id: 'seq5',
          label: '5 · Planets & Fall semester',
          zoomLevel: 3,
          timing: defaultTiming({ durationMs: 22000, baselineSpeed: 1 }),
          layers: defaultLayers({
            tourOrbitMarkersFromCalendar: true,
            tourMarkerDensityOverride: 'months',
            tourNarrativeLightMode: true,
            tourCameraPitch: 0.42,
            tourCameraYaw: 0.5,
            showTimeMarkerLines: true,
            showDemoEvents: true,
            moonLayer: 'inherit',
            focusTarget: 'sun'
          })
        },
        {
          id: 'seq6',
          label: '6 · Solstices & holidays',
          zoomLevel: 3,
          timing: defaultTiming({
            durationMs: 20000,
            transitionOutPct: 0.14,
            speedKeyframes: [{ t: 0, v: 1 }, { t: 0.55, v: 0.7 }, { t: 0.72, v: 0.55 }, { t: 1, v: 0.85 }]
          }),
          layers: defaultLayers({
            tourOrbitMarkersFromCalendar: true,
            tourNarrativeLightMode: true,
            tourCameraPitch: 1.15,
            showTimeMarkerLines: true,
            showTimeMarkerText: true,
            showDemoEvents: true,
            moonLayer: 'inherit',
            focusTarget: 'sun'
          })
        },
        {
          id: 'seq7',
          label: '7 · Spring semester & year recap',
          zoomLevel: 3,
          timing: defaultTiming({
            durationMs: 22000,
            baselineSpeed: 0.88,
            speedKeyframes: [{ t: 0, v: 1 }, { t: 0.92, v: 0.75 }, { t: 1, v: 1 }]
          }),
          layers: defaultLayers({
            tourOrbitMarkersFromCalendar: true,
            tourMarkerDensityOverride: 'months',
            tourNarrativeLightMode: true,
            tourCameraPitch: 1.15,
            showTimeMarkerLines: true,
            showTimeMarkerText: true,
            showDemoEvents: true,
            moonLayer: 'inherit',
            focusTarget: 'sun'
          })
        }
      ]
    };
  }

  function cloneJson(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function mergeStep(defaultStep, overrideStep) {
    if (!overrideStep) return cloneJson(defaultStep);
    var out = cloneJson(defaultStep);
    if (overrideStep.label) out.label = overrideStep.label;
    if (typeof overrideStep.zoomLevel === 'number') out.zoomLevel = overrideStep.zoomLevel;
    if (overrideStep.timing) {
      out.timing = defaultTiming(out.timing);
      for (var tk in overrideStep.timing) {
        if (Object.prototype.hasOwnProperty.call(overrideStep.timing, tk)) {
          out.timing[tk] = overrideStep.timing[tk];
        }
      }
    }
    if (overrideStep.layers) {
      out.layers = defaultLayers(out.layers);
      for (var lk in overrideStep.layers) {
        if (Object.prototype.hasOwnProperty.call(overrideStep.layers, lk)) {
          out.layers[lk] = overrideStep.layers[lk];
        }
      }
    }
    return out;
  }

  function loadSavedOverrides() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return parsed && parsed.steps ? parsed : null;
    } catch (e) {
      return null;
    }
  }

  function saveOverrides(doc) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
    } catch (e) {}
  }

  function clearSavedOverrides() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
  }

  function getEffectiveDocument() {
    var base = buildDefaultTourDocument();
    var saved = loadSavedOverrides();
    if (!saved || !saved.steps) return base;
    var byId = {};
    saved.steps.forEach(function (s) {
      if (s && s.id) byId[s.id] = s;
    });
    base.steps = base.steps.map(function (def) {
      return mergeStep(def, byId[def.id]);
    });
    return base;
  }

  function resolveLayersForStep(stepCfg, snapMoon) {
    var layers = cloneJson(stepCfg.layers || defaultLayers());
    if (layers.moonLayer === 'inherit') layers.moonLayer = !!snapMoon;
    if (typeof layers.moonLayer !== 'boolean') layers.moonLayer = !!snapMoon;
    var scene = cloneJson(layers);
    delete scene.showDemoEvents;
    delete scene.tourCameraPitch;
    delete scene.tourCameraYaw;
    return { scene: scene, showDemoEvents: !!layers.showDemoEvents };
  }

  function pitchRadToDeg(rad) {
    return Math.round((rad * 180) / Math.PI);
  }

  function pitchDegToRad(deg) {
    return (deg * Math.PI) / 180;
  }

  function inclinationLabelFromDeg(deg) {
    if (deg <= -15) return 'Below horizon';
    if (deg >= 15) return 'Above horizon';
    return 'Horizon';
  }

  global.CircaevumIntroTourConfig = {
    STORAGE_KEY: STORAGE_KEY,
    LAYER_DEFS: LAYER_DEFS,
    VISUAL_ADJUSTER_DEFS: VISUAL_ADJUSTER_DEFS,
    MARKER_DENSITY_OPTIONS: MARKER_DENSITY_OPTIONS,
    FOCUS_OPTIONS: FOCUS_OPTIONS,
    INCLINATION_PRESETS: INCLINATION_PRESETS,
    DEFAULT_TOUR_CAMERA_PITCH: DEFAULT_TOUR_CAMERA_PITCH,
    DEFAULT_TOUR_CAMERA_YAW: DEFAULT_TOUR_CAMERA_YAW,
    DEFAULT_TOUR_CAMERA_PITCH_EARTH: DEFAULT_TOUR_CAMERA_PITCH_EARTH,
    pitchRadToDeg: pitchRadToDeg,
    pitchDegToRad: pitchDegToRad,
    inclinationLabelFromDeg: inclinationLabelFromDeg,
    buildDefaultTourDocument: buildDefaultTourDocument,
    getEffectiveDocument: getEffectiveDocument,
    loadSavedOverrides: loadSavedOverrides,
    saveOverrides: saveOverrides,
    clearSavedOverrides: clearSavedOverrides,
    resolveLayersForStep: resolveLayersForStep,
    cloneJson: cloneJson
  };
})(typeof window !== 'undefined' ? window : globalThis);
