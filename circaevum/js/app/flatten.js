// @ts-check
/**
 * app/flatten.js — flatten (time squish) pipeline
 * Split from main.js:11580-11670 for readability.
 *
 * `flattenMode: 'off'|'markers'|'all'` lerps `currentFlattenAmount 0→1` at
 * ANIMATION_LERP.FLATTEN (0.08) — `group.scale.y = 1-amount` around
 * `flattenTimelineFocusY()` pivot, sprites compensated via baseScale / yScaleLocal,
 * ribbon planes vertex-flattened via EventRenderer.updateTimelineHelixEventsForFlatten.
 *
 * This file is a documented facade — next step moves applyFlattenToGroup body here
 * and keeps main.js as animation-loop caller. Currently re-exports the global.
 */
(function (global) {
  const Flatten = {
    /** yScaleLocal = 1 - amount*0.95, floored at 0.05 — see main.js:11591 */
    yScaleFor: function (amount) {
      const a = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
      return Math.max(0.05, 1 - a * 0.95);
    },
    /** pivot for group.position.y = pivot*(1-yScale) — sticky world origin */
    focusY: function () {
      return typeof global.flattenTimelineFocusY === 'function' ? global.flattenTimelineFocusY() : 0;
    },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Flatten;
  else global.AppFlatten = Flatten;
})(typeof window !== 'undefined' ? window : globalThis);
