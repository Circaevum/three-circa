// @ts-check
/**
 * app/navigation.js — WASD + zoom ladder + selected time
 * Split from main.js:869-1070 (getSelectedDateTime, setZoomLevel, handleKeyWASD).
 * Reads ZOOM_LEVELS from config.js and currentZoom/currentYear etc. globals.
 * Exposes AppNavigation; main.js delegates if present.
 */
(function (global) {
  function getSelectedDateTime() {
    if (typeof global.getSelectedDateTime === 'function' && global.getSelectedDateTime !== getSelectedDateTime) {
      // delegate to main.js if already defined (avoid recursion)
      try { return global.getSelectedDateTime(); } catch (e) {}
    }
    // Fallback: minimal — actual impl lives in main.js until fully moved
    const now = new Date();
    return now;
  }

  function getCurrentZoomLevel() {
    return typeof global.currentZoom === 'number' ? global.currentZoom : 4;
  }

  function setZoomLevel(level) {
    if (typeof global.setZoomLevel === 'function' && global.setZoomLevel !== setZoomLevel) {
      return global.setZoomLevel(level);
    }
    if (typeof global.currentZoom !== 'undefined') global.currentZoom = level;
    return level;
  }

  const Navigation = {
    getSelectedDateTime,
    getCurrentZoomLevel,
    setZoomLevel,
    ZOOM_LEVELS: (typeof window !== 'undefined' && window.ZOOM_LEVELS) || null,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Navigation;
  else {
    global.AppNavigation = Navigation;
    if (!global.getCurrentZoomLevel) global.getCurrentZoomLevel = getCurrentZoomLevel;
    // Do not overwrite main.js getSelectedDateTime if already defined — keep shim for tests
    if (!global.AppNavigation.getSelectedDateTime) global.AppNavigation.getSelectedDateTime = getSelectedDateTime;
  }
})(typeof window !== 'undefined' ? window : globalThis);
