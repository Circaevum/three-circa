// @ts-check
/**
 * app/navigation.js — WASD + zoom ladder
 * Split from main.js for readability. Zoom 0..9 in config.js ZOOM_LEVELS,
 * currentZoom + selectedDate drive getSelectedDateTime(), currentFlattenAmount,
 * and TimeMarkers. W/S = zoom, A/D = time step (day/week/month per zoom).
 *
 * This file is a documented facade — next step moves handleKeyWASD, setZoomLevel,
 * getSelectedDateTime, and ZOOM_LEVELS focus logic here.
 */
(function (global) {
  const Navigation = {
    ZOOM_LEVELS: (typeof window !== 'undefined' && window.ZOOM_LEVELS) || null,
    currentZoom: function () {
      return typeof global.getCurrentZoomLevel === 'function' ? global.getCurrentZoomLevel() : 4;
    },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Navigation;
  else global.AppNavigation = Navigation;
})(typeof window !== 'undefined' ? window : globalThis);
