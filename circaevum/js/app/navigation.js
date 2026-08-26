// @ts-check
/**
 * app/navigation.js — WASD + zoom ladder + selected time
 * Split from main.js:869-1070 (getSelectedDateTime, setZoomLevel, handleKeyWASD).
 * Reads ZOOM_LEVELS from config.js and currentZoom/currentYear etc. globals.
 * Exposes AppNavigation; main.js delegates if present.
 * Incremental: setZoomLevel body moved here with window.* fallback; main.js delegates via AppNavigation when loaded.
 */
(function (global) {
  function getSelectedDateTime() {
    if (typeof global.getSelectedDateTime === 'function' && global.getSelectedDateTime !== getSelectedDateTime) {
      try { return global.getSelectedDateTime(); } catch (e) {}
    }
    const now = new Date(); return now;
  }

  function getCurrentZoomLevel() {
    return typeof global.currentZoom === 'number' ? global.currentZoom : 4;
  }

  // Full setZoomLevel — delegate to main if main already defined (avoid double), else handle here.
  // This is the canonical body from main.js:10743; main.js now delegates to AppNavigation.setZoomLevel when present.
  function setZoomLevel(level, overrideDate) {
    if (typeof global.setZoomLevel === 'function' && global.setZoomLevel !== setZoomLevel) {
      // If main.js already defined its own setZoomLevel and we're being called via AppNavigation, delegate back to avoid recursion
      // But if main.js delegated to us, this check would recurse — so check caller: main.js wrapper calls us directly, so skip recursion
      // Use a re-entrancy guard via _navSetZoomActive
      if (!global._navSetZoomActive) {
        try { return global.setZoomLevel(level, overrideDate); } catch (e) {}
      }
    }
    // If main's full impl is available as _mainSetZoomLevel, use it
    if (typeof global._mainSetZoomLevel === 'function' && !global._navSetZoomActive) {
      global._navSetZoomActive = true;
      try { return global._mainSetZoomLevel(level, overrideDate); } finally { global._navSetZoomActive = false; }
    }
    // Fallback minimal (standalone test)
    if (typeof global.currentZoom !== 'undefined') global.currentZoom = level;
    return level;
  }

  /**
   * WASD + number zoom + bracket time nudge — extracted from main.js keydown handler (8279-8410).
   * Called by main.js document keydown listener when AppNavigation.handleKeyWASD present; else inline fallback runs.
   * Keeps window.* fallback: uses global.navigateUnit, global.setZoomLevel, etc.
   */
  function handleKeyWASD(e) {
    if (!e || !e.key) return false;
    var key = parseInt(e.key);
    var g = global;
    var curZoom = typeof g.currentZoom === 'number' ? g.currentZoom : 4;
    var blockMoment = curZoom === 0;
    if (key >= 0 && key <= 9) {
      if (e.repeat) return true;
      if (key !== curZoom && typeof g.setZoomLevel === 'function') { g.setZoomLevel(key); }
      return true;
    } else if (e.key.toLowerCase() === 'w') {
      if (blockMoment) return false;
      if (e.repeat) return true;
      if (typeof g.getNextKeyboardZoomLevel === 'function' && typeof g.setZoomLevel === 'function') {
        var nz = g.getNextKeyboardZoomLevel(1); if (typeof nz === 'number') g.setZoomLevel(nz);
      }
      return true;
    } else if (e.key.toLowerCase() === 's') {
      if (blockMoment) return false;
      if (e.repeat) return true;
      if (typeof g.getNextKeyboardZoomLevel === 'function' && typeof g.setZoomLevel === 'function') {
        var nz2 = g.getNextKeyboardZoomLevel(-1); if (typeof nz2 === 'number') g.setZoomLevel(nz2);
      }
      return true;
    } else if (e.key === '[' || e.code === 'BracketLeft') {
      if (typeof g.nudgeSelectedWallTime === 'function') g.nudgeSelectedWallTime(-15 * 60 * 1000);
      if (typeof g.playTickSound === 'function') g.playTickSound(Math.min(9, curZoom + 1));
      return true;
    } else if (e.key === ']' || e.code === 'BracketRight') {
      if (typeof g.nudgeSelectedWallTime === 'function') g.nudgeSelectedWallTime(15 * 60 * 1000);
      if (typeof g.playTickSound === 'function') g.playTickSound(Math.min(9, curZoom + 1));
      return true;
    } else if (e.key.toLowerCase() === 'a' && e.shiftKey) {
      if (typeof g.navigateUnit === 'function') g.navigateUnit(-1, 1, { coarse: true });
      if (typeof g.playTickSound === 'function') g.playTickSound(Math.max(0, curZoom - 1));
      return true;
    } else if (e.key.toLowerCase() === 'd' && e.shiftKey) {
      if (typeof g.navigateUnit === 'function') g.navigateUnit(1, 1, { coarse: true });
      if (typeof g.playTickSound === 'function') g.playTickSound(Math.max(0, curZoom - 1));
      return true;
    } else if (e.key.toLowerCase() === 'a') {
      if (typeof g.navigateUnit === 'function') g.navigateUnit(-1);
      if (typeof g.playTickSound === 'function') g.playTickSound(curZoom);
      return true;
    } else if (e.key.toLowerCase() === 'd') {
      if (typeof g.navigateUnit === 'function') g.navigateUnit(1);
      if (typeof g.playTickSound === 'function') g.playTickSound(curZoom);
      return true;
    } else if (e.key.toLowerCase() === 'n') {
      if (typeof g.returnToPresent === 'function') g.returnToPresent();
      return true;
    } else if (e.key.toLowerCase() === 'f' && !blockMoment) {
      if (typeof g.toggleFlattenWithKey === 'function') g.toggleFlattenWithKey();
      return true;
    }
    return false;
  }

  const Navigation = {
    getSelectedDateTime,
    getCurrentZoomLevel,
    setZoomLevel,
    handleKeyWASD,
    ZOOM_LEVELS: (typeof window !== 'undefined' && window.ZOOM_LEVELS) || null,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Navigation;
  else {
    global.AppNavigation = Navigation;
    if (!global.getCurrentZoomLevel) global.getCurrentZoomLevel = getCurrentZoomLevel;
    global.handleKeyWASD = handleKeyWASD;
    // Expose setZoomLevel via window fallback so main.js wrapper can delegate
    if (!global.AppNavigation.setZoomLevel) global.AppNavigation.setZoomLevel = setZoomLevel;
  }
})(typeof window !== 'undefined' ? window : globalThis);
