/**
 * events/bands.js — radial band math for event ribbons
 * Split from renderers/event-renderer.js:500-650.
 * Maps durationDays → inner/outer radii, matching TimeMarkers zones.
 */
(function (global) {
  function getEventBandRadii(earthDist, durationDays) {
    const W = earthDist;
    const zones = (typeof TimeMarkers !== 'undefined' && typeof TimeMarkers.getCanonicalRadialZones === 'function')
      ? TimeMarkers.getCanonicalRadialZones(W)
      : null;

    const rQuarterInner = zones ? zones.quarter.inner : W * 0.125;
    const rQuarterOuter = zones ? zones.quarter.outer : W * 0.25;
    const rMonthInner   = zones ? zones.month.inner   : W * 0.25;
    const rMonthOuter   = zones ? zones.month.outer   : W * 0.50;
    const rWeekInner    = zones ? zones.week.inner    : W * 0.50;
    const rWeekOuter    = zones ? zones.week.outer    : W * 0.625;

    const d = Math.max(durationDays, 1e-4);
    let rInner, rOuter;
    if (d > 365) {
      rInner = W * 0.04;
      rOuter = rQuarterInner;
    } else if (d > 30) {
      const t = Math.min(1, (d - 30) / (365 - 30));
      rInner = rQuarterOuter * 0.88;
      rOuter = rQuarterOuter + (rMonthOuter - rQuarterOuter) * (0.35 + 0.65 * t);
    } else if (d > 7) {
      const t = Math.min(1, (d - 7) / (30 - 7));
      rInner = rMonthInner;
      rOuter = rMonthInner + (rMonthOuter - rMonthInner) * Math.max(0.6, t);
    } else if (d > 1) {
      const t = Math.min(1, (d - 1) / (7 - 1));
      rInner = rWeekInner;
      rOuter = rWeekInner + (rWeekOuter - rWeekInner) * Math.max(0.6, t);
    } else {
      rInner = rWeekOuter;
      rOuter = zones ? zones.day.outer : W * 0.75;
    }
    return { rInner, rOuter };
  }

  function eventBandUsesWeekCorridor(days) {
    const d = typeof days === 'number' && !isNaN(days) ? days : 0;
    return d > 7 && d <= 30;
  }

  const Bands = { getEventBandRadii, eventBandUsesWeekCorridor };
  if (typeof module !== 'undefined' && module.exports) module.exports = Bands;
  else {
    global.EventBands = Bands;
    global.getEventBandRadii = getEventBandRadii;
    global.eventBandUsesWeekCorridor = eventBandUsesWeekCorridor;
  }
})(typeof window !== 'undefined' ? window : globalThis);
