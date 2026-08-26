/**
 * events/geometry.js — ribbon/tube geometry helpers
 * Split from renderers/event-renderer.js. Currently a documented facade:
 * - RibbonGeometry.fromInnerOuter (utils/ribbon-geometry.js) is cheaper than TubeGeometry
 *   (Frenet frames) — prefer ribbon fill + Line edges.
 * - createRibbonStripGeometry, buildHelixPair live here after next split.
 *
 * This file initially re-exports the shared RibbonGeometry so the pipeline is discoverable.
 * Next step will move createTubeOutlineAlongFlat, buildHelixPair, chordLenAlongInner here.
 */
(function (global) {
  const Geometry = {
    /** Prefer this over TubeGeometry — see event-renderer.js:22 RIBBON_OUTLINE 0.0003 */
    Ribbon: (typeof window !== 'undefined' && window.RibbonGeometry) || null,
    MeshPrimitives: (typeof window !== 'undefined' && window.MeshPrimitives) || null,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Geometry;
  else global.EventGeometry = Geometry;
})(typeof window !== 'undefined' ? window : globalThis);
