// @ts-check
/**
 * events/labels.js — label placement on ribbon surface
 * Split from renderers/event-renderer.js:4888-5600.
 * - planeDimsAtIndex, addSurfaceLabel, addEventWorldlineLabelSprites
 * Labels are plane meshes via EventLabelRenderer.createEventSurfaceTextMesh,
 * placed via sampleRibbonSurfaceFrame + placeMeshOnRibbonFrame, vertex-flattened.
 * This file documents contract and exposes helpers; bodies remain in event-renderer
 * until next incremental move (delegates via window.EventLabels when present).
 */
(function (global) {
  /**
   * Compute label plane dimensions at ribbon index.
   * Pure helper — moved from event-renderer.js:4961 planeDimsAtIndex.
   * Takes explicit geometry so it can be unit-tested without closure.
   * @param {number} idx - ribbon index
   * @param {number} fontPx
   * @param {string} text
   * @param {string} kind - 'mid'|'start'|'end'
   * @param {Float32Array|Array<number>} innerFlat
   * @param {Float32Array|Array<number>} outerFlat
   * @param {number} earthDist
   * @param {number} [daysForLabels] - duration days for long/short sizing
   * @param {number} [ribbonLabelRadialT] - radial t (0.05 day-frame, 0.38 week corridor, 0.5 default)
   */
  function planeDimsAtIndex(idx, fontPx, text, kind, innerFlat, outerFlat, earthDist, daysForLabels, ribbonLabelRadialT) {
    var n = innerFlat ? innerFlat.length / 3 : 2;
    var chordLen = 0;
    if (typeof global.chordLenAlongInner === 'function') {
      var spanHalf = Math.max(2, Math.floor((n - 1) / 5));
      var i0 = Math.max(0, idx - spanHalf), i1 = Math.min(n - 1, idx + spanHalf);
      chordLen = global.chordLenAlongInner(innerFlat, i0, i1);
    } else {
      chordLen = earthDist * 0.04;
    }
    var t = typeof ribbonLabelRadialT === 'number' ? ribbonLabelRadialT : 0.5;
    var fr = null;
    if (typeof global.sampleRibbonSurfaceFrame === 'function') fr = global.sampleRibbonSurfaceFrame(innerFlat, outerFlat, idx, t);
    else if (global.EventGeometry && typeof global.EventGeometry.sampleRibbonSurfaceFrame === 'function') fr = global.EventGeometry.sampleRibbonSurfaceFrame(innerFlat, outerFlat, idx, t);
    if (!fr) return { planeW: earthDist * 0.08, planeH: earthDist * 0.045, fr: null, chord: chordLen || earthDist * 0.04 };
    var band = fr.band;
    var len = text ? String(text).length : 4;
    var isEndpoint = kind === 'start' || kind === 'end';
    var days = typeof daysForLabels === 'number' && !isNaN(daysForLabels) ? daysForLabels : 7;
    var longT = Math.max(0, Math.min(1, Math.log(1 + Math.max(1, days)) / Math.log(400)));
    var kindMul = isEndpoint ? (0.26 + 0.2 * (1 - longT)) * (0.55 + 0.45 * Math.min(1, 5 / Math.max(3, len))) : 1;
    var ribbonRadCap = band * (isEndpoint ? 0.96 : 0.91);
    var radialFromChars = len * earthDist * 0.0082 * kindMul;
    var radialFloor = isEndpoint ? Math.max(band * (0.36 + 0.2 * (1 - longT)), earthDist * 0.02) * kindMul : Math.max(band * 0.68, earthDist * 0.012);
    var planeW = Math.min(earthDist * 0.22, Math.max(radialFloor, radialFromChars));
    if (isEndpoint) planeW = Math.min(planeW, earthDist * (0.068 + 0.04 * (1 - longT)));
    planeW = Math.min(planeW, ribbonRadCap);
    var along = Math.max(earthDist * 0.036, chordLen * 0.32 + fontPx * earthDist * 0.0022);
    if (isEndpoint) along *= 0.52 + 0.28 * (1 - longT);
    var planeH = Math.min(earthDist * 0.16, Math.max(earthDist * 0.026, along));
    return { planeW: planeW, planeH: planeH, fr: fr, chord: chordLen };
  }

  /**
   * Create a surface label mesh on ribbon — facade for EventLabelRenderer.
   * Real impl stays in event-renderer (closure over innerFlat etc.); this helper
   * provides the pure sizing part for unit tests and future move.
   */
  function createLabelMesh(text, colorHex, planeW, planeH, fontPx, maxWrapPx) {
    if (typeof global.EventLabelRenderer !== 'undefined' && global.EventLabelRenderer.createEventSurfaceTextMesh) {
      return global.EventLabelRenderer.createEventSurfaceTextMesh(text, colorHex, planeW, planeH, fontPx, 'left', true, false, maxWrapPx);
    }
    if (typeof window !== 'undefined' && window.EventLabelRenderer && window.EventLabelRenderer.createEventSurfaceTextMesh) {
      return window.EventLabelRenderer.createEventSurfaceTextMesh(text, colorHex, planeW, planeH, fontPx, 'left', true, false, maxWrapPx);
    }
    return null;
  }

  function addSurfaceLabel() {
    // Stub: actual closure impl in event-renderer.js:addSurfaceLabel — this module exposes sizing
    return null;
  }

  const Labels = {
    Renderer: (typeof window !== 'undefined' && window.EventLabelRenderer) || null,
    planeDimsAtIndex,
    createLabelMesh,
    addSurfaceLabel,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Labels;
  else global.EventLabels = Labels;
})(typeof window !== 'undefined' ? window : globalThis);
