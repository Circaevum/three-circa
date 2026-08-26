/**
 * events/labels.js — label placement on ribbon surface
 * Split from renderers/event-renderer.js:4888-5225 (addEventWorldlineLabelSprites).
 * Labels are plane meshes (EventLabelRenderer.createEventSurfaceTextMesh) placed via
 * sampleRibbonSurfaceFrame + placeMeshOnRibbonFrame, or sprites for short events.
 * Vertex-flattened via updateEventRibbonLabelsForFlatten, not group-scaled.
 * This file initially documents the contract; next step moves addSurfaceLabel here.
 */
(function (global) {
  const Labels = {
    Renderer: (typeof window !== 'undefined' && window.EventLabelRenderer) || null,
    // areEventTextLabelsVisibleAtCurrentZoom, areEventNameLabelsVisibleAtCurrentZoom control visibility
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Labels;
  else global.EventLabels = Labels;
})(typeof window !== 'undefined' ? window : globalThis);
