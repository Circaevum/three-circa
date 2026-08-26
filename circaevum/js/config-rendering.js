/**
 * Circaevum Rendering Configuration — centralized visual constants
 *
 * Previously scattered across event-renderer.js:1-200 and main.js:11590.
 * Keep this file loadable without build: attaches to window.RENDERING_CONFIG.
 * All values preserve prior defaults so behavior is unchanged.
 */

/** Earth orbital radius — also PLANET_DATA Earth.distance (keep equal) */
const EARTH_RADIUS = 50;

/** Event band keeps fill outside time-marker text zone (day.outer=3/4 → 25/32 gap) */
const EVENT_BAND = {
  INNER_FRACTION: 25 / 32,  // ~0.78
  OUTER_FRACTION: 58 / 64,  // ~0.906
  LINE_RADIUS_FRACTION: 55 / 64,
  LINE_LABEL_RADIUS_OFFSET: 2,
};

/** Day marker radial fractions — matches TimeMarkers day band */
const DAY_BAND = {
  INNER_FRAC: 5 / 8,
  OUTER_FRAC: 3 / 4,
  SPHERE_T: 0.05,
  NUMBER_T: 0.02,
  NAME_T: 0.88,
};
DAY_BAND.NUMBER_RADIUS_FRAC = DAY_BAND.INNER_FRAC + (DAY_BAND.OUTER_FRAC - DAY_BAND.INNER_FRAC) * DAY_BAND.NUMBER_T;
DAY_BAND.NAME_RADIUS_FRAC = DAY_BAND.INNER_FRAC + (DAY_BAND.OUTER_FRAC - DAY_BAND.INNER_FRAC) * DAY_BAND.NAME_T;
DAY_BAND.DOT_RADIUS_FRAC = DAY_BAND.INNER_FRAC + (DAY_BAND.OUTER_FRAC - DAY_BAND.INNER_FRAC) * DAY_BAND.SPHERE_T;

/** Tube outlines: linewidth ignored in WebGL, use mesh tubes */
const RIBBON_OUTLINE = {
  TUBE_RADIUS_FRAC: 0.0003, // ×earthDist
};

/** Adaptive LOD — Frenet frames dominate, not verts */
const TUBE_LOD = {
  BUDGET: 48,               // below → quality 1
  QUALITY_FLOOR: 0.34,
  PREFER_LINE_QUALITY: 0.55, // below → THREE.Line not TubeGeometry
  FAR_FACTOR: 2,            // half-spans from selected time → Line
};

/** Per-zoom event geometry caps — priority sort, overflow arc */
const DENSITY_BUDGET = {
  0: 120,  // MOMENT
  1: 20,   // CENTURY
  2: 40,   // DECADE
  3: 300,  // YEAR
  4: 300,  // QUARTER
  5: 300,  // MONTH (week corridor visible)
  6: 300,  // LUNAR
  7: 80,   // WEEK (parent week +1)
  8: 700,  // DAY
  9: 120,  // CLOCK
};

/** Animation lerp for flatten — main.js:11665 */
const ANIMATION_LERP = {
  FLATTEN_ALL: 0.08,
  FLATTEN_MARKERS: 0.08,
  EH_WARP: 0.12,
};

const RENDERING_CONFIG = {
  EARTH_RADIUS,
  EVENT_BAND,
  DAY_BAND,
  RIBBON_OUTLINE,
  TUBE_LOD,
  DENSITY_BUDGET,
  ANIMATION_LERP,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = RENDERING_CONFIG;
} else if (typeof window !== 'undefined') {
  window.RENDERING_CONFIG = RENDERING_CONFIG;
  // Back-compat globals so existing event-renderer.js works before it migrates to import
  window.EARTH_RADIUS = EARTH_RADIUS;
  window.EVENT_BAND = EVENT_BAND;
  window.DAY_BAND = DAY_BAND;
  window.RIBBON_OUTLINE = RIBBON_OUTLINE;
  window.TUBE_LOD = TUBE_LOD;
  window.DENSITY_BUDGET = DENSITY_BUDGET;
  window.ANIMATION_LERP = ANIMATION_LERP;
}
