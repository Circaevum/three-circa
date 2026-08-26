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

  /** Score event for density-budget priority — moved from event-renderer.js:123-140 */
  function scoreEventPriority(event) {
    // Prefer EventRenderer helpers when available (loaded after this file)
    var getZoom = (typeof global.getZoomLevelForEvents === 'function') ? global.getZoomLevelForEvents : function(){ return 5; };
    var getStart = (typeof global.getEventStart === 'function') ? global.getEventStart : function(e){ return e && e.start ? new Date(e.start) : null; };
    var getEnd = (typeof global.getEventEnd === 'function') ? global.getEventEnd : function(e){ return e && e.end ? new Date(e.end) : null; };
    var isCirc = (typeof global.isCircadianHelixZoom === 'function') ? global.isCircadianHelixZoom : function(zl){ return zl===0||zl===5||zl===7||zl===8||zl===9; };
    var shouldDay = (typeof global.shouldRenderDayFrameSubDayOnAnnualHelix === 'function') ? global.shouldRenderDayFrameSubDayOnAnnualHelix : function(){ return false; };
    try {
      var zl = getZoom();
      var start = getStart(event);
      var end = getEnd(event);
      var durationMs = (end && start) ? Math.max(0, end.getTime() - start.getTime()) : 0;
      var recencyScore = start ? start.getTime() / 1e12 : 0;
      var durationDays = durationMs / 86400000;
      var durationScore = durationDays > 0 ? Math.log2(1 + durationDays) : 0;
      var steBoostMag = (zl === 8 || zl === 9 || zl === 0) ? 5.0 : 1.5;
      var steBoost = (durationDays < 1 && isCirc(zl)) ? steBoostMag : 0;
      var dayFrameLteBoost = durationDays < 2 && shouldDay() ? 2.2 : 0;
      return durationScore + recencyScore + steBoost + dayFrameLteBoost;
    } catch (e) { return 0; }
  }

  // Expose; event-renderer will delegate to these when present
  const Lod = {
    TUBE,
    DENSITY,
    computeEventTubeQualityScale,
    getEventDensityBudget,
    scoreEventPriority,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Lod;
  else {
    global.EventLod = Lod;
    // Back-compat: keep globals so existing event-renderer fallbacks work
    global.computeEventTubeQualityScale = computeEventTubeQualityScale;
    global.scoreEventPriority = scoreEventPriority;
    global.getEventDensityBudget = getEventDensityBudget;
    global.DENSITY_BUDGET = DENSITY;
    global.EVENT_TUBE_BUDGET = TUBE.BUDGET;
  }
})(typeof window !== 'undefined' ? window : globalThis);
