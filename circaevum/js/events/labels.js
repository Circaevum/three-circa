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
  function planeDimsAtIndex(idx, fontPx, text, kind, innerFlat, outerFlat, earthDist) {
    // Stub: actual impl in event-renderer.js:4955 — moved here next
    const n = innerFlat ? innerFlat.length / 3 : 2;
    const spanHalf = Math.max(2, Math.floor((n - 1) / 5));
    return { planeW: earthDist * 0.08, planeH: earthDist * 0.045, chord: earthDist * 0.04 };
  }

  function addSurfaceLabel() {
    // Stub: see event-renderer.js:addSurfaceLabel
    return null;
  }

  const Labels = {
    Renderer: (typeof window !== 'undefined' && window.EventLabelRenderer) || null,
    planeDimsAtIndex,
    addSurfaceLabel,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Labels;
  else global.EventLabels = Labels;
})(typeof window !== 'undefined' ? window : globalThis);
