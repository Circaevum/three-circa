// @ts-check
/**
 * events/lod.js — Level-of-detail budgets and priority
 * Split from renderers/event-renderer.js:85-130 for readability.
 * Depends on window.RENDERING_CONFIG (config-rendering.js) and
 * getZoomLevelForEvents, shouldRenderDayFrameSubDayOnAnnualHelix, isCircadianHelixZoom
 * defined later in event-renderer.js — this module exposes pure helpers that
 * event-renderer wires at runtime.
 */
(function (global) {
  const RC = (typeof window !== 'undefined' && window.RENDERING_CONFIG) || {};
  const TUBE = RC.TUBE_LOD || { BUDGET: 48, QUALITY_FLOOR: 0.34, PREFER_LINE_QUALITY: 0.55, FAR_FACTOR: 2 };
  const DENSITY = RC.DENSITY_BUDGET || { 0: 120, 1: 20, 2: 40, 3: 300, 4: 300, 5: 300, 6: 300, 7: 80, 8: 700, 9: 120 };

  /** Adaptive tube quality 1→0.34, budget 48 — see event-renderer.js:45 */
  function computeEventTubeQualityScale(eventCount) {
    const n = Math.max(1, eventCount | 0);
    if (n <= TUBE.BUDGET) return 1;
    const s = Math.sqrt(TUBE.BUDGET / n);
    return Math.max(TUBE.QUALITY_FLOOR, Math.min(1, s));
  }

  function getEventDensityBudget(zoomLevel) {
    const z = typeof zoomLevel === 'number' && !isNaN(zoomLevel) ? Math.floor(zoomLevel) : 5;
    return DENSITY[z] ?? 100;
  }

  // Expose; event-renderer will delegate to these when present
  const Lod = {
    TUBE,
    DENSITY,
    computeEventTubeQualityScale,
    getEventDensityBudget,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Lod;
  else {
    global.EventLod = Lod;
    // Back-compat: keep globals so existing event-renderer fallbacks work
    global.computeEventTubeQualityScale = computeEventTubeQualityScale;
    global.getEventDensityBudget = getEventDensityBudget;
    global.DENSITY_BUDGET = DENSITY;
    global.EVENT_TUBE_BUDGET = TUBE.BUDGET;
  }
})(typeof window !== 'undefined' ? window : globalThis);
