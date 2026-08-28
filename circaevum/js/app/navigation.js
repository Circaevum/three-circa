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

  /** W/S ladder — skip Lunar (6). Digit 6 still jumps there. */
  var KEYBOARD_ZOOM_SEQUENCE = [1, 2, 3, 4, 5, 7, 8, 9, 0];

  function getCurrentZoomLevel() {
    if (typeof global.getCurrentZoomLevel === 'function' && global.getCurrentZoomLevel !== getCurrentZoomLevel) {
      try {
        var z = global.getCurrentZoomLevel();
        if (typeof z === 'number' && !isNaN(z)) return z;
      } catch (e) {}
    }
    return typeof global.currentZoom === 'number' ? global.currentZoom : 4;
  }

  function getNextKeyboardZoomLevel(direction, fromZoom) {
    var cur = typeof fromZoom === 'number' ? fromZoom : getCurrentZoomLevel();
    if (cur === 6) return direction > 0 ? 7 : 5;
    var currentIdx = KEYBOARD_ZOOM_SEQUENCE.indexOf(cur);
    var nextIdx = currentIdx === -1
      ? (direction > 0 ? 0 : KEYBOARD_ZOOM_SEQUENCE.length - 1)
      : currentIdx + (direction > 0 ? 1 : -1);
    if (nextIdx < 0 || nextIdx >= KEYBOARD_ZOOM_SEQUENCE.length) return null;
    return KEYBOARD_ZOOM_SEQUENCE[nextIdx];
  }

  function setZoomLevel(level, overrideDate) {
    if (typeof global._mainSetZoomLevel === 'function') {
      return global._mainSetZoomLevel(level, overrideDate);
    }
    if (typeof global.setZoomLevel === 'function' && global.setZoomLevel !== setZoomLevel) {
      try { return global.setZoomLevel(level, overrideDate); } catch (e) {}
    }
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
    var curZoom = getCurrentZoomLevel();
    var blockMoment = curZoom === 0;
    var doZoom = function(lvl){
      if (typeof g._mainSetZoomLevel === 'function') return g._mainSetZoomLevel(lvl);
      if (typeof g.setZoomLevel === 'function') return g.setZoomLevel(lvl);
    };
    if (key >= 0 && key <= 9) {
      if (e.repeat) return true;
      if (key !== curZoom) doZoom(key);
      return true;
    } else if (e.key.toLowerCase() === 'w') {
      if (blockMoment) return false;
      if (e.repeat) return true;
      var nz = getNextKeyboardZoomLevel(1, curZoom);
      if (typeof nz === 'number') doZoom(nz);
      return true;
    } else if (e.key.toLowerCase() === 's') {
      if (blockMoment) return false;
      if (e.repeat) return true;
      var nz2 = getNextKeyboardZoomLevel(-1, curZoom);
      if (typeof nz2 === 'number') doZoom(nz2);
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
    getNextKeyboardZoomLevel,
    setZoomLevel,
    handleKeyWASD,
    KEYBOARD_ZOOM_SEQUENCE,
    ZOOM_LEVELS: (typeof window !== 'undefined' && window.ZOOM_LEVELS) || null,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Navigation;
  else {
    global.AppNavigation = Navigation;
    if (!global.getCurrentZoomLevel) global.getCurrentZoomLevel = getCurrentZoomLevel;
    if (!global.getNextKeyboardZoomLevel) global.getNextKeyboardZoomLevel = getNextKeyboardZoomLevel;
    global.handleKeyWASD = handleKeyWASD;
    // Expose setZoomLevel via window fallback so main.js wrapper can delegate
    if (!global.AppNavigation.setZoomLevel) global.AppNavigation.setZoomLevel = setZoomLevel;
  }
})(typeof window !== 'undefined' ? window : globalThis);
