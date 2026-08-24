/**
 * Circaevum Zoom Helpers & Predicates
 * Shared zoom level utilities, detail zoom level checks, and flatten Y-scale formulas.
 */
(function (global) {
  'use strict';

  const ZOOM_NAMES = {
    0: 'Moment',
    1: 'Century',
    2: 'Decade',
    3: 'Year',
    4: 'Quarter',
    5: 'Month',
    6: 'Lunar',
    7: 'Week',
    8: 'Day',
    9: 'Hour'
  };

  /**
   * True for zoom levels that show detailed daily event geometry and ribbons
   * (Moment 0, Quarter 4, Month 5, Lunar 6, Week 7, Day 8, Hour 9).
   */
  function isDetailZoomLevel(zl) {
    const z = typeof zl === 'number' && !isNaN(zl) ? Math.floor(zl) : (typeof global.currentZoom === 'number' ? global.currentZoom : 5);
    return z === 0 || (z >= 4 && z <= 9);
  }

  /**
   * Human-readable label for a zoom level integer (0..9).
   */
  function getZoomLevelName(zl) {
    const z = typeof zl === 'number' && !isNaN(zl) ? Math.floor(zl) : 5;
    return ZOOM_NAMES[z] || `Zoom ${z}`;
  }

  /**
   * Canonical Y-scale factor for flattening 3D helical geometry to 2D flat projection (0 = 100% flat, 1 = unflattened).
   */
  function getFlattenYScale(amount) {
    const a = typeof amount === 'number' && !isNaN(amount) ? amount : (typeof global.currentFlattenAmount === 'number' ? global.currentFlattenAmount : 0);
    return Math.max(0, 1 - a);
  }

  const ZoomHelpers = {
    isDetailZoomLevel,
    getZoomLevelName,
    getFlattenYScale,
    ZOOM_NAMES
  };

  global.ZoomHelpers = ZoomHelpers;
  global.isDetailZoomLevel = isDetailZoomLevel;
  global.getZoomLevelName = getZoomLevelName;
  global.getFlattenYScale = getFlattenYScale;

})(typeof window !== 'undefined' ? window : globalThis);
