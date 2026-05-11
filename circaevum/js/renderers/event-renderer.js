/**
 * Event Renderer - Renders VEVENTs as EventObjects in the 3D scene
 *
 * Creates basic Three.js meshes (markers or short worldlines) for events,
 * so the Circaevum GL API can display event data from layers (e.g. account-managed React).
 *
 * EventObject: a Three.js object with userData.vevent, userData.layerId, userData.type === 'EventObject'
 *
 * Dependencies (globals): THREE, calculateDateHeight, calculateCurrentDateHeight, SceneGeometry
 * Optional: PLANET_DATA (Earth distance), or use default radius 50
 */

(function (global) {
  const EARTH_RADIUS = 50;
  // Radius bounds: keep events outside the time-marker text zone (day names, week labels, etc.)
  // so event fill doesn't sit under markers and render as outline-only. Time markers use
  // day.outer = 3/4; we start events just outside that (25/32) for a clear gap.
  const EVENT_RADIUS_INNER_FRACTION = 25 / 32;  // ~0.78 — clear of day.outer (3/4)
  const EVENT_RADIUS_OUTER_FRACTION = 58 / 64; // outer bound toward Earth
  const EVENT_LINE_RADIUS_FRACTION = 55 / 64;
  const EVENT_LINE_LABEL_RADIUS_OFFSET = 2; // Labels this much farther out than the arc
  /** Match TimeMarkers RADII_CONFIG.day: day numbers at 21/32, day names at 23/32 — dots sit between. */
  const DAY_NUMBER_RADIUS_FRAC = 21 / 32;
  const DAY_NAME_RADIUS_FRAC = 23 / 32;
  const DAY_EVENT_DOT_RADIUS_FRAC = (DAY_NUMBER_RADIUS_FRAC + DAY_NAME_RADIUS_FRAC) / 2;
  /**
   * LineBasicMaterial.linewidth is ignored in WebGL on most platforms; ribbon outlines use mesh tubes instead.
   * Radius = earthDist * FRAC * (outline emphasis); ~0.005 reads clearly at Earth orbit scale (~50).
   */
  const RIBBON_OUTLINE_TUBE_RADIUS_FRAC = 0.0003;

  /** Multi-day ribbon fills at or above this span use a radial alpha gradient (opaque at Sun-ward inner edge, fading toward outer). */
  const LONG_EVENT_RIBBON_RADIAL_GRADIENT_MIN_DAYS = 1;
  /** Outer-edge fill alpha = fillOpacity × this (inner edge uses full fillOpacity). Outlines are unchanged. */
  const LONG_EVENT_RIBBON_OUTER_FILL_ALPHA_RATIO = 0.1;
  /** In alpha-fade mode, out-of-window long-term fills reduce inner alpha more than outer (but never disappear). */
  const LONG_EVENT_CONTEXT_INNER_ALPHA_MIN = 0.28;
  const LONG_EVENT_CONTEXT_OUTER_ALPHA_MIN = 0.18;

  function longEventRibbonUsesRadialFillGradient(durationDays) {
    return durationDays >= LONG_EVENT_RIBBON_RADIAL_GRADIENT_MIN_DAYS;
  }

  function getLongEventContextFadeMode() {
    if (typeof global.getLongEventContextFadeMode === 'function') {
      const mode = String(global.getLongEventContextFadeMode() || '').toLowerCase();
      if (mode === 'alpha') return 'alpha';
      if (mode === 'desaturate') return 'desaturate';
    }
    return 'desaturate';
  }

  /**
   * @param {number} fillHex
   * @param {number} fillOpacity - same combined opacity as MeshBasicMaterial (capped)
   * @param {object} THREE - global THREE
   */
  function createLongTermRibbonFillShaderMaterial(fillHex, fillOpacity, THREE, innerScale, outerScale) {
    const inScale = innerScale != null ? innerScale : 1;
    const outScale = outerScale != null ? outerScale : 1;
    const innerA = Math.min(1, Math.max(0, fillOpacity * inScale));
    const outerA = Math.min(1, Math.max(0, fillOpacity * LONG_EVENT_RIBBON_OUTER_FILL_ALPHA_RATIO * outScale));
    return new THREE.ShaderMaterial({
      uniforms: {
        diffuse: { value: new THREE.Color(fillHex) },
        innerAlpha: { value: innerA },
        outerAlpha: { value: outerA }
      },
      vertexShader: [
        'attribute float ribbonEdge;',
        'varying float vRibbonEdge;',
        'void main() {',
        '  vRibbonEdge = ribbonEdge;',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 diffuse;',
        'uniform float innerAlpha;',
        'uniform float outerAlpha;',
        'varying float vRibbonEdge;',
        'void main() {',
        '  float a = mix(innerAlpha, outerAlpha, vRibbonEdge);',
        '  gl_FragColor = vec4(diffuse, a);',
        '}'
      ].join('\n'),
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 2,
      polygonOffsetUnits: 1
    });
  }

  function getZoomLevelForEvents() {
    if (typeof global.getCurrentZoomLevel === 'function') return global.getCurrentZoomLevel();
    return 5;
  }

  /** Match main.js: landing/month/week/day/clock show circadian helix ribbons and connectors. */
  function isCircadianHelixZoom(zl) {
    return zl === 0 || zl === 5 || zl === 7 || zl === 8 || zl === 9;
  }

  /** While flatten squishes the annual timeline, short circadian geometry stays in world Y — parent to sceneContentGroup, not flattenableGroup. */
  function shouldAttachShortCircadianToWorldGroup() {
    if (typeof global.isFlattenTimeStraightenActive !== 'function' || !global.isFlattenTimeStraightenActive()) return false;
    const circ = normalizedCircadianState();
    if (circ === 'off') return false;
    return isCircadianHelixZoom(getZoomLevelForEvents());
  }

  function getCircadianStraightenBlendForEvents() {
    if (typeof global.getCircadianStraightenBlend === 'function') {
      return Math.min(1, Math.max(0, global.getCircadianStraightenBlend()));
    }
    return 0;
  }

  /** Treat anything other than straightened/wrapped as off (avoids undefined behaving like “on”). */
  function normalizedCircadianState() {
    const raw = typeof global.getCircadianRhythmState === 'function' ? global.getCircadianRhythmState() : 'off';
    if (raw === 'straightened' || raw === 'wrapped') return raw;
    return 'off';
  }

  /** Hide events outside scoped window: Moment (0) & Clock (9) always use selected local day (even if UI scope is “year”). */
  function shouldHideCircadianShortEventForDayScope(start, end) {
    const zl = getZoomLevelForEvents();
    const selFn = getSelectedDateTimeFn();
    if (!selFn || !start || isNaN(start.getTime())) return false;
    const sel = selFn();
    const evEnd = end && end > start ? end : new Date(start.getTime() + 3600000);

    if (zl === 0 || zl === 9) {
      const dayStart = new Date(sel.getFullYear(), sel.getMonth(), sel.getDate(), 0, 0, 0, 0);
      const dayEnd = new Date(dayStart.getTime());
      dayEnd.setDate(dayEnd.getDate() + 1);
      const overlap = evEnd > dayStart && start < dayEnd;
      return !overlap;
    }

    if (typeof global.getCircadianShortEventScope === 'function' && global.getCircadianShortEventScope() === 'year') {
      return false;
    }

    const circ = normalizedCircadianState();
    if (!isCircadianHelixZoom(zl) || circ === 'off') return false;

    if (zl === 8) {
      const wk = startOfLocalWeekSunday(sel);
      if (wk) {
        return !eventOverlapsLocalWeek(start, evEnd, wk);
      }
    }

    const dayStart = new Date(sel.getFullYear(), sel.getMonth(), sel.getDate(), 0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime());
    dayEnd.setDate(dayEnd.getDate() + 1);
    const overlap = evEnd > dayStart && start < dayEnd;
    return !overlap;
  }

  /** Zoom 0 / 9: drop multi-day (and any) geometry that does not intersect the selected local calendar day. */
  function shouldHideCircadianEventOutsideSelectedDayAtClockZooms(start, end) {
    const zl = getZoomLevelForEvents();
    if (zl !== 0 && zl !== 9) return false;
    return shouldHideCircadianShortEventForDayScope(start, end);
  }

  /**
   * Extra opacity for circadian disks: ghost non-selected days; at Moment (0) only the selected hour reads.
   * When circadian is off, returns 1.
   */
  function getDailyCircadianEventOpacityMul(start, end) {
    const zl = getZoomLevelForEvents();
    const circ = normalizedCircadianState();
    const helixOn = isCircadianHelixZoom(zl) && circ !== 'off';
    if (!helixOn) return 1;

    let mul = 1;
    const onSelDay = eventTouchesSelectedCalendarDay(start, end);

    if (zl === 0) {
      if (!onSelDay) return 0;
      if (!eventTouchesSelectedHour(start, end)) mul *= 0.08;
      return Math.max(0.02, Math.min(1, mul));
    }

    if (zl === 9 && !onSelDay) return 0;

    if (!onSelDay) {
      if (zl === 8) mul *= 0.14;
      else if (zl === 5 || zl === 7) mul *= 0.22;
      else mul *= 0.28;
    }

    return Math.max(0.03, Math.min(1, mul));
  }

  /** Thinner outline tubes for short circadian ribbons so concentric arcs read separately. */
  function getShortCircadianRibbonTubeScale() {
    const zl = getZoomLevelForEvents();
    return zl === 0 ? 0.32 : 0.5;
  }

  function applyDailyCircadianLabelOpacity(sprite, start, end) {
    if (!sprite) return;
    const m = getDailyCircadianEventOpacityMul(start, end);
    const op = Math.max(0.04, Math.min(1, 0.95 * m));
    const mat = sprite.material;
    if (!mat) return;
    if (Array.isArray(mat)) mat.forEach((mm) => { if (mm && typeof mm.opacity === 'number') mm.opacity = op; });
    else if (typeof mat.opacity === 'number') mat.opacity = op;
  }

  function getOrbitAngleForShortEventPlacement(height, currentHeight) {
    const b = getCircadianStraightenBlendForEvents();
    if (typeof SceneGeometry !== 'undefined' && SceneGeometry.getAngle) {
      const aw = SceneGeometry.getAngle(height, currentHeight);
      const as = SceneGeometry.getAngle(currentHeight, currentHeight);
      return aw * (1 - b) + as * b;
    }
    return 0;
  }

  /**
   * Week+ **calendar** views: place sub-day dots in the day-number / day-name band.
   * When circadian rhythm is on at helix zooms, short events belong on the hour-hand near Earth instead.
   */
  function shouldUseDayBandDotPlacement() {
    const zl = getZoomLevelForEvents();
    if (zl < 7) return false;
    if (isCircadianHelixZoom(zl) && normalizedCircadianState() !== 'off') return false;
    return true;
  }

  /** True when sub-day geometry should follow the circadian hour-hand frame (wrapped/straightened). */
  function shouldUseCircadianNearEarthShortPlacement() {
    return isCircadianHelixZoom(getZoomLevelForEvents()) && normalizedCircadianState() !== 'off';
  }

  /**
   * World position for an instant event on the blended hour-hand tip (same frame as helix ribbons).
   * @returns {{x:number,y:number,z:number}|null}
   */
  function getInstantEventCircadianNearEarthPosition(when, currentHeight) {
    const CR = typeof global.CircadianRenderer !== 'undefined' ? global.CircadianRenderer : null;
    if (!CR || typeof CR.blendedDiskPointAtDate !== 'function' || typeof calculateDateHeight !== 'function') return null;
    if (!when || isNaN(when.getTime())) return null;
    const r = typeof CR.getHandLength === 'function' ? CR.getHandLength() * 0.88 : 10.5;
    return CR.blendedDiskPointAtDate(when, r, currentHeight, calculateDateHeight, getCircadianStraightenBlendForEvents());
  }

  /**
   * Midpoint between start/end hand tips for sub-day spans (matches ribbon locus when ribbons fail).
   * @returns {{x:number,y:number,z:number}|null}
   */
  function getShortEventCircadianNearEarthPosition(start, end, currentHeight, rOverride) {
    const CR = typeof global.CircadianRenderer !== 'undefined' ? global.CircadianRenderer : null;
    if (!CR || typeof CR.blendedDiskPointAtDate !== 'function' || typeof calculateDateHeight !== 'function') return null;
    if (!start || !end || !(end > start)) return null;
    const mid = new Date((start.getTime() + end.getTime()) / 2);
    const r =
      rOverride != null && !isNaN(rOverride)
        ? rOverride
        : (typeof CR.getHandLength === 'function' ? CR.getHandLength() * 0.88 : 10.5);
    return CR.blendedDiskPointAtDate(mid, r, currentHeight, calculateDateHeight, getCircadianStraightenBlendForEvents());
  }

  function durationHoursBetween(start, end) {
    if (!start || !end || !(end > start)) return 0;
    return (end.getTime() - start.getTime()) / (3600 * 1000);
  }

  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  /** ~calendar month / quarter for context bands (days). */
  const CONTEXT_MONTH_DAYS = 31;
  const CONTEXT_QUARTER_DAYS = 92;
  /** Mean tropical year (days); “sub-year” uses strict `<` this. */
  const CONTEXT_YEAR_DAYS = 365.25;
  const CONTEXT_DECADE_DAYS = CONTEXT_YEAR_DAYS * 10;
  const CONTEXT_CENTURY_DAYS = CONTEXT_YEAR_DAYS * 100;

  /** Span length in days (fractional). Zero if missing or non-positive span. */
  function durationDaysBetween(start, end) {
    if (!start || !end || !(end > start)) return 0;
    return (end.getTime() - start.getTime()) / MS_PER_DAY;
  }

  /**
   * “Roughly a week” (5–10 d): one canonical ribbon annulus in {@link getEventBandRadii} and no duration-rank
   * concentric spread, so neighbors with slightly different lengths share the same radii.
   */
  const WEEKISH_PLATEAU_MIN_DAYS = 5;
  const WEEKISH_PLATEAU_MAX_DAYS = 10;
  function isWeekishDurationDays(durationDays) {
    const d = typeof durationDays === 'number' && !isNaN(durationDays) ? durationDays : 0;
    return d >= WEEKISH_PLATEAU_MIN_DAYS && d <= WEEKISH_PLATEAU_MAX_DAYS;
  }

  /** True when {@link getEventBandRadii} uses the week-corridor annulus (not the >7 d month sweep). */
  function eventBandUsesWeekCorridor(durationDays) {
    const d = Math.max(typeof durationDays === 'number' && !isNaN(durationDays) ? durationDays : 0, 1e-4);
    const dBand = isWeekishDurationDays(d) ? 7 : d;
    return dBand <= 7;
  }

  /**
   * Each zoom’s “focused” spans are one step **smaller** than the view unit (sub outer / super inner).
   * Moment (0) / Clock (9): sub-day [0, 1). Century (1): (decade, century]. Decade (2): (year, decade].
   * Year (3): (quarter, year). Quarter (4): (month, quarter]. Month (5) / Lunar (6): (week, month].
   * Week (7): (day, week]. Day (8): (0, 1d].
   * Keep in sync with `yang/web/index.html` list filter.
   */
  function eventDurationEligibleForFullListAtZoom(durationDays, zl) {
    const z = typeof zl === 'number' && !isNaN(zl) ? Math.floor(zl) : 5;
    const d = typeof durationDays === 'number' && !isNaN(durationDays) ? durationDays : 0;
    if (z <= 0 || z >= 9) return d >= 0 && d < 1;
    if (z === 1) return d > CONTEXT_DECADE_DAYS && d <= CONTEXT_CENTURY_DAYS;
    if (z === 2) return d > CONTEXT_YEAR_DAYS && d <= CONTEXT_DECADE_DAYS;
    if (z === 3) return d > CONTEXT_QUARTER_DAYS && d < CONTEXT_YEAR_DAYS;
    if (z === 4) return d > CONTEXT_MONTH_DAYS && d <= CONTEXT_QUARTER_DAYS;
    if (z === 5 || z === 6) return d > 7 && d <= CONTEXT_MONTH_DAYS;
    if (z === 7) return d > 1 && d <= 7;
    if (z === 8) return d > 0 && d <= 1;
    return true;
  }

  /**
   * Smallest zoom at which this span is in the focused band (for legacy callers).
   */
  function eventTextLabelsMinZoomForDurationDays(durationDays) {
    const d = typeof durationDays === 'number' && !isNaN(durationDays) ? durationDays : 0;
    for (let zz = 1; zz <= 9; zz++) {
      if (eventDurationEligibleForFullListAtZoom(d, zz)) return zz;
    }
    if (eventDurationEligibleForFullListAtZoom(d, 0)) return 0;
    return 9;
  }

  /**
   * `rInner` / `rOuter` are already from getEventBandRadii (week/month/day corridor vs span) — keep them as the zone anchor.
   * With `rank01` (0 = shortest in layer, 1 = longest): nudge **inner** sun-ward and **outer** Earth-ward by `u` so longer
   * ribbons separate; **outer** stays capped inside the day-number → day-name annulus (same as TimeMarkers text rings).
   * Without rank: remap midpoint into [~0.26W, 0.44W] for legacy list/spine callers that are not span-zoned.
   */
  function applyConcentricEventRibbonRadii(earthDist, rInner, rOuter, rank01) {
    const W = earthDist;
    const zoneA = W * 0.26;
    const zoneB = W * 0.44;
    const span = zoneB - zoneA;
    const baseTh = Math.max(W * 0.018, Math.min(((rOuter - rInner) || W * 0.04) * 0.9, W * 0.055));
    const riBase = rInner;
    const roBase = rOuter;
    let ri;
    let ro;
    if (rank01 != null && isFinite(rank01)) {
      const u = Math.max(0, Math.min(1, rank01));
      const { label: rDn, dayName: rDnm } = getDayNumberNameBand(W);
      const bPad = W * 0.0025;
      const outerMax = rDnm - bPad;
      const outerMin = rDn + bPad;
      const headroomIn = Math.max(0, riBase - W * 0.22);
      const headroomOut = Math.max(0, outerMax - roBase);
      const sunNudge = Math.min(W * 0.055, headroomIn * 0.92) * u;
      const earthNudge = Math.min(W * 0.035, headroomOut * 0.98) * u;
      ri = riBase - sunNudge;
      ro = roBase + earthNudge;
      if (ro < ri + baseTh) ro = ri + baseTh;
      if (ro < ri + W * 0.014) ro = ri + W * 0.014;
      ri = Math.max(W * 0.21, ri);
      ro = Math.max(ri + W * 0.014, ro);
      ro = Math.max(outerMin, Math.min(ro, outerMax));
      return { rInner: ri, rOuter: ro };
    }
    const midOld = (riBase + roBase) / 2;
    const t = Math.max(0, Math.min(1, (midOld - W * 0.26) / (W * 0.34)));
    const mid = zoneA + span * (0.06 + 0.88 * t);
    ri = mid - baseTh / 2;
    ro = mid + baseTh / 2;
    ri = Math.max(W * 0.22, Math.min(ri, W * 0.45));
    ro = Math.max(ri + W * 0.014, Math.min(ro, W * 0.5));
    return { rInner: ri, rOuter: ro };
  }

  function shouldApplyConcentricEventRibbonLayout(zl) {
    const z = typeof zl === 'number' && !isNaN(zl) ? Math.floor(zl) : 5;
    if (z <= 1) return false;
    if (z >= 8) return false;
    return true;
  }

  /** Long-term ribbons keep one stable radial lane regardless of zoom. */
  function shouldApplyConcentricLongEventRibbonLayout() {
    return true;
  }

  function buildDurationRankMapForEvents(events) {
    const ranks = new Map();
    if (!events || !events.length) return ranks;
    const items = [];
    for (let i = 0; i < events.length; i++) {
      const s = getEventStart(events[i]);
      let e = getEventEnd(events[i]);
      if (!s || isNaN(s.getTime())) continue;
      if (!e || e <= s) e = new Date(s.getTime() + MS_PER_DAY);
      const d = durationDaysBetween(s, e);
      items.push({ i, d: Math.max(d, 1e-4) });
    }
    if (items.length === 0) return ranks;
    items.sort((a, b) => a.d - b.d);
    const n = items.length;
    for (let k = 0; k < n; k++) {
      ranks.set(items[k].i, n === 1 ? 0.5 : k / (n - 1));
    }
    return ranks;
  }

  function buildDurationRankMapForLines(lines) {
    const ranks = new Map();
    if (!lines || !lines.length) return ranks;
    const items = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const s = line.start instanceof Date ? line.start : null;
      let e = line.end instanceof Date ? line.end : null;
      if (!s || isNaN(s.getTime())) continue;
      if (!e || e <= s) e = new Date(s.getTime() + MS_PER_DAY);
      const d = durationDaysBetween(s, e);
      items.push({ i, d: Math.max(d, 1e-4) });
    }
    if (items.length === 0) return ranks;
    items.sort((a, b) => a.d - b.d);
    const n = items.length;
    for (let k = 0; k < n; k++) {
      ranks.set(items[k].i, n === 1 ? 0.5 : k / (n - 1));
    }
    return ranks;
  }

  function areEventTextLabelsVisibleAtCurrentZoom(start, end) {
    if (!start || !end || !(end > start)) return false;
    if (!isEventLabelRadialContextSurpassesInner(start, end)) return false;
    const zl = getZoomLevelForEvents();
    const days = durationDaysBetween(start, end);
    return eventDurationEligibleForFullListAtZoom(days, zl);
  }

  /**
   * Event **titles** (mid name) stay visible when zoomed in even if the span is outside the Event List “focus band”
   * for that zoom. MM/DD endpoints still follow {@link areEventTextLabelsVisibleAtCurrentZoom}.
   * All text is suppressed when the list-context ring does not reach past this event’s ribbon {@link getEventBandRadii} rInner.
   */
  function areEventNameLabelsVisibleAtCurrentZoom(start, end) {
    if (!start || !end || !(end > start)) return false;
    if (!isEventLabelRadialContextSurpassesInner(start, end)) return false;
    if (areEventTextLabelsVisibleAtCurrentZoom(start, end)) return true;
    const zl = Math.floor(Number(getZoomLevelForEvents()) || 5);
    if (zl < 3) return false;
    return durationDaysBetween(start, end) >= 2;
  }

  function isSub24HourSpan(start, end) {
    if (!end || end <= start) return true;
    return durationHoursBetween(start, end) < 24;
  }

  function datesSameCalendarDay(a, b) {
    if (!a || !b) return false;
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  /** Week starts Sunday (0) — matches week zoom / navigateUnit. */
  function startOfLocalWeekSunday(d) {
    if (!d || isNaN(d.getTime())) return null;
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const dow = x.getDay();
    x.setDate(x.getDate() - dow);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function eventOverlapsLocalWeek(evStart, evEnd, weekStart) {
    if (!weekStart || !evStart || isNaN(evStart.getTime())) return false;
    const ws = weekStart.getTime();
    const we = ws + 7 * MS_PER_DAY;
    const es = evStart.getTime();
    const ee = evEnd && evEnd > evStart ? evEnd.getTime() : es + 3600000;
    return ee > ws && es < we;
  }

  /** True if the event interval intersects the selected calendar day (local). */
  function eventTouchesSelectedCalendarDay(start, end) {
    const fn = getSelectedDateTimeFn();
    if (!fn || !start || isNaN(start.getTime())) return false;
    const sel = fn();
    const dayStart = new Date(sel.getFullYear(), sel.getMonth(), sel.getDate(), 0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime());
    dayEnd.setDate(dayEnd.getDate() + 1);
    const evEnd = end && end > start ? end : new Date(start.getTime() + 3600000);
    return evEnd > dayStart && start < dayEnd;
  }

  /** True if the event overlaps the selected local hour window [floor hour, +1h). */
  function eventTouchesSelectedHour(start, end) {
    const fn = getSelectedDateTimeFn();
    if (!fn || !start || isNaN(start.getTime())) return false;
    const sel = fn();
    const evEnd = end && end > start ? end : new Date(start.getTime() + 3600000);
    const hourStart = new Date(sel.getFullYear(), sel.getMonth(), sel.getDate(), sel.getHours(), 0, 0, 0);
    const hourEnd = new Date(hourStart.getTime() + 3600000);
    return evEnd > hourStart && start < hourEnd;
  }

  function getSelectedDateTimeFn() {
    if (typeof global.getSelectedDateTime === 'function') return global.getSelectedDateTime;
    return null;
  }

  /**
   * Reference scene height for orbit angle + circadian hand tips (same as orange helix refresh in main).
   * Using wall-clock "now" here desynced sub-day events from the selected-day frame.
   */
  function getEventOrbitReferenceHeight() {
    if (typeof calculateDateHeight !== 'function') {
      return typeof calculateCurrentDateHeight === 'function' ? calculateCurrentDateHeight() : 0;
    }
    const fn = getSelectedDateTimeFn();
    if (fn) {
      const d = fn();
      if (d && !isNaN(d.getTime())) {
        const hourFrac =
          d.getHours() +
          d.getMinutes() / 60 +
          d.getSeconds() / 3600 +
          d.getMilliseconds() / 3600000;
        const h = calculateDateHeight(d.getFullYear(), d.getMonth(), d.getDate(), hourFrac);
        if (h != null && !isNaN(h)) return h;
      }
    }
    return typeof calculateCurrentDateHeight === 'function' ? calculateCurrentDateHeight() : 0;
  }

  /**
   * Orbital phase anchor for multi-day ribbons / helices that must sit on Earth’s worldline
   * (same as SceneGeometry.getCurrentDateHeight / Worldlines.createWorldline).
   */
  function getWorldlineOrbitReferenceHeight() {
    if (typeof calculateCurrentDateHeight === 'function') {
      const h = calculateCurrentDateHeight();
      if (h != null && !isNaN(h)) return h;
    }
    return getEventOrbitReferenceHeight();
  }

  function isDateOnSelectedCalendarDay(d) {
    const fn = getSelectedDateTimeFn();
    if (!fn) return false;
    return datesSameCalendarDay(d, fn());
  }

  function getRadiusForDailyEventDot(earthDist, midDate, indexOffset) {
    let r;
    if (shouldUseDayBandDotPlacement()) {
      r = earthDist * DAY_EVENT_DOT_RADIUS_FRAC;
    } else {
      r = getRadiusForTimeOfDay(midDate, earthDist, indexOffset);
    }
    const zl = getZoomLevelForEvents();
    if (shouldApplyConcentricEventRibbonLayout(zl)) {
      r = Math.min(r, earthDist * 0.42);
    }
    return r;
  }

  /**
   * Line from sub-day event dot toward circadian hour-hand tip — only Day/Clock zoom, circadian on, selected day.
   */
  function addCircadianConnectorIfApplicable(parent, ax, ay, az, atDate, colorHex) {
    const zl = getZoomLevelForEvents();
    if (!isCircadianHelixZoom(zl) || !parent) return;
    const circ = normalizedCircadianState();
    if (circ === 'off') return;
    if (!isDateOnSelectedCalendarDay(atDate)) return;
    if (typeof global.CircadianRenderer === 'undefined' || !global.CircadianRenderer.blendedDiskPointAtDate) return;
    const currentHeight = getEventOrbitReferenceHeight();
    const hl = typeof global.CircadianRenderer.getHandLength === 'function'
      ? global.CircadianRenderer.getHandLength()
      : 12;
    const tip = global.CircadianRenderer.blendedDiskPointAtDate(
      atDate,
      hl,
      currentHeight,
      calculateDateHeight,
      getCircadianStraightenBlendForEvents()
    );
    if (!tip) return;
    const geo = new global.THREE.BufferGeometry();
    geo.setAttribute('position', new global.THREE.Float32BufferAttribute([
      ax, ay, az,
      tip.x, tip.y, tip.z
    ], 3));
    const connMul = getDailyCircadianEventOpacityMul(atDate, atDate);
    const mat = new global.THREE.LineBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: Math.min(0.65, 0.5 * connMul)
    });
    const line = new global.THREE.Line(geo, mat);
    line.renderOrder = 3;
    line.userData = { type: 'EventCircadianConnector' };
    line.raycast = function () {};
    parent.add(line);
  }

  /**
   * Radius for an event based on time of day: noon -> closer to Sun (inner), midnight -> Earth (outer).
   * @param {Date} date - used for time-of-day (hours/minutes)
   * @param {number} earthDist - Earth orbit distance
   * @param {number} indexOffset - optional small per-event offset (e.g. index % 3) to separate same-time events
   * @returns {number} radius
   */
  function getRadiusForTimeOfDay(date, earthDist, indexOffset) {
    const inner = earthDist * EVENT_RADIUS_INNER_FRACTION;
    const outer = earthDist * EVENT_RADIUS_OUTER_FRACTION;
    const hours = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
    const t = hours / 24;
    const closenessToNoon = 1 - 2 * Math.abs(t - 0.5);
    const r = outer - (outer - inner) * Math.max(0, Math.min(1, closenessToNoon));
    const offset = (indexOffset != null ? indexOffset : 0) * 0.6;
    return Math.max(inner, Math.min(outer, r + offset));
  }

  /**
   * Radius for long-term events: proportional to event length with log scaling so very long events don't get too large.
   * Longer event -> larger radius (further from Sun). Uses ln(durationDays + 1) / ln(365) capped at 1.
   * @param {number} durationDays - event duration in days
   * @param {number} earthDist - Earth orbit distance
   * @returns {number} radius
   */
  function getRadiusForDuration(durationDays, earthDist) {
    const inner = earthDist * EVENT_RADIUS_INNER_FRACTION;
    const outer = earthDist * EVENT_RADIUS_OUTER_FRACTION;
    const logNorm = Math.log(Math.max(0, durationDays) + 1) / Math.log(365);
    const factor = Math.max(0, Math.min(1, logNorm));
    return inner + (outer - inner) * factor;
  }

  /** Same radii as TimeMarkers `day.label` / `day.dayName` — ribbon outer edges nest in this annulus. */
  function getDayNumberNameBand(earthDist) {
    const W = earthDist;
    if (typeof TimeMarkers !== 'undefined' && typeof TimeMarkers.getCanonicalRadialZones === 'function') {
      const z = TimeMarkers.getCanonicalRadialZones(W);
      return { label: z.day.label, dayName: z.day.dayName };
    }
    return { label: W * DAY_NUMBER_RADIUS_FRAC, dayName: W * DAY_NAME_RADIUS_FRAC };
  }

  /**
   * XZ radius just Sun-ward of the month time-marker **outer** curve ({@link TimeMarkers} `month.outer` = W/2).
   * Used to park long (month-ish) event titles inside that ring so they don’t sit in busier outer bands.
   */
  function getMonthOuterInnerLabelRadiusXZ(earthDist) {
    const W = typeof earthDist === 'number' && !isNaN(earthDist) ? earthDist : getEarthDistance();
    let rMonthOuter = W * 0.5;
    if (typeof TimeMarkers !== 'undefined' && typeof TimeMarkers.getCanonicalRadialZones === 'function') {
      rMonthOuter = TimeMarkers.getCanonicalRadialZones(W).month.outer;
    }
    const pad = W * 0.024;
    return Math.max(W * 0.17, rMonthOuter - pad);
  }

  function snapMeshPositionXZRadius(mesh, rTargetXZ) {
    if (!mesh || !mesh.position || !(rTargetXZ > 0)) return;
    const p = mesh.position;
    const rh = Math.hypot(p.x, p.z);
    if (rh < 1e-9) return;
    const s = rTargetXZ / rh;
    p.x *= s;
    p.z *= s;
  }

  /**
   * Inner/outer radii for duration-event band (aligned with TimeMarkers RADII_CONFIG week/month/day rings).
   * For spans > 1 week (after week-ish plateau), inner sweeps week→month and outer eases in the day-number→day-name band.
   * Week corridor (≤7 d band, incl. ~5–10 d plateau): **inner** = mid between week label text and week outer curve;
   * **outer** = mid between day numbers and day names (same as `day.label`–`day.dayName`).
   */
  function getEventBandRadii(earthDist, durationDays) {
    const W = earthDist;
    const { label: rDayLabel, dayName: rDayName } = getDayNumberNameBand(W);
    const zones = (typeof TimeMarkers !== 'undefined' && typeof TimeMarkers.getCanonicalRadialZones === 'function')
      ? TimeMarkers.getCanonicalRadialZones(W)
      : null;
    let rMonthInner;
    let rWeekInner;
    let rWeekLabel;
    let rWeekOuter;
    if (zones) {
      rMonthInner = zones.month.inner;
      rWeekInner = zones.week.inner;
      rWeekLabel = zones.week.label;
      rWeekOuter = zones.week.outer;
    } else {
      rMonthInner = W * 0.25;
      rWeekInner = W * 0.5;
      rWeekLabel = W * (9 / 16);
      rWeekOuter = W * (5 / 8);
    }
    const d = Math.max(durationDays, 1e-4);
    const dBand = isWeekishDurationDays(d) ? 7 : d;
    let rInner;
    let rOuter;
    if (dBand > 7) {
      const t = Math.max(0, Math.min(1, Math.log(1 + dBand) / Math.log(366)));
      rInner = rWeekInner + (rMonthInner - rWeekInner) * t;
      const corPad = W * 0.0025;
      const innerCor = rDayLabel + corPad;
      const outerCor = rDayName - corPad;
      const spanCor = Math.max(W * 0.004, outerCor - innerCor);
      rOuter = innerCor + spanCor * t;
    } else {
      rInner = (rWeekLabel + rWeekOuter) / 2;
      rOuter = (rDayLabel + rDayName) / 2;
      const minBand = W * 0.022;
      if (rInner > rOuter - minBand) rInner = rOuter - minBand;
    }
    return { rInner, rOuter };
  }

  /**
   * Outer radius of the list-context / horizon hoop for this zoom (matches {@link TimeMarkers.getListContextRingRadiusForZoom}
   * and main.js `resolveListHorizonRingRadius` when TimeMarkers is present).
   */
  function getListContextRingOuterRadius(earthDist, zoomLevel) {
    const W = typeof earthDist === 'number' && !isNaN(earthDist) ? earthDist : EARTH_RADIUS;
    const z = typeof zoomLevel === 'number' && !isNaN(zoomLevel) ? Math.floor(zoomLevel) : 5;
    const zr = z === 0 ? 9 : z;
    if (typeof TimeMarkers !== 'undefined' && typeof TimeMarkers.getListContextRingRadiusForZoom === 'function') {
      return TimeMarkers.getListContextRingRadiusForZoom(zr, W);
    }
    const monthOuter = W / 2;
    const weekOuter = W * 5 / 8;
    const dayInner = W * 5 / 8;
    const dayOuter = W * 3 / 4;
    const qOuter = W / 4;
    let ro;
    if (zr <= 0) ro = dayInner;
    else if (zr <= 2) ro = W * 0.5;
    else if (zr === 3) ro = qOuter;
    else if (zr === 4) ro = monthOuter;
    else if (zr <= 6) ro = weekOuter;
    else if (zr === 7) ro = dayOuter;
    else ro = W;
    const rMax = zr >= 8 ? W * 0.998 : W * 0.92;
    return Math.max(W * 0.08, Math.min(ro, rMax));
  }

  /**
   * True when the context ring lies outside this event’s Sun-ward ribbon edge (context ring radius > rInner), so labels may draw.
   * When the band sits outside the ring (e.g. sub-week ribbons at quarter zoom), skip all event text.
   */
  function isEventLabelRadialContextSurpassesInner(start, end) {
    if (!start || !end || !(end > start)) return false;
    const W = getEarthDistance();
    const contextR = getListContextRingOuterRadius(W, getZoomLevelForEvents());
    const days = durationDaysBetween(start, end);
    const { rInner } = getEventBandRadii(W, Math.max(days, 1e-4));
    return contextR > rInner;
  }

  /**
   * Long-term bands shift along scene Y (time height) by duration: longer spans sit slightly lower
   * than shorter ones so overlapping ribbons separate. No shift for spans ≤ 1 week.
   */
  function getEventBandVerticalStagger(durationDays) {
    if (durationDays <= 7) return 0;
    const t = Math.max(0, Math.min(1,
      (Math.log(1 + durationDays) - Math.log(8)) / (Math.log(400) - Math.log(8))
    ));
    return -1.6 * t;
  }

  /**
   * Longer ribbons use logical stagger in userData; root.position.y is updated each frame (main.js) so flatten Y scale
   * does not crush the visual separation vs unflattened view.
   */
  function attachEventStaggerRoot(root, staggerLogical) {
    if (!root || !staggerLogical) return root;
    const ys = typeof global.getEventFlattenYScale === 'function' ? global.getEventFlattenYScale() : 1;
    root.userData.eventStaggerRoot = true;
    root.userData.staggerLogical = staggerLogical;
    root.position.y = staggerLogical / Math.max(0.05, ys);
    return root;
  }

  /** Keep below time-marker text (main.js ~50); above default scene objects. */
  const EVENT_LABEL_SPRITE_RENDER_ORDER = 30;
  /** Shorter ribbons stack above longer but must not paint over time-marker labels. */
  const MAX_RIBBON_RENDER_ORDER_BOOST = 12;

  /**
   * Multiplies layer opacity for multi-day ribbons: shorter spans read stronger when drawn on top of long ones.
   * Approaches 1.0 for durations past ~8 weeks so very long events keep the configured opacity.
   */
  function getDurationOpacityScale(durationDays) {
    const d = Math.max(durationDays, 1e-4);
    const t = Math.max(0, Math.min(1, (Math.min(d, 56) - 2) / 54));
    return 1.3 - 0.3 * t;
  }

  /**
   * Shorter ribbons draw later (higher renderOrder) so they stack on top of longer overlays instead of blending underneath.
   */
  function getDurationRibbonRenderOrderBoost(durationDays) {
    const d = Math.max(durationDays, 0.25);
    const t = Math.max(0, Math.min(1,
      (Math.log(1 + d) - Math.log(2)) / (Math.log(400) - Math.log(2))
    ));
    return Math.min(MAX_RIBBON_RENDER_ORDER_BOOST, Math.round((1 - t) * MAX_RIBBON_RENDER_ORDER_BOOST));
  }

  /**
   * Stronger ribbon fill for shorter spans so the foreground color reads clearly (not equal-weight blend with behind).
   */
  function getDurationFillOpacityFactor(durationDays) {
    const d = Math.max(durationDays, 0.25);
    const t = Math.max(0, Math.min(1,
      (Math.log(1 + d) - Math.log(2)) / (Math.log(220) - Math.log(2))
    ));
    return 0.5 + 0.47 * (1 - t);
  }

  /** Sub-day ribbon fills (circadian arcs): more glassy so overlaps read as stacks. */
  function getShortTermEventFillOpacityMul() {
    return 0.56;
  }

  /** Add deltaY to every Y in a flat [x,y,z,...] array (mutates). */
  function offsetHelixFlatY(flat, deltaY) {
    if (!deltaY || !flat || flat.length < 3) return;
    for (let i = 1; i < flat.length; i += 3) flat[i] += deltaY;
  }

  function offsetLinePointsFlatY(points, deltaY) {
    if (!deltaY || !points || points.length < 6) return;
    for (let i = 1; i < points.length; i += 3) points[i] += deltaY;
  }

  function createRibbonBufferFromFlatArrays(innerFlat, outerFlat) {
    const n = innerFlat.length / 3;
    if (n < 2 || innerFlat.length !== outerFlat.length) return null;
    const pos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      pos[i * 6] = innerFlat[i * 3];
      pos[i * 6 + 1] = innerFlat[i * 3 + 1];
      pos[i * 6 + 2] = innerFlat[i * 3 + 2];
      pos[i * 6 + 3] = outerFlat[i * 3];
      pos[i * 6 + 4] = outerFlat[i * 3 + 1];
      pos[i * 6 + 5] = outerFlat[i * 3 + 2];
    }
    const idx = [];
    for (let i = 0; i < n - 1; i++) {
      const a = 2 * i;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      idx.push(a, b, c, b, d, c);
    }
    const geo = new global.THREE.BufferGeometry();
    geo.setIndex(idx);
    geo.setAttribute('position', new global.THREE.BufferAttribute(pos, 3));
    const ribbonEdge = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      ribbonEdge[i * 2] = 0;
      ribbonEdge[i * 2 + 1] = 1;
    }
    geo.setAttribute('ribbonEdge', new global.THREE.BufferAttribute(ribbonEdge, 1));
    geo.computeVertexNormals();
    return geo;
  }

  function createRibbonFillMesh(ribbonGeo, fillHex, fillOpacity, plotType, roFill, durationDays, contextFade) {
    const THREE = global.THREE;
    const useGradient = longEventRibbonUsesRadialFillGradient(durationDays);
    const innerScale = contextFade && contextFade.innerScale != null ? contextFade.innerScale : 1;
    const outerScale = contextFade && contextFade.outerScale != null ? contextFade.outerScale : 1;
    const mat = useGradient
      ? createLongTermRibbonFillShaderMaterial(fillHex, fillOpacity, THREE, innerScale, outerScale)
      : new THREE.MeshBasicMaterial({
        color: fillHex,
        transparent: true,
        opacity: fillOpacity * innerScale,
        side: THREE.DoubleSide,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: 2,
        polygonOffsetUnits: 1
      });
    const fillMesh = new global.THREE.Mesh(ribbonGeo, mat);
    if (plotType === 'polygon2d') fillMesh.scale.y = 0.02;
    fillMesh.renderOrder = roFill;
    return fillMesh;
  }

  function addBandEndConnectors(group, innerFlat, outerFlat, colorHex, opacity, renderOrder, tubeRadius) {
    const n = innerFlat.length / 3;
    if (n < 1) return;
    const THREE = global.THREE;
    if (tubeRadius != null && tubeRadius > 0 && typeof THREE.CylinderGeometry === 'function') {
      function cap(si) {
        const ix = si * 3;
        const p0 = new THREE.Vector3(innerFlat[ix], innerFlat[ix + 1], innerFlat[ix + 2]);
        const p1 = new THREE.Vector3(outerFlat[ix], outerFlat[ix + 1], outerFlat[ix + 2]);
        const c = cylinderBetweenPoints(p0, p1, tubeRadius * 0.92, colorHex, opacity, renderOrder);
        if (c) group.add(c);
      }
      cap(0);
      cap(n - 1);
      return;
    }
    function seg(si) {
      const ix = si * 3;
      const g = new global.THREE.BufferGeometry();
      g.setAttribute('position', new global.THREE.Float32BufferAttribute([
        innerFlat[ix], innerFlat[ix + 1], innerFlat[ix + 2],
        outerFlat[ix], outerFlat[ix + 1], outerFlat[ix + 2]
      ], 3));
      const m = new global.THREE.LineBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: opacity,
        linewidth: 1
      });
      const line = new global.THREE.Line(g, m);
      line.renderOrder = renderOrder;
      group.add(line);
    }
    seg(0);
    seg(n - 1);
  }

  function buildHelixPair(startHeight, endHeight, rInner, rOuter, currentHeight, segments) {
    let innerFlat;
    let outerFlat;
    if (typeof SceneGeometry !== 'undefined' && SceneGeometry.createEarthHelicalCurve) {
      innerFlat = SceneGeometry.createEarthHelicalCurve(startHeight, endHeight, rInner, currentHeight, segments);
      outerFlat = SceneGeometry.createEarthHelicalCurve(startHeight, endHeight, rOuter, currentHeight, segments);
    } else {
      const angle0 = typeof SceneGeometry !== 'undefined' && SceneGeometry.getAngle
        ? SceneGeometry.getAngle(startHeight, currentHeight)
        : 0;
      const angle1 = typeof SceneGeometry !== 'undefined' && SceneGeometry.getAngle
        ? SceneGeometry.getAngle(endHeight, currentHeight)
        : angle0;
      const p0i = typeof SceneGeometry !== 'undefined' && SceneGeometry.getPosition3D
        ? SceneGeometry.getPosition3D(startHeight, angle0, rInner)
        : { x: Math.cos(angle0) * rInner, y: startHeight, z: Math.sin(angle0) * rInner };
      const p1i = typeof SceneGeometry !== 'undefined' && SceneGeometry.getPosition3D
        ? SceneGeometry.getPosition3D(endHeight, angle1, rInner)
        : { x: Math.cos(angle1) * rInner, y: endHeight, z: Math.sin(angle1) * rInner };
      const p0o = typeof SceneGeometry !== 'undefined' && SceneGeometry.getPosition3D
        ? SceneGeometry.getPosition3D(startHeight, angle0, rOuter)
        : { x: Math.cos(angle0) * rOuter, y: startHeight, z: Math.sin(angle0) * rOuter };
      const p1o = typeof SceneGeometry !== 'undefined' && SceneGeometry.getPosition3D
        ? SceneGeometry.getPosition3D(endHeight, angle1, rOuter)
        : { x: Math.cos(angle1) * rOuter, y: endHeight, z: Math.sin(angle1) * rOuter };
      innerFlat = [p0i.x, p0i.y, p0i.z, p1i.x, p1i.y, p1i.z];
      outerFlat = [p0o.x, p0o.y, p0o.z, p1o.x, p1o.y, p1o.z];
    }
    return { innerFlat, outerFlat };
  }

  /**
   * Orthonormal frame on the ribbon at `idx`. **width** = inner helix → outer helix (Sun-ward → Earth).
   * Label plane uses local **+X → width** so left-to-right text reads from inner radius toward Earth; **+Y → tangent** (along span).
   * @param {number} [tAlongWidth] - 0 = inner edge, 1 = outer, 0.5 = mid (default). Below 0.5 shifts Sun-ward (away from day-marker text).
   * @returns {{ position: THREE.Vector3, quaternion: THREE.Quaternion, tangent: THREE.Vector3, width: THREE.Vector3, normal: THREE.Vector3, band: number }|null}
   */
  function sampleRibbonSurfaceFrame(innerFlat, outerFlat, idx, tAlongWidth) {
    const THREE = global.THREE;
    const n = innerFlat.length / 3;
    if (n < 2 || !outerFlat || outerFlat.length < n * 3) return null;
    const clampI = (i) => Math.max(0, Math.min(n - 1, i));
    const i = clampI(idx);
    const iPrev = clampI(i - 1);
    const iNext = clampI(i + 1);
    const Pi = new THREE.Vector3(innerFlat[i * 3], innerFlat[i * 3 + 1], innerFlat[i * 3 + 2]);
    const Po = new THREE.Vector3(outerFlat[i * 3], outerFlat[i * 3 + 1], outerFlat[i * 3 + 2]);
    const PiPrev = new THREE.Vector3(innerFlat[iPrev * 3], innerFlat[iPrev * 3 + 1], innerFlat[iPrev * 3 + 2]);
    const PiNext = new THREE.Vector3(innerFlat[iNext * 3], innerFlat[iNext * 3 + 1], innerFlat[iNext * 3 + 2]);
    const tW = tAlongWidth != null && isFinite(tAlongWidth)
      ? Math.max(0, Math.min(1, Number(tAlongWidth)))
      : 0.5;
    const center = new THREE.Vector3().lerpVectors(Pi, Po, tW);
    const width = new THREE.Vector3().subVectors(Po, Pi);
    const band = width.length();
    if (band < 1e-6) width.set(1, 0, 0);
    else width.normalize();
    const tangent = new THREE.Vector3().subVectors(PiNext, PiPrev);
    if (tangent.lengthSq() < 1e-10) tangent.set(-width.z, 0, width.x);
    const tw = tangent.dot(width);
    tangent.addScaledVector(width, -tw);
    if (tangent.lengthSq() < 1e-10) tangent.set(0, 1, 0);
    else tangent.normalize();
    const bx = width;
    const by = tangent;
    const bz = new THREE.Vector3().crossVectors(bx, by);
    if (bz.lengthSq() < 1e-10) return null;
    bz.normalize();
    const quat = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(bx, by, bz)
    );
    const normal = bz.clone();
    return { position: center, quaternion: quat, tangent, width, normal, band };
  }

  /** Larger font / plane for longer spans (multi-day); sub-day uses hours. */
  function getEventNameLabelStyleFromDuration(start, end) {
    const days = durationDaysBetween(start, end);
    const hrs = durationHoursBetween(start, end);
    let u;
    if (hrs < 24) u = Math.max(0, Math.min(1, hrs / 24));
    else u = Math.max(0, Math.min(1, Math.log(1 + days) / Math.log(366)));
    const fontPx = Math.round(13 + u * 28);
    return { u, fontPx };
  }

  /** Dark outline behind event **name** glyphs (2D canvas); not used for MM/DD-only labels. */
  function strokeAndFillEventNameOnCanvas(ctx, text, x, y, r, g, b, fontPx, isNameLabel) {
    if (!text) return;
    ctx.textBaseline = 'middle';
    if (isNameLabel) {
      const fp = Math.max(8, Math.round(fontPx));
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(8, 10, 16, 0.96)';
      ctx.lineWidth = Math.max(2.5, fp * 0.2);
      ctx.strokeText(text, x, y);
    }
    ctx.fillStyle = `rgba(${r},${g},${b},0.98)`;
    ctx.fillText(text, x, y);
  }

  function wrapParagraphToLines(ctx, para, maxW) {
    const words = String(para).split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = '';
    for (let wi = 0; wi < words.length; wi++) {
      const w = words[wi];
      const t = cur ? `${cur} ${w}` : w;
      if (ctx.measureText(t).width <= maxW) {
        cur = t;
      } else {
        if (cur) lines.push(cur);
        if (ctx.measureText(w).width > maxW) {
          let rest = w;
          while (rest.length) {
            let lo = 1;
            let hi = rest.length;
            let best = 1;
            while (lo <= hi) {
              const mid = (lo + hi) >> 1;
              if (ctx.measureText(rest.slice(0, mid)).width <= maxW) {
                best = mid;
                lo = mid + 1;
              } else {
                hi = mid - 1;
              }
            }
            lines.push(rest.slice(0, best));
            rest = rest.slice(best);
          }
          cur = '';
        } else {
          cur = w;
        }
      }
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [''];
  }

  /** Split on \\n; wrap each paragraph to maxW. Blank rows become empty lines. */
  function eventNameToCanvasLines(text, ctx, maxW) {
    const rows = String(text == null ? '' : text).replace(/\r\n/g, '\n').replace(/\r/g, '').split('\n');
    const out = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row === '') {
        out.push('');
        continue;
      }
      out.push(...wrapParagraphToLines(ctx, row, maxW));
    }
    return out.length ? out : [''];
  }

  /** Single-line width in px (must match `bold ... Orbitron` in label canvases). */
  function measureBoldOrbitronTextWidthPx(text, fontPx) {
    if (text == null || text === '') return 0;
    const fp = Math.max(8, Math.round(fontPx));
    const probe = document.createElement('canvas');
    const ctx = probe.getContext('2d');
    ctx.font = `bold ${fp}px Orbitron`;
    return ctx.measureText(String(text)).width;
  }

  /**
   * Canvas pixel size for event ribbon text (must match createEventSurfaceTextMesh drawing).
   * @param {number} [maxLineWidthPx] - if set, word-wrap and support explicit line breaks for long-term names.
   * @returns {{ cw: number, ch: number, lines?: string[], lineHeight?: number }}
   */
  function measureEventSurfaceLabelCanvasSize(text, fontPx, pad, maxLineWidthPx) {
    const fp = Math.max(8, Math.round(fontPx));
    const p = pad != null ? pad : 14;
    const probe = document.createElement('canvas');
    const ctx = probe.getContext('2d');
    ctx.font = `bold ${fp}px Orbitron`;
    const lh = fp * 1.22;
    if (maxLineWidthPx != null && maxLineWidthPx > 0) {
      const lines = eventNameToCanvasLines(text, ctx, maxLineWidthPx);
      let tw = 80;
      for (let i = 0; i < lines.length; i++) {
        const ln = lines[i];
        if (ln) tw = Math.max(tw, ctx.measureText(ln).width);
      }
      const ch = Math.ceil(Math.max(lh + p * 2, lines.length * lh + p * 2));
      const cw = Math.ceil(Math.max(80, tw + p * 2));
      return { cw, ch, lines, lineHeight: lh };
    }
    const tw = text ? ctx.measureText(String(text)).width : 40;
    const ch = Math.ceil(Math.max(40, fp + p * 2));
    return {
      cw: Math.ceil(Math.max(80, tw + p * 2)),
      ch
    };
  }

  /**
   * Text on a plane mesh (no billboard). `textAlign` 'left': first glyph at texture left → maps to inner radius when plane +X is width.
   * @param {boolean} [isNameLabel] - if true, draw a dark stroke around glyphs (event titles only).
   * @param {boolean} [mapWideAlongRibbonTangent] - long-term ribbons: keep glyph aspect by mapping canvas “wide” to ribbon tangent (+Y), thin to radial (+X); rotates the texture 90°.
   * @param {number} [maxLineWidthPx] - wrap long names / honor \\n (long-term labels only when set).
   */
  function createEventSurfaceTextMesh(text, colorHex, planeWorldW, planeWorldH, fontPx, textAlign, isNameLabel, mapWideAlongRibbonTangent, maxLineWidthPx) {
    const THREE = global.THREE;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const fp = Math.max(8, Math.round(fontPx));
    ctx.font = `bold ${fp}px Orbitron`;
    const pad = 14;
    const align = textAlign === 'left' ? 'left' : 'center';
    const layout = measureEventSurfaceLabelCanvasSize(text, fp, pad, maxLineWidthPx);
    const cw = layout.cw;
    const ch = layout.ch;
    canvas.width = cw;
    canvas.height = ch;
    const textColorHex = (colorHex != null && luminanceForHex(colorHex) >= 0.35) ? colorHex : DEFAULT_LABEL_COLOR_HEX;
    const r = (textColorHex >> 16) & 0xff;
    const g = (textColorHex >> 8) & 0xff;
    const b = textColorHex & 0xff;
    ctx.font = `bold ${fp}px Orbitron`;
    ctx.textAlign = align;
    if (text) {
      const tx = align === 'left' ? pad : cw / 2;
      if (layout.lines && layout.lines.length) {
        const lh = layout.lineHeight || fp * 1.22;
        for (let li = 0; li < layout.lines.length; li++) {
          const ln = layout.lines[li];
          const ty = pad + (li + 0.5) * lh;
          if (ln) strokeAndFillEventNameOnCanvas(ctx, ln, tx, ty, r, g, b, fp, !!isNameLabel);
        }
      } else {
        const ty = ch / 2;
        strokeAndFillEventNameOnCanvas(ctx, text, tx, ty, r, g, b, fp, !!isNameLabel);
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    if (mapWideAlongRibbonTangent) {
      tex.center.set(0.5, 0.5);
      tex.rotation = Math.PI / 2;
    }
    const geo = new THREE.PlaneGeometry(planeWorldW, planeWorldH);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = EVENT_LABEL_SPRITE_RENDER_ORDER;
    return mesh;
  }

  function placeMeshOnRibbonFrame(mesh, frame, normalBump) {
    if (!mesh || !frame) return;
    mesh.position.copy(frame.position);
    if (normalBump && frame.normal) mesh.position.addScaledVector(frame.normal, normalBump);
    mesh.quaternion.copy(frame.quaternion);
  }

  /**
   * Short circadian labels: lie in the ribbon plane (no camera billboard). Canvas +X reads along the arc
   * (tangent); canvas +Y is letter height toward the outer edge of the band (away from Earth — {@link sampleRibbonSurfaceFrame} width).
   */
  function orientCircadianShortRibbonLabelMesh(mesh, frame) {
    const THREE = global.THREE;
    if (!mesh || !frame || !frame.tangent || !frame.width) return;
    const xAxis = frame.tangent.clone();
    if (xAxis.lengthSq() < 1e-14) return;
    xAxis.normalize();
    const yAxis = frame.width.clone();
    if (yAxis.lengthSq() < 1e-14) return;
    yAxis.normalize();
    const zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis);
    if (zAxis.lengthSq() < 1e-14) return;
    zAxis.normalize();
    mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis));
  }

  function chordLenAlongInner(innerFlat, i0, i1) {
    const THREE = global.THREE;
    const p0 = new THREE.Vector3(innerFlat[i0 * 3], innerFlat[i0 * 3 + 1], innerFlat[i0 * 3 + 2]);
    const p1 = new THREE.Vector3(innerFlat[i1 * 3], innerFlat[i1 * 3 + 1], innerFlat[i1 * 3 + 2]);
    return p0.distanceTo(p1);
  }

  /** Polyline length along inner ribbon vertices from index i0 through i1-1. */
  function polylineArcLenInner(innerFlat, i0, i1) {
    if (!innerFlat || i1 <= i0) return 0;
    const np = innerFlat.length / 3;
    const hi = Math.min(i1, np - 1);
    let L = 0;
    for (let i = i0; i < hi; i++) {
      L += chordLenAlongInner(innerFlat, i, i + 1);
    }
    return L;
  }

  /**
   * Get Earth distance from PLANET_DATA if available
   */
  function getEarthDistance() {
    if (typeof PLANET_DATA !== 'undefined' && Array.isArray(PLANET_DATA)) {
      const earth = PLANET_DATA.find(p => p.name === 'Earth');
      if (earth && typeof earth.distance === 'number') return earth.distance;
    }
    return EARTH_RADIUS;
  }

  /** Default label text color when event/layer color is too dark (neutral visible gray). */
  const DEFAULT_LABEL_COLOR_HEX = 0x9ca3af;

  function luminanceForHex(hex) {
    const r = ((hex >> 16) & 0xff) / 255;
    const g = ((hex >> 8) & 0xff) / 255;
    const b = (hex & 0xff) / 255;
    return 0.299 * r + 0.587 * g + 0.114 * b;
  }

  /**
   * Create a text sprite for event line labels (event name or MM/DD). Color in hex number.
   * Uses neutral gray for text when the given color is too dark for readability.
   * For event names (isNameLabel true), canvas width is sized to fit the full text.
   * @param {string} text
   * @param {number} colorHex - e.g. 0x00b4d8
   * @param {number} x, y, z - world position
   * @param {number} scale - sprite scale (default 8)
   * @param {boolean} isNameLabel - if true, canvas width is derived from text measure so full name fits
   * @returns {THREE.Sprite}
   */
  function createEventLineLabelSprite(text, colorHex, x, y, z, scale, isNameLabel) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const font = 'bold 36px Orbitron';
    context.font = font;

    const padding = 24;
    const minWidth = 256;
    const height = 64;

    let width = minWidth;
    if (isNameLabel && text) {
      const metrics = context.measureText(text);
      width = Math.ceil(Math.max(minWidth, metrics.width + padding * 2));
    }
    canvas.width = width;
    canvas.height = height;

    const textColorHex = (colorHex != null && luminanceForHex(colorHex) >= 0.35) ? colorHex : DEFAULT_LABEL_COLOR_HEX;
    const r = (textColorHex >> 16) & 0xff;
    const g = (textColorHex >> 8) & 0xff;
    const b = textColorHex & 0xff;
    context.font = font;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const nx = width / 2;
    const ny = height / 2;
    if (isNameLabel) {
      strokeAndFillEventNameOnCanvas(context, text, nx, ny, r, g, b, 36, true);
    } else {
      context.fillStyle = `rgba(${r}, ${g}, ${b}, 0.95)`;
      context.fillText(text, nx, ny);
    }

    const texture = new global.THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    const mat = new global.THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      alphaTest: 0.05
    });
    const sprite = new global.THREE.Sprite(mat);
    sprite.renderOrder = EVENT_LABEL_SPRITE_RENDER_ORDER;
    sprite.position.set(x, y, z);
    const s = scale != null ? scale : 8;
    const sx = s * (width / minWidth);
    const sy = s * 0.3;
    sprite.scale.set(sx, sy, 1);
    sprite.userData.baseScale = { x: sx, y: sy, z: 1 };
    sprite.userData.immuneToFlatten = true;
    return sprite;
  }

  /**
   * Name sprites scale with canvas width; shrink so world width stays within ribbon radial thickness.
   */
  function clampEventNameSpriteScaleToBand(sprite, bandWorld, frac) {
    if (!sprite || !sprite.scale || bandWorld == null || !(bandWorld > 1e-6)) return;
    const maxSpan = bandWorld * (frac != null ? frac : 0.88);
    const sx = sprite.scale.x;
    if (sx > maxSpan) {
      const r = maxSpan / sx;
      sprite.scale.x *= r;
      sprite.scale.y *= r;
      if (sprite.userData && sprite.userData.baseScale) {
        sprite.userData.baseScale.x *= r;
        sprite.userData.baseScale.y *= r;
      }
    }
  }

  function attachEventLabelTiming(sprite, start, end, isNameLabel) {
    if (!sprite || !sprite.userData) return sprite;
    const s = start instanceof Date && !isNaN(start.getTime()) ? start.getTime() : NaN;
    const e = end instanceof Date && !isNaN(end.getTime()) && end > start ? end.getTime() : s;
    if (isFinite(s)) sprite.userData.labelStartMs = s;
    if (isFinite(e)) sprite.userData.labelEndMs = e;
    if (isNameLabel) sprite.userData.isEventNameLabel = true;
    return sprite;
  }

  /**
   * Format date as MM/DD for start/end labels
   */
  function formatMMDD(date) {
    const m = date.getMonth() + 1;
    const d = date.getDate();
    return (m < 10 ? '0' : '') + m + '/' + (d < 10 ? '0' : '') + d;
  }

  /**
   * Short-event dot: semi-transparent fill + edge outline (long-term ribbon look, smaller scale).
   * @returns {THREE.Group}
   */
  function createEventLinePointMarker(x, y, z, colorHex, size, userData, startForOpacity, endForOpacity) {
    const THREE = global.THREE;
    const mul =
      startForOpacity && !isNaN(startForOpacity.getTime())
        ? getDailyCircadianEventOpacityMul(startForOpacity, endForOpacity || startForOpacity)
        : 1;
    const fillOp = Math.min(0.9, Math.max(0.16, 0.52 * mul));
    const outlineOp = Math.min(0.95, Math.max(0.24, 0.78 * mul));
    const geo = new THREE.SphereGeometry(size * 0.94, 14, 14);
    const fill = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: fillOp,
        depthWrite: false,
        side: THREE.DoubleSide
      })
    );
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: outlineOp,
        depthWrite: false
      })
    );
    edges.renderOrder = 2;
    const root = new THREE.Group();
    root.add(fill);
    root.add(edges);
    root.position.set(x, y, z);
    root.userData = userData || { type: 'EventLineMarker' };
    return root;
  }

  /**
   * Get start date from event (VEvent or plain object)
   * @param {Object|VEvent} event
   * @returns {Date|null}
   */
  function getEventStart(event) {
    if (typeof VEvent !== 'undefined' && event instanceof VEvent) {
      return event.getStartDate();
    }
    if (event.dtstart) {
      if (event.dtstart.dateTime) return new Date(event.dtstart.dateTime);
      if (event.dtstart.date) return new Date(event.dtstart.date + 'T00:00:00Z');
      if (typeof event.dtstart === 'string') {
        const d = new Date(event.dtstart);
        if (!isNaN(d.getTime())) return d;
      }
    }
    const start = event.startTime || event.start || event.date;
    return start instanceof Date ? start : start ? new Date(start) : null;
  }

  /**
   * Get end date from event (VEvent or plain object)
   * @param {Object|VEvent} event
   * @returns {Date|null}
   */
  function getEventEnd(event) {
    if (typeof VEvent !== 'undefined' && event instanceof VEvent) {
      return event.getEndDate();
    }
    if (event.dtend) {
      if (event.dtend.dateTime) return new Date(event.dtend.dateTime);
      if (event.dtend.date) return new Date(event.dtend.date + 'T00:00:00Z');
      if (typeof event.dtend === 'string') {
        const d = new Date(event.dtend);
        if (!isNaN(d.getTime())) return d;
      }
    }
    const end = event.endTime || event.end;
    return end instanceof Date ? end : end ? new Date(end) : null;
  }

  function mergeTimeIntervalsMs(intervals) {
    if (!intervals || intervals.length === 0) return [];
    const iv = intervals.filter(x => x && x[1] > x[0]).map(x => [x[0], x[1]]).sort((a, b) => a[0] - b[0]);
    if (iv.length === 0) return [];
    const out = [[iv[0][0], iv[0][1]]];
    for (let k = 1; k < iv.length; k++) {
      const a = iv[k][0];
      const b = iv[k][1];
      const last = out[out.length - 1];
      if (a <= last[1]) last[1] = Math.max(last[1], b);
      else out.push([a, b]);
    }
    return out;
  }

  /**
   * 0–1 along the host interval for title placement: center of the longest gap not covered by strictly shorter overlapping spans.
   */
  function findMidTitleAlongSpan01(hostStartMs, hostEndMs, occluderIntervalsMs) {
    const S = hostStartMs;
    const E = hostEndMs;
    const span = E - S;
    if (!(span > 0)) return 0.5;
    const merged = mergeTimeIntervalsMs(occluderIntervalsMs);
    let bestSeg = null;
    let cursor = S;
    for (let k = 0; k < merged.length; k++) {
      const a = merged[k][0];
      const b = merged[k][1];
      if (a > cursor) {
        const seg = [cursor, a];
        if (!bestSeg || seg[1] - seg[0] > bestSeg[1] - bestSeg[0]) bestSeg = seg;
      }
      cursor = Math.max(cursor, b);
    }
    if (E > cursor) {
      const seg = [cursor, E];
      if (!bestSeg || seg[1] - seg[0] > bestSeg[1] - bestSeg[0]) bestSeg = seg;
    }
    if (!bestSeg || bestSeg[1] - bestSeg[0] < 1e-9) return 0.5;
    const midMs = (bestSeg[0] + bestSeg[1]) * 0.5;
    const t = (midMs - S) / span;
    return Math.max(0, Math.min(1, t));
  }

  function computeTitleAlongForLayerEvents(events) {
    const map = new Map();
    if (!events || !events.length) return map;
    for (let i = 0; i < events.length; i++) {
      const s = getEventStart(events[i]);
      const e = getEventEnd(events[i]);
      if (!s || isNaN(s.getTime()) || !e || e <= s) {
        map.set(i, 0.5);
        continue;
      }
      const hostMs0 = s.getTime();
      const hostMs1 = e.getTime();
      const hostDur = hostMs1 - hostMs0;
      const oc = [];
      for (let j = 0; j < events.length; j++) {
        if (j === i) continue;
        const sj = getEventStart(events[j]);
        const ej = getEventEnd(events[j]);
        if (!sj || isNaN(sj.getTime()) || !ej || ej <= sj) continue;
        const djr = ej.getTime() - sj.getTime();
        if (djr >= hostDur) continue;
        const a = Math.max(hostMs0, sj.getTime());
        const b = Math.min(hostMs1, ej.getTime());
        if (b > a) oc.push([a, b]);
      }
      map.set(i, findMidTitleAlongSpan01(hostMs0, hostMs1, oc));
    }
    return map;
  }

  function computeTitleAlongForLayerLines(lines) {
    const map = new Map();
    if (!lines || !lines.length) return map;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const s = line.start instanceof Date ? line.start : new Date(line.start);
      const e = line.end instanceof Date ? line.end : new Date(line.end);
      if (!s || isNaN(s.getTime()) || !e || isNaN(e.getTime()) || e <= s) {
        map.set(i, 0.5);
        continue;
      }
      const hostMs0 = s.getTime();
      const hostMs1 = e.getTime();
      const hostDur = hostMs1 - hostMs0;
      const oc = [];
      for (let j = 0; j < lines.length; j++) {
        if (j === i) continue;
        const lj = lines[j];
        const sj = lj.start instanceof Date ? lj.start : new Date(lj.start);
        const ej = lj.end instanceof Date ? lj.end : new Date(lj.end);
        if (!sj || isNaN(sj.getTime()) || !ej || isNaN(ej.getTime()) || ej <= sj) continue;
        const djr = ej.getTime() - sj.getTime();
        if (djr >= hostDur) continue;
        const a = Math.max(hostMs0, sj.getTime());
        const b = Math.min(hostMs1, ej.getTime());
        if (b > a) oc.push([a, b]);
      }
      map.set(i, findMidTitleAlongSpan01(hostMs0, hostMs1, oc));
    }
    return map;
  }

  function hasCategoryValue(event, value) {
    if (!event || !value) return false;
    const target = String(value).trim().toLowerCase();
    const source = event.category ?? event.categories;
    if (Array.isArray(source)) {
      return source.some((entry) => String(entry).trim().toLowerCase() === target);
    }
    if (source != null) {
      return String(source).trim().toLowerCase() === target;
    }
    return false;
  }

  function isTripEvent(event) {
    if (!event) return false;
    if (event.isTrip === true) return true;
    if (event.meta && event.meta.isTrip === true) return true;
    return hasCategoryValue(event, 'trip');
  }

  function isWorkTaggedEvent(event) {
    if (!event) return false;
    if (event.isWorkEvent === true) return true;
    if (event.meta && event.meta.isWorkEvent === true) return true;
    return hasCategoryValue(event, 'work');
  }

  function getLongTermEventMarkers(event, start, end) {
    if (!start || !end || end <= start) return '';
    if (durationDaysBetween(start, end) < 1) return '';
    const markers = [];
    if (isTripEvent(event)) markers.push('[TRIP]');
    if (isWorkTaggedEvent(event)) markers.push('[WORK]');
    return markers.length ? markers.join(' ') : '';
  }

  function getEventSummaryText(event, start, end) {
    if (typeof VEvent !== 'undefined' && event instanceof VEvent) {
      const s = event.summary;
      const base = s && String(s).trim() ? String(s).trim() : null;
      const markers = getLongTermEventMarkers(event, start, end);
      if (!markers) return base;
      return base ? `${markers} ${base}` : markers;
    }
    const s = event.summary || event.title;
    const base = s && String(s).trim() ? String(s).trim() : null;
    const markers = getLongTermEventMarkers(event, start, end);
    if (!markers) return base;
    return base ? `${markers} ${base}` : markers;
  }

  /**
   * Labels on ribbon surface (plane meshes, no billboards). Falls back to sprites if geometry is unusable.
   * @param {number} [midTitleAlongSpan01] - 0–1 along the span for the **name** anchor (default 0.5); dates stay at ends.
   */
  function addEventWorldlineLabelSprites(parent, event, start, end, startHeight, endHeight, rInner, rOuter, eventHex, currentHeight, staggerY, innerFlatOpt, outerFlatOpt, midTitleAlongSpan01) {
    if (!parent || !start || !end || end <= start) return;
    const showDates = areEventTextLabelsVisibleAtCurrentZoom(start, end);
    const showName = areEventNameLabelsVisibleAtCurrentZoom(start, end);
    if (!showDates && !showName) return;
    const labelType = parent.userData && parent.userData.type === 'EventLine' ? 'EventLineLabel' : 'EventObjectLabel';
    const sy = staggerY != null && !isNaN(staggerY) ? staggerY : 0;
    const sameDay = start.getFullYear() === end.getFullYear() &&
      start.getMonth() === end.getMonth() && start.getDate() === end.getDate();
    const isShortEvent = durationHoursBetween(start, end) < 24;
    const daysForLabels = durationDaysBetween(start, end);
    const isWeekCorridorEvent = eventBandUsesWeekCorridor(daysForLabels);
    const showEndpointDates = showDates && !isWeekCorridorEvent;
    const earthDist = getEarthDistance();
    let innerFlat = innerFlatOpt;
    let outerFlat = outerFlatOpt;
    if (!innerFlat || !outerFlat || innerFlat.length < 6) {
      const seg = Math.max(8, Math.min(48, Math.ceil(Math.abs(endHeight - startHeight) / 8)));
      const pair = buildHelixPair(startHeight, endHeight, rInner, rOuter, currentHeight, seg);
      innerFlat = pair.innerFlat;
      outerFlat = pair.outerFlat;
    }
    const n = innerFlat.length / 3;
    const canSurface = n >= 2 && outerFlat && outerFlat.length >= n * 3;

    const getAngle = typeof SceneGeometry !== 'undefined' && SceneGeometry.getAngle
      ? function (h) { return SceneGeometry.getAngle(h, currentHeight); }
      : function () { return 0; };
    const getPos = function (h, rad) {
      const a = getAngle(h);
      return {
        x: Math.cos(a) * rad,
        y: h,
        z: Math.sin(a) * rad
      };
    };

    const nameStr = getEventSummaryText(event, start, end);
    const style = getEventNameLabelStyleFromDuration(start, end);
    /** Multi-week / month-scale titles (not week-corridor ~5–10 d): hug inside month.outer, larger type. */
    const isMonthishLongTermLabel =
      typeof daysForLabels === 'number' && !isNaN(daysForLabels) &&
      daysForLabels >= 12 && !isWeekCorridorEvent;
    /** Week-corridor ribbons: anchor labels Sun-ward so titles don’t sit under day number/name rings. */
    const ribbonLabelRadialT = isWeekCorridorEvent
      ? 0.38
      : (isMonthishLongTermLabel ? 0.24 : 0.5);
    const dateShrink = 1 / (1 + Math.log(1 + Math.max(1, daysForLabels)) / Math.log(120));
    const dateFontPx = Math.max(6, Math.round((Math.max(7, style.fontPx - 10)) * dateShrink));
    const bump = earthDist * 0.004;
    const circadianBillboardNames =
      isShortEvent &&
      isCircadianHelixZoom(getZoomLevelForEvents()) &&
      normalizedCircadianState() !== 'off';

    function planeDimsAtIndex(idx, fontPx, text, kind) {
      const spanHalf = Math.max(2, Math.floor((n - 1) / 5));
      const i0 = Math.max(0, idx - spanHalf);
      const i1 = Math.min(n - 1, idx + spanHalf);
      const chord = chordLenAlongInner(innerFlat, i0, i1);
      const fr = sampleRibbonSurfaceFrame(innerFlat, outerFlat, idx, ribbonLabelRadialT);
      if (!fr) return { planeW: earthDist * 0.08, planeH: earthDist * 0.045, fr: null, chord: earthDist * 0.04 };
      const band = fr.band;
      const len = text ? String(text).length : 4;
      const isEndpoint = kind === 'start' || kind === 'end';
      const longT = Math.max(0, Math.min(1, Math.log(1 + Math.max(1, daysForLabels)) / Math.log(400)));
      const kindMul = isEndpoint
        ? (0.26 + 0.2 * (1 - longT)) * (0.55 + 0.45 * Math.min(1, 5 / Math.max(3, len)))
        : 1;
      // Local +X is inner→outer (ribbon thickness). planeW must stay ≤ band or glyphs sit past the outline.
      const ribbonRadCap = band * (isEndpoint ? 0.96 : 0.91);
      const radialFromChars = len * earthDist * 0.0082 * kindMul;
      const radialFloor = isEndpoint
        ? Math.max(band * (0.36 + 0.2 * (1 - longT)), earthDist * 0.02) * kindMul
        : Math.max(band * 0.68, earthDist * 0.012);
      let planeW = Math.min(earthDist * 0.22, Math.max(radialFloor, radialFromChars));
      if (isEndpoint) planeW = Math.min(planeW, earthDist * (0.068 + 0.04 * (1 - longT)));
      planeW = Math.min(planeW, ribbonRadCap);
      let along = Math.max(earthDist * 0.036, chord * 0.32 + fontPx * earthDist * 0.0022);
      if (isEndpoint) along *= 0.52 + 0.28 * (1 - longT);
      const planeH = Math.min(earthDist * 0.16, Math.max(earthDist * 0.026, along));
      return { planeW, planeH, fr, chord };
    }

    function addSurfaceLabel(text, idx, fontPx, kind, isNameLabel) {
      const { planeW, planeH, fr, chord } = planeDimsAtIndex(idx, fontPx, text, kind);
      if (!fr || !text) return null;
      let drawW = planeW;
      let drawH = planeH;
      let drawFontPx = fontPx;
      let mapWideAlongRibbonTangent = false;
      let ribbonNameMaxLinePx;
      if (isNameLabel && circadianBillboardNames) {
        const band = fr.band != null && fr.band > 1e-6 ? fr.band : planeW;
        const chordLen = chord != null && chord > 1e-6 ? chord : earthDist * 0.045;
        const bandCap = Math.max(earthDist * 0.008, Math.min(band * 0.94, earthDist * 0.074));
        const alongMax = Math.max(earthDist * 0.028, Math.min(chordLen * 0.92, earthDist * 0.52));
        const fontFloor = Math.max(10, Math.round(fontPx * 0.7));
        const fontCeil = Math.min(28, Math.max(13, Math.round(fontPx * 1.12)));

        let chosenFp = fontFloor;
        let maxWrapChosen = Math.round(Math.min(520, Math.max(100, (alongMax / earthDist) * 340)));
        for (let tryFp = fontCeil; tryFp >= fontFloor; tryFp--) {
          const fpTry = Math.max(8, Math.round(tryFp));
          const maxWrapPx = Math.round(Math.min(560, Math.max(96, (alongMax / earthDist) * 320 + fpTry * 8)));
          const layoutTry = measureEventSurfaceLabelCanvasSize(text, fpTry, 14, maxWrapPx);
          const cwTry = layoutTry.cw;
          const chTry = layoutTry.ch;
          if (cwTry < 1 || chTry < 1) continue;
          const texAspectTry = cwTry / chTry;
          let acrossTry = Math.min(
            bandCap,
            Math.max(earthDist * 0.012, fpTry * earthDist * 0.00212)
          );
          let alongTry = acrossTry * texAspectTry;
          if (alongTry > alongMax) {
            alongTry = alongMax;
            acrossTry = alongTry / texAspectTry;
          }
          if (acrossTry > bandCap) {
            acrossTry = bandCap;
            alongTry = acrossTry * texAspectTry;
            if (alongTry > alongMax) {
              alongTry = alongMax;
              acrossTry = alongTry / texAspectTry;
            }
          }
          const fits =
            alongTry <= alongMax + 0.002 &&
            acrossTry <= bandCap + 0.002 &&
            (acrossTry >= earthDist * 0.009 || fpTry <= fontFloor);
          if (fits || fpTry <= fontFloor) {
            chosenFp = fpTry;
            maxWrapChosen = maxWrapPx;
            break;
          }
        }

        drawFontPx = chosenFp;
        ribbonNameMaxLinePx = maxWrapChosen;
        const layoutFinal = measureEventSurfaceLabelCanvasSize(text, drawFontPx, 14, ribbonNameMaxLinePx);
        const cwF = layoutFinal.cw;
        const chF = layoutFinal.ch;
        const texAspect = cwF > 0 && chF > 0 ? cwF / chF : 2;
        let across = Math.min(
          bandCap,
          Math.max(earthDist * 0.012, drawFontPx * earthDist * 0.00212)
        );
        let along = across * texAspect;
        if (along > alongMax) {
          along = alongMax;
          across = along / texAspect;
        }
        if (across > bandCap) {
          across = bandCap;
          along = across * texAspect;
          if (along > alongMax) {
            along = alongMax;
            across = along / texAspect;
          }
        }
        drawW = across;
        drawH = along;
      } else if (isNameLabel && !isShortEvent && kind === 'mid') {
        // Long-term name: canvas is wide×short but ribbon basis maps +X to thin radial band and +Y along span —
        // old sizing stretched one axis. Fit world plane to texture aspect; wide axis runs along tangent via UV rotation.
        if (String(text).length > 28) {
          drawFontPx = Math.min(36, Math.round(drawFontPx * 1.12));
        }
        if (isMonthishLongTermLabel) {
          drawFontPx = Math.min(44, Math.round(drawFontPx * 1.12));
        }
        const band = fr.band != null && fr.band > 1e-6 ? fr.band : planeW;
        const bandCap = Math.max(earthDist * 0.008, Math.min(band * 0.92, earthDist * 0.055));
        const alongMax = Math.max(earthDist * 0.03, planeH * 0.97);
        const wideSingleLineSpan =
          typeof daysForLabels === 'number' && !isNaN(daysForLabels) &&
          daysForLabels >= 14 && daysForLabels <= 50;
        const tryLargerFonts =
          typeof daysForLabels === 'number' && !isNaN(daysForLabels) && daysForLabels >= 12;
        const fontFloor = Math.max(8, Math.round(drawFontPx));
        const extraTry = tryLargerFonts
          ? Math.min(14, Math.round(3 + (daysForLabels - 12) / 5))
          : 0;
        const monthishFontBoost = isMonthishLongTermLabel ? 7 : 0;
        const fontCeil = Math.min(54, fontFloor + extraTry + monthishFontBoost);

        let chosenFp = fontFloor;
        let linePxChosen = undefined;
        for (let tryFp = fontCeil; tryFp >= fontFloor; tryFp--) {
          const fp = Math.max(8, Math.round(tryFp));
          const maxWrapPx = Math.round(Math.min(320, Math.max(100, 7 * fp + 24)));
          const maxSingleBeforeWrap = wideSingleLineSpan
            ? Math.round(
              Math.min(
                isMonthishLongTermLabel ? 640 : 580,
                Math.max(maxWrapPx, 16 * fp + Math.min(100, Math.max(0, daysForLabels - 14) * 2.2))
              )
            )
            : maxWrapPx;
          const singleW = measureBoldOrbitronTextWidthPx(text, fp);
          const linePx = singleW <= maxSingleBeforeWrap + 0.5 ? undefined : maxWrapPx;
          const layoutM = measureEventSurfaceLabelCanvasSize(text, fp, 14, linePx);
          const cw0 = layoutM.cw;
          const ch0 = layoutM.ch;
          if (cw0 < 1 || ch0 < 1) continue;
          const texAspect = cw0 / ch0;
          let across0 = Math.min(
            bandCap,
            Math.max(earthDist * 0.014, fp * earthDist * 0.00205)
          );
          let along0 = across0 * texAspect;
          if (along0 > alongMax) {
            along0 = alongMax;
            across0 = along0 / texAspect;
          }
          if (across0 > bandCap) {
            across0 = bandCap;
            along0 = across0 * texAspect;
          }
          const fits =
            along0 <= alongMax + 0.002 &&
            across0 <= bandCap + 0.002 &&
            (across0 >= earthDist * 0.01 || fp <= fontFloor);
          if (fits || fp <= fontFloor) {
            chosenFp = fp;
            linePxChosen = linePx;
            break;
          }
        }

        drawFontPx = chosenFp;
        ribbonNameMaxLinePx = linePxChosen;
        const { cw, ch } = measureEventSurfaceLabelCanvasSize(text, drawFontPx, 14, ribbonNameMaxLinePx);
        const texAspect = cw / ch;
        let across = Math.min(
          bandCap,
          Math.max(earthDist * 0.014, drawFontPx * earthDist * 0.00205)
        );
        let along = across * texAspect;
        if (along > alongMax) {
          along = alongMax;
          across = along / texAspect;
        }
        if (across > bandCap) {
          across = bandCap;
          along = across * texAspect;
          if (along > alongMax) {
            along = alongMax;
            across = along / texAspect;
          }
        }
        drawW = across;
        drawH = along;
        mapWideAlongRibbonTangent = true;
      }
      let meshW = drawW;
      let meshH = drawH;
      let useMapTan = mapWideAlongRibbonTangent;
      if (circadianBillboardNames) {
        useMapTan = false;
        meshW = drawH;
        meshH = drawW;
      }
      const mesh = createEventSurfaceTextMesh(
        text,
        eventHex,
        meshW,
        meshH,
        drawFontPx,
        'left',
        isNameLabel,
        useMapTan,
        ribbonNameMaxLinePx
      );
      placeMeshOnRibbonFrame(mesh, fr, bump);
      if (circadianBillboardNames) {
        orientCircadianShortRibbonLabelMesh(mesh, fr);
        // One Y anchor: time midpoint of the short event (keeps XZ from ribbon sample).
        if (typeof startHeight === 'number' && typeof endHeight === 'number') {
          mesh.position.y = (startHeight + endHeight) * 0.5;
        }
      }
      if (sy) mesh.position.y += sy;
      if (isMonthishLongTermLabel && isNameLabel && kind === 'mid' && !isShortEvent) {
        snapMeshPositionXZRadius(mesh, getMonthOuterInnerLabelRadiusXZ(earthDist));
      }
      attachEventLabelTiming(mesh, start, end, isNameLabel);
      Object.assign(mesh.userData, {
        type: labelType,
        kind,
        isRibbonSurfaceLabel: true,
        circadianBillboardLabel: false,
        immuneToFlatten: !!circadianBillboardNames
      });
      applyDailyCircadianLabelOpacity(mesh, start, end);
      return mesh;
    }

    const midLabelForInset = isShortEvent
      ? (nameStr || (formatMMDD(start) + (sameDay ? '' : ' – ' + formatMMDD(end))))
      : (showName
        ? (isWeekCorridorEvent ? (nameStr || null) : (nameStr || (formatMMDD(start) + ' – ' + formatMMDD(end))))
        : null);

    let titleAlongT =
      midTitleAlongSpan01 != null && !isNaN(midTitleAlongSpan01)
        ? Math.max(0, Math.min(1, Number(midTitleAlongSpan01)))
        : 0.5;

    function clampMidTitleAlong01ForRibbon(tRaw, numPoints, labelText, fp) {
      const t = Math.max(0, Math.min(1, tRaw));
      const maxIdx = Math.max(0, numPoints - 1);
      if (maxIdx < 1) return t;
      const len = labelText ? String(labelText).length : 0;
      const fpN = fp != null ? fp : 14;
      let marginFrac = Math.min(0.34, Math.max(0.045, 0.045 + len / 78 + fpN / 195));
      let marginIdx = Math.ceil(maxIdx * marginFrac);
      marginIdx = Math.max(1, Math.min(marginIdx, Math.floor(maxIdx / 2)));
      let idx = Math.round(t * maxIdx);
      idx = Math.min(maxIdx - marginIdx, Math.max(marginIdx, idx));
      return maxIdx > 0 ? idx / maxIdx : 0.5;
    }

    function clampMidTitleAlong01Heuristic(tRaw, labelText, fp) {
      const t = Math.max(0, Math.min(1, tRaw));
      const len = labelText ? String(labelText).length : 0;
      const fpN = fp != null ? fp : 14;
      const frac = Math.min(0.3, Math.max(0.07, 0.07 + len / 88 + fpN / 155));
      return Math.max(frac, Math.min(1 - frac, t));
    }

    function refineMidRibbonIdxToFitLabel(idx0, labelText, fp) {
      if (!canSurface || n < 2 || !labelText) return Math.min(n - 1, Math.max(0, idx0));
      const maxIdx = n - 1;
      const len = String(labelText).length;
      const fpN = fp != null ? fp : 14;
      let marginFrac = Math.min(0.34, Math.max(0.045, 0.045 + len / 78 + fpN / 195));
      let marginIdx = Math.max(1, Math.min(Math.ceil(maxIdx * marginFrac), Math.floor(maxIdx / 2)));
      let ix = Math.min(maxIdx - marginIdx, Math.max(marginIdx, idx0));
      let dims = planeDimsAtIndex(ix, fpN, labelText, 'mid');
      let halfAlong = (dims.planeH || earthDist * 0.04) * 0.58;
      for (let iter = 0; iter < n + 10; iter++) {
        const L0 = polylineArcLenInner(innerFlat, 0, ix);
        const L1 = polylineArcLenInner(innerFlat, ix, maxIdx);
        if (L0 >= halfAlong && L1 >= halfAlong) break;
        if (L0 < L1) ix++;
        else ix--;
        if (ix < marginIdx) {
          ix = marginIdx;
          break;
        }
        if (ix > maxIdx - marginIdx) {
          ix = maxIdx - marginIdx;
          break;
        }
        dims = planeDimsAtIndex(ix, fpN, labelText, 'mid');
        halfAlong = (dims.planeH || earthDist * 0.04) * 0.58;
      }
      return ix;
    }

    if (midLabelForInset && (showName || isShortEvent)) {
      titleAlongT = canSurface && n >= 2
        ? clampMidTitleAlong01ForRibbon(titleAlongT, n, midLabelForInset, style.fontPx)
        : clampMidTitleAlong01Heuristic(titleAlongT, midLabelForInset, style.fontPx);
    }

    let idxMidTitle = Math.min(n - 1, Math.max(0, Math.round((n - 1) * titleAlongT)));
    if (midLabelForInset && (showName || isShortEvent) && canSurface && n >= 2) {
      idxMidTitle = refineMidRibbonIdxToFitLabel(idxMidTitle, midLabelForInset, style.fontPx);
      titleAlongT = (n - 1) > 0 ? idxMidTitle / (n - 1) : 0.5;
    }

    if (canSurface) {
      if (isShortEvent) {
        if (!showName && !showDates) return;
        const midLabel = nameStr || (formatMMDD(start) + (sameDay ? '' : ' – ' + formatMMDD(end)));
        const idxMid = idxMidTitle;
        const m = addSurfaceLabel(midLabel, idxMid, style.fontPx, 'mid', true);
        if (m) {
          parent.add(m);
          return;
        }
      } else {
        const idxStart = 0;
        const idxEnd = n - 1;
        const idxMid = idxMidTitle;
        let s = null;
        let e = null;
        if (showEndpointDates) {
          s = addSurfaceLabel(formatMMDD(start), idxStart, dateFontPx, 'start', false);
          e = addSurfaceLabel(formatMMDD(end), idxEnd, dateFontPx, 'end', false);
        }
        let mid = null;
        if (showName) {
          const midLabel = isWeekCorridorEvent
            ? (nameStr || null)
            : (nameStr || (formatMMDD(start) + ' – ' + formatMMDD(end)));
          if (midLabel) mid = addSurfaceLabel(midLabel, idxMid, style.fontPx, 'mid', true);
        }
        if (s) parent.add(s);
        if (e) parent.add(e);
        if (mid) parent.add(mid);
        if (s || e || mid) return;
      }
    }

    const rMidRibbon = rInner + (rOuter - rInner) * ribbonLabelRadialT + EVENT_LINE_LABEL_RADIUS_OFFSET * 0.5;
    const rMidName = !isShortEvent && isMonthishLongTermLabel
      ? getMonthOuterInnerLabelRadiusXZ(earthDist)
      : rMidRibbon;
    const midHeight = startHeight + titleAlongT * (endHeight - startHeight);
    const dayNumberScale = 1.5;
    const startEndScale = dayNumberScale * 2 * (0.42 + 0.58 * dateShrink);
    const nameScale = dayNumberScale * 3;
    if (isShortEvent) {
      if (!showName && !showDates) return;
      const midLabel = nameStr || (formatMMDD(start) + (sameDay ? '' : ' – ' + formatMMDD(end)));
      const midPos = getPos(midHeight, rMidName);
      const midSprite = attachEventLabelTiming(
        createEventLineLabelSprite(midLabel, eventHex, midPos.x, midPos.y + sy, midPos.z, nameScale, true),
        start,
        end,
        true
      );
      Object.assign(midSprite.userData, { type: labelType, kind: 'mid' });
      applyDailyCircadianLabelOpacity(midSprite, start, end);
      clampEventNameSpriteScaleToBand(midSprite, Math.abs(rOuter - rInner), 0.88);
      parent.add(midSprite);
      return;
    }
    const midPos = getPos(midHeight, rMidName);
    if (showEndpointDates) {
      const startPos = getPos(startHeight, rMidRibbon);
      const endPos = getPos(endHeight, rMidRibbon);
      const startSprite = createEventLineLabelSprite(formatMMDD(start), eventHex, startPos.x, startPos.y + sy, startPos.z, startEndScale, false);
      Object.assign(startSprite.userData, { type: labelType, kind: 'start' });
      parent.add(startSprite);
      const endSprite = createEventLineLabelSprite(formatMMDD(end), eventHex, endPos.x, endPos.y + sy, endPos.z, startEndScale, false);
      Object.assign(endSprite.userData, { type: labelType, kind: 'end' });
      parent.add(endSprite);
    }
    if (showName) {
      const midLabel = isWeekCorridorEvent
        ? (nameStr || null)
        : (nameStr || (formatMMDD(start) + ' – ' + formatMMDD(end)));
      if (!midLabel) return;
      const nameScaleEff = isMonthishLongTermLabel ? nameScale * 1.24 : nameScale;
      const midSprite = attachEventLabelTiming(
        createEventLineLabelSprite(midLabel, eventHex, midPos.x, midPos.y + sy, midPos.z, nameScaleEff, true),
        start,
        end,
        true
      );
      Object.assign(midSprite.userData, { type: labelType, kind: 'mid' });
      clampEventNameSpriteScaleToBand(midSprite, Math.abs(rOuter - rInner), 0.88);
      parent.add(midSprite);
    }
  }

  /**
   * Wrap a worldline mesh/line in a group if needed, attach labels on ribbon surface, preserve picking userData on the primary.
   */
  function wrapWorldlineWithLabels(primary, userData, event, start, end, startHeight, endHeight, rInner, rOuter, eventHex, currentHeight, staggerY, innerFlat, outerFlat, midTitleAlongSpan01) {
    let parent = primary;
    if (!(primary instanceof global.THREE.Group)) {
      const wrapper = new global.THREE.Group();
      wrapper.userData = { ...userData };
      primary.userData = { ...userData };
      wrapper.add(primary);
      parent = wrapper;
    } else if (!primary.userData || !primary.userData.type) {
      primary.userData = { ...userData };
    }
    addEventWorldlineLabelSprites(parent, event, start, end, startHeight, endHeight, rInner, rOuter, eventHex, currentHeight, staggerY, innerFlat, outerFlat, midTitleAlongSpan01);
    return parent;
  }

  /**
   * Parse hex color string to number for THREE
   * @param {string} hex - e.g. '#ff0000' or '0xff0000'
   * @returns {number}
   */
  function parseColor(hex) {
    if (typeof hex === 'number' && !isNaN(hex)) return hex;
    if (typeof hex !== 'string') return 0xffffff;
    const s = hex.replace('#', '');
    return parseInt(s.length === 6 ? s : s.slice(0, 6), 16);
  }

  function clamp01(v) {
    return Math.max(0, Math.min(1, v));
  }

  /**
   * Portal/Yin: outline color from per-event provenance (native / CSV / ICS / URL / public, edited flag).
   * Returns a THREE-compatible numeric color, or null if the event has no provenance field.
   */
  function getCircaevumProvenanceOutlineHex(event) {
    if (!event || typeof event !== 'object') return null;
    const srcRaw = event.circaevumSource;
    if (srcRaw == null || String(srcRaw).trim() === '') return null;
    const src = String(srcRaw).trim();
    const edited =
      event.circaevumEdited === true ||
      event.circaevumEdited === 'true' ||
      event.circaevumEdited === 1;
    if (src === 'public_share') return parseColor('#dc2626');
    if (src === 'native') return parseColor('#9333ea');
    if (src === 'csv') return parseColor(edited ? '#22c55e' : '#2563eb');
    if (src === 'ics_url') {
      if (edited) return parseColor('#ea580c');
      return parseColor('#eab308');
    }
    if (src === 'ics_file') {
      if (edited) return parseColor('#ea580c');
      return parseColor('#14b8a6');
    }
    return null;
  }

  /**
   * Outline stroke color for duration ribbons.
   * When the event carries circaevumSource (portal), outline color follows provenance and ignores borderStyle for color.
   * @param {string} borderStyle - 'event' | 'layer' | 'none' | optional 'custom' (legacy stored styles)
   * @param {Object|null} [eventForProvenance] - VEVENT-like row (optional)
   */
  function resolveRibbonOutlineColor(borderStyle, layerConfig, eventHex, layerHex, eventForProvenance) {
    const prov = eventForProvenance != null ? getCircaevumProvenanceOutlineHex(eventForProvenance) : null;
    if (prov != null) return prov;
    const bs = borderStyle || 'event';
    if (bs === 'none') return null;
    if (bs === 'custom') {
      const raw = layerConfig && layerConfig.borderColor != null ? String(layerConfig.borderColor).trim() : '';
      if (raw) return parseColor(raw);
      return layerHex;
    }
    if (bs === 'layer') return layerHex;
    return eventHex;
  }

  /** Stronger borderThickness → higher outline opacity and thicker tube stroke. */
  function getRibbonOutlineOpacity(baseOpacity, borderStyle, layerConfig) {
    const bs = borderStyle || 'event';
    if (bs === 'none') return 0;
    const rawT = layerConfig && layerConfig.borderThickness != null ? Number(layerConfig.borderThickness) : 1;
    const t = Math.max(0.3, Math.min(4, isNaN(rawT) ? 1 : rawT));
    return Math.min(1, baseOpacity * (0.82 + 0.38 * t));
  }

  function getRibbonOutlineTubeRadius(earthDist, layerConfig) {
    const ed = earthDist != null && !isNaN(earthDist) ? earthDist : EARTH_RADIUS;
    const rawT = layerConfig && layerConfig.borderThickness != null ? Number(layerConfig.borderThickness) : 1;
    const t = Math.max(0.3, Math.min(4, isNaN(rawT) ? 1 : rawT));
    return Math.max(ed * 0.001, ed * RIBBON_OUTLINE_TUBE_RADIUS_FRAC * (0.42 + 0.58 * t));
  }

  function cylinderBetweenPoints(p0, p1, radius, colorHex, opacity, renderOrder) {
    const THREE = global.THREE;
    const dir = new THREE.Vector3().subVectors(p1, p0);
    const len = dir.length();
    if (len < 1e-9) return null;
    const geom = new THREE.CylinderGeometry(radius, radius, len, 6, 1, false);
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: opacity,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.renderOrder = renderOrder;
    const axis = new THREE.Vector3(0, 1, 0);
    const ndir = dir.clone().normalize();
    mesh.quaternion.setFromUnitVectors(axis, ndir);
    mesh.position.copy(new THREE.Vector3().addVectors(p0, p1).multiplyScalar(0.5));
    return mesh;
  }

  /**
   * Thick polyline stroke along flat [x,y,z,...] using TubeGeometry (smooth) or short cylinders (fallback).
   * @param {number} [radiusScale] - multiply tube radius (e.g. short circadian arcs use {@link getShortCircadianRibbonTubeScale}).
   */
  function createTubeOutlineAlongFlat(flat, colorHex, opacity, renderOrder, earthDist, layerConfig, radiusScale) {
    const THREE = global.THREE;
    const nPts = flat.length / 3;
    if (nPts < 2) return null;
    let r = getRibbonOutlineTubeRadius(earthDist, layerConfig);
    if (radiusScale != null && isFinite(radiusScale) && radiusScale > 0) r *= radiusScale;
    if (nPts === 2) {
      const p0 = new THREE.Vector3(flat[0], flat[1], flat[2]);
      const p1 = new THREE.Vector3(flat[3], flat[4], flat[5]);
      return cylinderBetweenPoints(p0, p1, r, colorHex, opacity, renderOrder);
    }
    if (typeof THREE.CatmullRomCurve3 === 'function' && typeof THREE.TubeGeometry === 'function') {
      const points = [];
      for (let i = 0; i < flat.length; i += 3) {
        points.push(new THREE.Vector3(flat[i], flat[i + 1], flat[i + 2]));
      }
      const curve = new THREE.CatmullRomCurve3(points);
      const tubularSegments = Math.max(8, Math.min(160, (nPts - 1) * 4));
      const geo = new THREE.TubeGeometry(curve, tubularSegments, r, 5, false);
      const mat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: opacity,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = renderOrder;
      return mesh;
    }
    const group = new THREE.Group();
    for (let i = 0; i < nPts - 1; i++) {
      const p0 = new THREE.Vector3(flat[i * 3], flat[i * 3 + 1], flat[i * 3 + 2]);
      const p1 = new THREE.Vector3(flat[(i + 1) * 3], flat[(i + 1) * 3 + 1], flat[(i + 1) * 3 + 2]);
      const c = cylinderBetweenPoints(p0, p1, r, colorHex, opacity, renderOrder);
      if (c) group.add(c);
    }
    return group.children.length ? group : null;
  }

  /** lineThickness scales radial span of inner/outer helix (portal “band width”). */
  function applyLayerRibbonWidthScale(rInner, rOuter, earthDist, layerConfig) {
    const rawTh = layerConfig && layerConfig.lineThickness != null ? Number(layerConfig.lineThickness) : 1;
    const th = Math.max(0.3, Math.min(4, isNaN(rawTh) ? 1 : rawTh));
    const mid = (rInner + rOuter) / 2;
    let half = Math.max(earthDist * 0.012, (rOuter - rInner) / 2);
    half *= 0.45 + 0.55 * th;
    return { rInner: mid - half, rOuter: mid + half };
  }

  function lerpHexColor(hexA, hexB, t) {
    const tt = clamp01(t);
    const ar = (hexA >> 16) & 0xff;
    const ag = (hexA >> 8) & 0xff;
    const ab = hexA & 0xff;
    const br = (hexB >> 16) & 0xff;
    const bg = (hexB >> 8) & 0xff;
    const bb = hexB & 0xff;
    const rr = Math.round(ar + (br - ar) * tt);
    const rg = Math.round(ag + (bg - ag) * tt);
    const rb = Math.round(ab + (bb - ab) * tt);
    return (rr << 16) | (rg << 8) | rb;
  }

  /** Desaturate distant events toward achromatic gray (strong contrast) while leaving a hint of hue. */
  const TEMPORAL_NEUTRAL_HEX = 0x8f8f8f;
  /** Within this window of selected or “now”, keep full chroma. */
  const TEMPORAL_VIVID_CLOSE_MS = 2.5 * 24 * 60 * 60 * 1000;
  /** Beyond this distance from both, blend down to TEMPORAL_VIVID_FLOOR. */
  const TEMPORAL_VIVID_FAR_MS = 65 * 24 * 60 * 60 * 1000;
  /** Minimum weight on the true event color when far (>0 so never fully monochrome). */
  const TEMPORAL_VIVID_FLOOR = 0.14;

  function temporalFadeSmoothstep(edge0, edge1, x) {
    if (x <= edge0) return 0;
    if (x >= edge1) return 1;
    const t = (x - edge0) / (edge1 - edge0);
    return t * t * (3 - 2 * t);
  }

  /**
   * @param {Date|null} start
   * @param {Date|null} end
   * @returns {number} midpoint ms, or start, or NaN
   */
  function getEventTemporalAnchorMs(start, end) {
    if (!start || isNaN(start.getTime())) return NaN;
    const a = start.getTime();
    if (!end || !(end > start)) return a;
    return (a + end.getTime()) / 2;
  }

  /** 1 = full vivid color; TEMPORAL_VIVID_FLOOR = most muted (vs neutral). */
  function getTemporalVividness01(anchorMs) {
    if (!isFinite(anchorMs)) return 1;
    const selFn = getSelectedDateTimeFn();
    const nowMs = Date.now();
    const dSel = selFn ? Math.abs(anchorMs - selFn().getTime()) : Infinity;
    const dNow = Math.abs(anchorMs - nowMs);
    const d = Math.min(dSel, dNow);
    const u = temporalFadeSmoothstep(TEMPORAL_VIVID_CLOSE_MS, TEMPORAL_VIVID_FAR_MS, d);
    return TEMPORAL_VIVID_FLOOR + (1 - TEMPORAL_VIVID_FLOOR) * (1 - u);
  }

  function getTemporalContextFactors(anchorMs, spanStart, spanEnd) {
    const vt = getTemporalVividness01(anchorMs);
    const vp = spanStart && !isNaN(spanStart.getTime())
      ? getPeripheralVividness01(spanStart, spanEnd)
      : 1;
    return { vt, vp, v: Math.min(vt, vp) };
  }

  /**
   * Half-width of the “in focus” time window around selected time, by zoom.
   * Matches yang/web/index.html nearbyHalfSpanMs (event list / horizon).
   */
  function getFocusHalfSpanMsForZoom(zl) {
    const z = typeof zl === 'number' && !isNaN(zl) ? zl : 5;
    if (z >= 9) return MS_PER_DAY;
    if (z >= 8) return 2 * MS_PER_DAY;
    if (z >= 7) return 7 * MS_PER_DAY;
    if (z >= 5) return 30 * MS_PER_DAY;
    if (z >= 3) return 120 * MS_PER_DAY;
    return 365 * MS_PER_DAY;
  }

  /** ms gap between event [s,e] and window [center±half]; 0 if they overlap. */
  function getPeripheralSeparationMs(spanStart, spanEnd, centerMs, halfMs) {
    if (!spanStart || isNaN(spanStart.getTime())) return 0;
    const s = spanStart.getTime();
    const e = spanEnd && !isNaN(spanEnd.getTime()) && spanEnd.getTime() > s ? spanEnd.getTime() : s;
    const w0 = centerMs - halfMs;
    const w1 = centerMs + halfMs;
    if (e < w0) return w0 - e;
    if (s > w1) return s - w1;
    return 0;
  }

  /** Local calendar year [Jan 1 .. Dec 31] for `ref` — matches Event List year / quarter zoom. */
  function getCalendarYearBoundsLocal(ref) {
    if (!ref || isNaN(ref.getTime())) ref = new Date();
    const y = ref.getFullYear();
    const start = new Date(y, 0, 1, 0, 0, 0, 0);
    const end = new Date(y, 11, 31, 23, 59, 59, 999);
    return { start, end };
  }

  /** ms gap from interval [s,e] to calendar-year window; 0 if overlap. */
  function getPeripheralSeparationMsYearMode(spanStart, spanEnd, yStart, yEnd) {
    if (!spanStart || isNaN(spanStart.getTime())) return 0;
    const s = spanStart.getTime();
    const e = spanEnd && !isNaN(spanEnd.getTime()) && spanEnd.getTime() > s ? spanEnd.getTime() : s;
    const y0 = yStart.getTime();
    const y1 = yEnd.getTime();
    if (e < y0) return y0 - e;
    if (s > y1) return s - y1;
    return 0;
  }

  /**
   * Desaturate events outside the Event List time horizon (selected ± half-span, or calendar year at zoom 3–4).
   * Also dims events inside the horizon that the list hides for zoom (long spans until you zoom in).
   * Cyan ring in the Event List panel shows the same window; blue/cyan matches the timeline accent (red reads as errors).
   */
  function getPeripheralVividness01(spanStart, spanEnd) {
    const zl = getZoomLevelForEvents();
    const selFn = getSelectedDateTimeFn();
    if (!selFn) return 1;
    if (!spanStart || isNaN(spanStart.getTime())) return 1;
    const ref = selFn();
    const spanEndEff = spanEnd && spanEnd > spanStart ? spanEnd : new Date(spanStart.getTime() + MS_PER_DAY);
    const textOk = areEventTextLabelsVisibleAtCurrentZoom(spanStart, spanEndEff) ||
      areEventNameLabelsVisibleAtCurrentZoom(spanStart, spanEndEff);
    const TEXT_OUTSIDE_LIST = 0.36;

    let sep = 0;
    if (zl === 3 || zl === 4) {
      const b = getCalendarYearBoundsLocal(ref);
      sep = getPeripheralSeparationMsYearMode(spanStart, spanEndEff, b.start, b.end);
    } else {
      const centerMs = ref.getTime();
      const halfMs = getFocusHalfSpanMsForZoom(zl);
      sep = getPeripheralSeparationMs(spanStart, spanEndEff, centerMs, halfMs);
    }

    if (sep <= 0) {
      return textOk ? 1 : TEXT_OUTSIDE_LIST;
    }

    let fadeMs;
    let floor;
    if (zl === 3 || zl === 4) {
      fadeMs = Math.max(20 * MS_PER_DAY, MS_PER_DAY * 45);
      floor = zl === 4 ? 0.22 : 0.28;
    } else {
      const halfMs = getFocusHalfSpanMsForZoom(zl);
      fadeMs = Math.max(halfMs * 0.24, MS_PER_DAY * 0.85);
      if (zl >= 9) floor = 0.16;
      else if (zl >= 8) floor = 0.22;
      else if (zl >= 7) floor = 0.3;
      else if (zl >= 5) floor = 0.45;
      else floor = 0.38;
    }
    const u = temporalFadeSmoothstep(0, fadeMs, sep);
    const vp = floor + (1 - floor) * (1 - u);
    return vp;
  }

  /**
   * @param {Date|null} spanStart - event (or line) interval start; drives peripheral window test
   * @param {Date|null} spanEnd - interval end; omit or same as start for instant events
   */
  function applyTemporalVividnessToHex(hex, anchorMs, spanStart, spanEnd) {
    const f = getTemporalContextFactors(anchorMs, spanStart, spanEnd);
    return lerpHexColor(TEMPORAL_NEUTRAL_HEX, hex, f.v);
  }

  function applyLongTermContextColorToHex(hex, anchorMs, spanStart, spanEnd, durationDays) {
    if (durationDays >= 1 && getLongEventContextFadeMode() === 'alpha') return hex;
    return applyTemporalVividnessToHex(hex, anchorMs, spanStart, spanEnd);
  }

  function getLongTermContextFillFadeScales(anchorMs, spanStart, spanEnd, durationDays) {
    if (durationDays < 1 || getLongEventContextFadeMode() !== 'alpha') {
      return { innerScale: 1, outerScale: 1 };
    }
    const f = getTemporalContextFactors(anchorMs, spanStart, spanEnd);
    const attenuation = Math.max(0, 1 - f.vp);
    const innerScale = Math.max(LONG_EVENT_CONTEXT_INNER_ALPHA_MIN, 1 - 0.78 * attenuation);
    const outerScale = Math.max(LONG_EVENT_CONTEXT_OUTER_ALPHA_MIN, 1 - 0.45 * attenuation);
    return { innerScale, outerScale };
  }

  // Earlier events -> warmer red, later events -> cooler blue.
  function getTimeGradientHex(normalizedTime) {
    const EARLY_RED = 0xef4444;
    const LATE_BLUE = 0x3b82f6;
    return lerpHexColor(EARLY_RED, LATE_BLUE, normalizedTime);
  }

  function hasExplicitEventColor(eventOrLine) {
    const raw = eventOrLine?.color ?? eventOrLine?.colorId ?? null;
    return raw != null && String(raw).trim() !== '';
  }

  function getTimeRange(items) {
    let minMs = Infinity;
    let maxMs = -Infinity;
    for (let i = 0; i < items.length; i++) {
      const d = getEventStart(items[i]);
      if (!d || isNaN(d.getTime())) continue;
      const ms = d.getTime();
      if (ms < minMs) minMs = ms;
      if (ms > maxMs) maxMs = ms;
    }
    if (!isFinite(minMs) || !isFinite(maxMs)) return null;
    return { minMs, maxMs };
  }

  /** Spine + connectors: short events spread over months (heuristic) or explicit circaevumSeriesId. */
  const SERIES_MIN_HEURISTIC_EVENTS = 4;
  const SERIES_MIN_HEURISTIC_SPAN_DAYS = 45;
  const SERIES_MAX_EVENT_HOURS = 48;
  const SERIES_MIN_EXPLICIT_EVENTS = 2;
  const SERIES_MIN_EXPLICIT_SPAN_DAYS = 14;
  /** Sun-ward centerline of the series spine; radial thickness matches short-event ribbon bands. */
  const SERIES_SPINE_RADIUS_FRAC = 0.34;

  function passesHeuristicTimeSeries(arr) {
    if (!arr || arr.length < SERIES_MIN_HEURISTIC_EVENTS) return false;
    let minT = Infinity;
    let maxT = -Infinity;
    for (let i = 0; i < arr.length; i++) {
      const ev = arr[i];
      const s = getEventStart(ev);
      if (!s || isNaN(s.getTime())) return false;
      let e = getEventEnd(ev);
      if (!e || e <= s) e = new Date(s.getTime() + 3600000);
      if (durationHoursBetween(s, e) > SERIES_MAX_EVENT_HOURS) return false;
      minT = Math.min(minT, s.getTime());
      maxT = Math.max(maxT, e.getTime());
    }
    const spanDays = ( maxT - minT) / (24 * 60 * 60 * 1000);
    return spanDays >= SERIES_MIN_HEURISTIC_SPAN_DAYS;
  }

  function passesExplicitTimeSeries(arr) {
    if (!arr || arr.length < SERIES_MIN_EXPLICIT_EVENTS) return false;
    let minT = Infinity;
    let maxT = -Infinity;
    for (let i = 0; i < arr.length; i++) {
      const ev = arr[i];
      const s = getEventStart(ev);
      if (!s || isNaN(s.getTime())) return false;
      let e = getEventEnd(ev);
      if (!e || e <= s) e = new Date(s.getTime() + 3600000);
      minT = Math.min(minT, s.getTime());
      maxT = Math.max(maxT, e.getTime());
    }
    const spanDays = (maxT - minT) / (24 * 60 * 60 * 1000);
    return spanDays >= SERIES_MIN_EXPLICIT_SPAN_DAYS;
  }

  /**
   * @returns {Array<Array>} list of event arrays (each is one series)
   */
  function clusterEventsIntoTimeSeries(allEvents) {
    if (!allEvents || allEvents.length < 2) return [];
    const explicit = new Map();
    const noId = [];
    for (let i = 0; i < allEvents.length; i++) {
      const ev = allEvents[i];
      const raw = ev.circaevumSeriesId != null ? String(ev.circaevumSeriesId).trim() : '';
      if (raw) {
        if (!explicit.has(raw)) explicit.set(raw, []);
        explicit.get(raw).push(ev);
      } else {
        noId.push(ev);
      }
    }
    const out = [];
    explicit.forEach((arr) => {
      if (passesExplicitTimeSeries(arr)) out.push(arr);
    });
    const byCat = new Map();
    for (let i = 0; i < noId.length; i++) {
      const ev = noId[i];
      const cat = getEventCategory(ev);
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat).push(ev);
    }
    byCat.forEach((arr) => {
      if (passesHeuristicTimeSeries(arr)) out.push(arr);
    });
    return out;
  }

  /** World position at event mid-time for connector endpoint (matches short-event placement). */
  function getSeriesEventMidAnchor(ev, earthDist, currentHeight) {
    const start = getEventStart(ev);
    if (!start || isNaN(start.getTime())) return null;
    let end = getEventEnd(ev);
    if (!end || end <= start) end = new Date(start.getTime() + 3600000);
    const mid = new Date((start.getTime() + end.getTime()) / 2);
    if (typeof calculateDateHeight !== 'function') return null;
    const startHeight = calculateDateHeight(
      start.getFullYear(), start.getMonth(), start.getDate(), start.getHours()
    );
    const endHeight = calculateDateHeight(
      end.getFullYear(), end.getMonth(), end.getDate(), end.getHours()
    );
    const midHeight = (startHeight + endHeight) / 2;
    const rDot = getRadiusForDailyEventDot(earthDist, mid, 0);
    const angle = getOrbitAngleForShortEventPlacement(midHeight, currentHeight);
    if (typeof SceneGeometry !== 'undefined' && SceneGeometry.getPosition3D) {
      const p = SceneGeometry.getPosition3D(midHeight, angle, rDot);
      return { x: p.x, y: p.y, z: p.z };
    }
    return {
      x: Math.cos(angle) * rDot,
      y: midHeight,
      z: Math.sin(angle) * rDot
    };
  }

  /**
   * Helical arc (inner+outer edges, same radial width as short events) + connector lines to each session.
   * @returns {THREE.Group[]}
   */
  function createTimeSeriesDecorationGroups(events, layerConfig) {
    const groups = [];
    if (!events || !layerConfig || typeof calculateDateHeight !== 'function') return groups;
    const seriesList = clusterEventsIntoTimeSeries(events);
    if (seriesList.length === 0) return groups;

    const earthDist = getEarthDistance();
    const currentHeight = getWorldlineOrbitReferenceHeight();
    const layerHex = parseColor(layerConfig.color || '#00b4d8');
    const rSpine = earthDist * SERIES_SPINE_RADIUS_FRAC;

    for (let s = 0; s < seriesList.length; s++) {
      const series = seriesList[s];
      const sorted = series
        .filter((ev) => getEventStart(ev))
        .sort((a, b) => getEventStart(a).getTime() - getEventStart(b).getTime());
      if (sorted.length < 2) continue;

      const first = getEventStart(sorted[0]);
      let maxEndT = -Infinity;
      for (let i = 0; i < sorted.length; i++) {
        const st = getEventStart(sorted[i]);
        let en = getEventEnd(sorted[i]);
        if (!en || en <= st) en = new Date(st.getTime() + 3600000);
        maxEndT = Math.max(maxEndT, en.getTime());
      }
      const lastEnd = new Date(maxEndT);
      const seriesMidMs = (first.getTime() + lastEnd.getTime()) / 2;
      const spineColorHex = applyTemporalVividnessToHex(layerHex, seriesMidMs, first, lastEnd);

      const startHeight = calculateDateHeight(
        first.getFullYear(), first.getMonth(), first.getDate(), first.getHours()
      );
      const endHeight = calculateDateHeight(
        lastEnd.getFullYear(), lastEnd.getMonth(), lastEnd.getDate(), lastEnd.getHours()
      );

      const segCount = Math.max(48, Math.min(160, Math.ceil(Math.abs(endHeight - startHeight) / 8)));
      const bandRef = getEventBandRadii(earthDist, 2);
      const halfBand = (bandRef.rOuter - bandRef.rInner) / 2;
      let rInnerSpine = rSpine - halfBand;
      let rOuterSpine = rSpine + halfBand;
      const ribbonSpine = applyLayerRibbonWidthScale(rInnerSpine, rOuterSpine, earthDist, layerConfig);
      rInnerSpine = ribbonSpine.rInner;
      rOuterSpine = ribbonSpine.rOuter;
      if (shouldApplyConcentricLongEventRibbonLayout()) {
        const sp = applyConcentricEventRibbonRadii(earthDist, rInnerSpine, rOuterSpine, null);
        rInnerSpine = sp.rInner;
        rOuterSpine = sp.rOuter;
      }

      const pair = buildHelixPair(startHeight, endHeight, rInnerSpine, rOuterSpine, currentHeight, segCount);
      if (!pair.innerFlat || !pair.outerFlat || pair.innerFlat.length < 6) continue;

      const root = new global.THREE.Group();
      root.userData = {
        type: 'EventSeriesDecoration',
        layerId: layerConfig.id,
      };

      const roSpine = -10;
      const spineOpacity = 0.5;
      function spineEdgeFromFlat(flat) {
        const g = new global.THREE.BufferGeometry();
        g.setAttribute('position', new global.THREE.Float32BufferAttribute(flat, 3));
        const m = new global.THREE.LineBasicMaterial({
          color: spineColorHex,
          transparent: true,
          opacity: spineOpacity,
          linewidth: 1
        });
        const ln = new global.THREE.Line(g, m);
        ln.renderOrder = roSpine;
        return ln;
      }
      root.add(spineEdgeFromFlat(pair.innerFlat));
      root.add(spineEdgeFromFlat(pair.outerFlat));
      addBandEndConnectors(root, pair.innerFlat, pair.outerFlat, spineColorHex, spineOpacity, roSpine);

      for (let i = 0; i < sorted.length; i++) {
        const anchor = getSeriesEventMidAnchor(sorted[i], earthDist, currentHeight);
        if (!anchor) continue;
        const ev = sorted[i];
        const st = getEventStart(ev);
        let en = getEventEnd(ev);
        if (!en || en <= st) en = new Date(st.getTime() + 3600000);
        const midHeight = (calculateDateHeight(st.getFullYear(), st.getMonth(), st.getDate(), st.getHours()) +
          calculateDateHeight(en.getFullYear(), en.getMonth(), en.getDate(), en.getHours())) / 2;
        const angle = getOrbitAngleForShortEventPlacement(midHeight, currentHeight);
        let sx; let sy; let sz;
        if (typeof SceneGeometry !== 'undefined' && SceneGeometry.getPosition3D) {
          const p = SceneGeometry.getPosition3D(midHeight, angle, rSpine);
          sx = p.x;
          sy = p.y;
          sz = p.z;
        } else {
          sx = Math.cos(angle) * rSpine;
          sy = midHeight;
          sz = Math.sin(angle) * rSpine;
        }
        const connGeo = new global.THREE.BufferGeometry();
        connGeo.setAttribute('position', new global.THREE.Float32BufferAttribute([
          sx, sy, sz,
          anchor.x, anchor.y, anchor.z
        ], 3));
        const connAnchorMs = (st.getTime() + en.getTime()) / 2;
        const connColorHex = applyTemporalVividnessToHex(layerHex, connAnchorMs, st, en);
        const connMat = new global.THREE.LineBasicMaterial({
          color: connColorHex,
          transparent: true,
          opacity: 0.32
        });
        const conn = new global.THREE.Line(connGeo, connMat);
        conn.renderOrder = -9;
        root.add(conn);
      }

      groups.push(root);
    }
    return groups;
  }

  function getNormalizedTimeForDate(date, range) {
    if (!date || isNaN(date.getTime())) return 0.5;
    if (range && isFinite(range.minMs) && isFinite(range.maxMs) && range.maxMs > range.minMs) {
      return clamp01((date.getTime() - range.minMs) / (range.maxMs - range.minMs));
    }
    const startOfYear = Date.UTC(date.getUTCFullYear(), 0, 1, 0, 0, 0, 0);
    const startOfNextYear = Date.UTC(date.getUTCFullYear() + 1, 0, 1, 0, 0, 0, 0);
    return clamp01((date.getTime() - startOfYear) / Math.max(1, (startOfNextYear - startOfYear)));
  }

  /**
   * Create a single event marker (point event or start of duration event)
   * @param {Object|VEvent} event
   * @param {Object} layerConfig - { id, color, opacity }
   * @param {number} radius - Orbit radius (default Earth)
   * @returns {THREE.Mesh|null}
   */
  function createEventMarker(event, layerConfig, radius) {
    const earthDist = getEarthDistance();
    const start = getEventStart(event);
    if (!start || isNaN(start.getTime())) return null;
    if (shouldHideCircadianShortEventForDayScope(start, null)) return null;

    const height = typeof calculateDateHeight === 'function'
      ? calculateDateHeight(start.getFullYear(), start.getMonth(), start.getDate(), start.getHours())
      : 0;
    const currentHeight = getEventOrbitReferenceHeight();

    let pos = null;
    if (shouldUseCircadianNearEarthShortPlacement()) {
      const CR = global.CircadianRenderer;
      const dr = layerConfig._diskRibbon;
      const rUse =
        dr && dr.rMid != null
          ? dr.rMid
          : (CR && typeof CR.getHandLength === 'function' ? CR.getHandLength() * 0.88 : 10.5);
      if (CR && typeof CR.blendedDiskPointAtDate === 'function' && typeof calculateDateHeight === 'function') {
        pos = CR.blendedDiskPointAtDate(
          start,
          rUse,
          currentHeight,
          calculateDateHeight,
          getCircadianStraightenBlendForEvents()
        );
      }
    }
    if (!pos) {
      const r = shouldUseDayBandDotPlacement()
        ? earthDist * DAY_EVENT_DOT_RADIUS_FRAC
        : (radius != null ? radius : getRadiusForTimeOfDay(start, earthDist, 0));
      const angle = getOrbitAngleForShortEventPlacement(height, currentHeight);
      pos = typeof SceneGeometry !== 'undefined' && SceneGeometry.getPosition3D
        ? SceneGeometry.getPosition3D(height, angle, r)
        : { x: Math.cos(angle) * r, y: height, z: Math.sin(angle) * r };
    }

    const explicitColor = hasExplicitEventColor(event);
    const fallbackGradient = getTimeGradientHex(getNormalizedTimeForDate(start, layerConfig._timeColorRange));
    const colorBase = parseColor(explicitColor ? (event.color ?? event.colorId) : fallbackGradient);
    let spanEnd = getEventEnd(event);
    if (!spanEnd || spanEnd <= start) spanEnd = start;
    const color = applyTemporalVividnessToHex(colorBase, start.getTime(), start, spanEnd);
    const sphereR = shouldUseDayBandDotPlacement() ? 0.28 : 0.55;
    const opMul = getDailyCircadianEventOpacityMul(start, spanEnd);
    const THREE = global.THREE;
    const fillOp = Math.min(0.9, Math.max(0.16, 0.5 * opMul));
    const outlineOp = Math.min(0.95, Math.max(0.24, 0.75 * opMul));
    const geo = new THREE.SphereGeometry(sphereR * 0.94, 16, 16);
    const fillMesh = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: fillOp,
        depthWrite: false,
        side: THREE.DoubleSide
      })
    );
    const edgeLines = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: outlineOp,
        depthWrite: false
      })
    );
    edgeLines.renderOrder = 3;
    const markerRoot = new THREE.Group();
    markerRoot.add(fillMesh);
    markerRoot.add(edgeLines);
    markerRoot.position.set(pos.x, pos.y, pos.z);
    const userData = {
      vevent: event,
      layerId: layerConfig.id,
      type: 'EventObject',
      eventUid: (typeof VEvent !== 'undefined' && event instanceof VEvent ? event.uid : event.uid || event.id) || null
    };
    if (shouldAttachShortCircadianToWorldGroup()) userData.circadianWorldSpaceLayer = true;
    markerRoot.userData = userData;

    const showConn = isCircadianHelixZoom(getZoomLevelForEvents()) &&
      normalizedCircadianState() !== 'off' &&
      isDateOnSelectedCalendarDay(start);
    if (showConn) {
      const grp = new THREE.Group();
      grp.userData = userData;
      grp.add(markerRoot);
      addCircadianConnectorIfApplicable(grp, pos.x, pos.y, pos.z, start, color);
      return grp;
    }
    return markerRoot;
  }

  /**
   * Create a short worldline for a duration event. Layer style: plotType (legacy), lineThickness (band width),
   * fillColor (omit to follow per-event color), borderStyle (event | layer | custom | none), borderColor (with custom),
   * borderThickness (outline emphasis).
   * @param {Object|VEvent} event
   * @param {Object} layerConfig
   * @param {number} radius
   * @returns {THREE.Object3D|null} Line, Group (tube + outline), or flattened group
   */
  function createEventWorldline(event, layerConfig, radius) {
    const earthDist = getEarthDistance();
    const start = getEventStart(event);
    const end = getEventEnd(event);
    if (!start || isNaN(start.getTime())) return null;
    if (!end || end <= start) {
      return createEventMarker(event, layerConfig, radius);
    }

    const midTitleAlong01 =
      layerConfig && layerConfig._midTitleAlongSpan != null && !isNaN(layerConfig._midTitleAlongSpan)
        ? Math.max(0, Math.min(1, Number(layerConfig._midTitleAlongSpan)))
        : 0.5;

    const refSelected = getEventOrbitReferenceHeight();
    const refWorldline = getWorldlineOrbitReferenceHeight();
    const startHeight = typeof calculateDateHeight === 'function'
      ? calculateDateHeight(start.getFullYear(), start.getMonth(), start.getDate(), start.getHours())
      : 0;
    const endHeight = typeof calculateDateHeight === 'function'
      ? calculateDateHeight(end.getFullYear(), end.getMonth(), end.getDate(), end.getHours())
      : startHeight;

    const durationH = durationHoursBetween(start, end);
    if (durationH < 24) {
      const anchorMsShort = getEventTemporalAnchorMs(start, end);
      if (shouldHideCircadianShortEventForDayScope(start, end)) return null;
      const zl = getZoomLevelForEvents();
      const circ = normalizedCircadianState();
      const straightenBlend = getCircadianStraightenBlendForEvents();
      const useDiskRibbon =
        isCircadianHelixZoom(zl) &&
        circ !== 'off' &&
        typeof global.CircadianRenderer !== 'undefined' &&
        typeof global.CircadianRenderer.buildDiskRibbonBetween === 'function' &&
        typeof calculateDateHeight === 'function';

      const eventColorRaw = event.color ?? event.colorId ?? null;
      const explicitEventColor = hasExplicitEventColor(event);
      const fallbackGradient = getTimeGradientHex(getNormalizedTimeForDate(start, layerConfig._timeColorRange));
      let eventHex = parseColor(explicitEventColor ? eventColorRaw : fallbackGradient);
      eventHex = applyTemporalVividnessToHex(eventHex, anchorMsShort, start, end);
      const layerHex = parseColor(layerConfig.color || '#00b4d8');
      const userData = {
        vevent: event,
        layerId: layerConfig.id,
        type: 'EventObject',
        eventUid: (typeof VEvent !== 'undefined' && event instanceof VEvent ? event.uid : event.uid || event.id) || null
      };

      if (useDiskRibbon) {
        const segments = Math.max(8, Math.min(48, Math.ceil(durationH * 4)));
        const CR = global.CircadianRenderer;
        const dr = layerConfig._diskRibbon;
        let rIn;
        let rOut;
        if (dr && dr.rIn != null && dr.rOut != null && dr.rOut > dr.rIn) {
          rIn = dr.rIn;
          rOut = dr.rOut;
        } else {
          const hl = typeof CR.getHandLength === 'function' ? CR.getHandLength() : 12;
          const halfRadial = Math.max(hl * 0.028, 0.18);
          rIn = Math.max(hl * 0.72, hl - halfRadial);
          rOut = hl + halfRadial;
        }
        const ribbonPair = CR.buildDiskRibbonBetween(
          start,
          end,
          rIn,
          rOut,
          refSelected,
          calculateDateHeight,
          segments,
          straightenBlend
        );
        if (ribbonPair && ribbonPair.innerFlat && ribbonPair.outerFlat && ribbonPair.innerFlat.length >= 6) {
          const durationDays = Math.max(durationH / 24, 1 / 24);
          const plotType = layerConfig.plotType ?? 'polygon3d';
          const dailyMul = getDailyCircadianEventOpacityMul(start, end);
          const opacity = Math.min(1,
            (layerConfig.opacity != null ? layerConfig.opacity : 0.78) *
              getDurationOpacityScale(durationDays) * dailyMul);
          const roBoost = getDurationRibbonRenderOrderBoost(durationDays);
          const roFill = -4 + roBoost;
          const roLine = -2 + roBoost;
          const fillOpacity = Math.min(0.98,
            opacity * getDurationFillOpacityFactor(durationDays) * getShortTermEventFillOpacityMul());
          let fillHex = parseColor(layerConfig.fillColor || (explicitEventColor ? eventColorRaw : null) || fallbackGradient);
          fillHex = applyTemporalVividnessToHex(fillHex, anchorMsShort, start, end);
          const borderStyle = layerConfig.borderStyle || 'event';
          let outlineColorHex = resolveRibbonOutlineColor(borderStyle, layerConfig, eventHex, layerHex, event);
          if (outlineColorHex != null) outlineColorHex = applyTemporalVividnessToHex(outlineColorHex, anchorMsShort, start, end);
          let outlineOp = getRibbonOutlineOpacity(opacity, borderStyle, layerConfig);
          outlineOp *= 0.74;

          const innerFlat = ribbonPair.innerFlat;
          const outerFlat = ribbonPair.outerFlat;
          const circTubeMul = getShortCircadianRibbonTubeScale();

          function lineFromFlatShort(flat, hex, op, renderOrder, lineWidth) {
            const lw = lineWidth != null ? lineWidth : 1;
            const geometry = new global.THREE.BufferGeometry();
            geometry.setAttribute('position', new global.THREE.Float32BufferAttribute(flat, 3));
            const material = new global.THREE.LineBasicMaterial({
              color: hex,
              transparent: true,
              opacity: op,
              linewidth: lw
            });
            const lineObj = new global.THREE.Line(geometry, material);
            lineObj.renderOrder = renderOrder != null ? renderOrder : roLine;
            return lineObj;
          }

          const group = new global.THREE.Group();
          group.userData = userData;
          if (shouldAttachShortCircadianToWorldGroup()) userData.circadianWorldSpaceLayer = true;

          if (plotType === 'lines') {
            group.add(lineFromFlatShort(innerFlat, eventHex, opacity, roLine));
            group.add(lineFromFlatShort(outerFlat, eventHex, opacity, roLine));
            addBandEndConnectors(group, innerFlat, outerFlat, eventHex, opacity, roLine);
          } else if (plotType === 'polygon3d' || plotType === 'polygon2d') {
            const ribbonGeo = createRibbonBufferFromFlatArrays(innerFlat, outerFlat);
            if (ribbonGeo) {
              const fillMesh = createRibbonFillMesh(ribbonGeo, fillHex, fillOpacity, plotType, roFill, durationDays);
              group.add(fillMesh);
              if (borderStyle !== 'none' && outlineColorHex != null) {
                const tubeR = getRibbonOutlineTubeRadius(earthDist, layerConfig) * circTubeMul;
                const oIn = createTubeOutlineAlongFlat(innerFlat, outlineColorHex, outlineOp, roLine, earthDist, layerConfig, circTubeMul);
                const oOut = createTubeOutlineAlongFlat(outerFlat, outlineColorHex, outlineOp, roLine, earthDist, layerConfig, circTubeMul);
                if (oIn) group.add(oIn);
                if (oOut) group.add(oOut);
                addBandEndConnectors(group, innerFlat, outerFlat, outlineColorHex, outlineOp, roLine, tubeR);
              }
            }
          } else {
            // Unknown plotType: keep the short circadian arc visible instead of falling through to dot-only fallback.
            const tConn = getRibbonOutlineTubeRadius(earthDist, layerConfig) * circTubeMul;
            group.add(lineFromFlatShort(innerFlat, eventHex, opacity, roLine));
            group.add(lineFromFlatShort(outerFlat, eventHex, opacity, roLine));
            addBandEndConnectors(group, innerFlat, outerFlat, eventHex, opacity, roLine, tConn);
          }

          if (areEventTextLabelsVisibleAtCurrentZoom(start, end) || areEventNameLabelsVisibleAtCurrentZoom(start, end)) {
            const bdHelix = getEventBandRadii(earthDist, durationDays);
            addEventWorldlineLabelSprites(
              group,
              event,
              start,
              end,
              startHeight,
              endHeight,
              bdHelix.rInner,
              bdHelix.rOuter,
              eventHex,
              refSelected,
              0,
              innerFlat,
              outerFlat,
              midTitleAlong01
            );
          }

          if (group.children.length > 0) return group;
        }
      }

      const midDate = new Date((start.getTime() + end.getTime()) / 2);
      const getPos = function (h, rad) {
        const a = getOrbitAngleForShortEventPlacement(h, refSelected);
        return { x: Math.cos(a) * rad, y: h, z: Math.sin(a) * rad };
      };
      const midHeight = (startHeight + endHeight) / 2;
      let pos = null;
      if (shouldUseCircadianNearEarthShortPlacement()) {
        const dr = layerConfig._diskRibbon;
        pos = getShortEventCircadianNearEarthPosition(
          start,
          end,
          refSelected,
          dr && dr.rMid != null ? dr.rMid : null
        );
      }
      if (!pos) {
        const rDot = getRadiusForDailyEventDot(earthDist, midDate, 0);
        pos = getPos(midHeight, rDot);
      }
      const markerSize = Math.max(0.22, Math.min(0.5, 0.22 + 0.28 * Math.min(1, durationH / 24)));
      const marker = createEventLinePointMarker(pos.x, pos.y, pos.z, eventHex, markerSize, userData, start, end);
      const grp = new global.THREE.Group();
      grp.userData = userData;
      grp.add(marker);
      const bdDot = getEventBandRadii(earthDist, Math.max(durationH / 24, 1e-3));
      addEventWorldlineLabelSprites(grp, event, start, end, startHeight, endHeight, bdDot.rInner, bdDot.rOuter, eventHex, refSelected, 0, undefined, undefined, midTitleAlong01);
      addCircadianConnectorIfApplicable(grp, pos.x, pos.y, pos.z, midDate, eventHex);
      if (shouldAttachShortCircadianToWorldGroup()) grp.userData.circadianWorldSpaceLayer = true;
      return grp;
    }

    if (shouldHideCircadianEventOutsideSelectedDayAtClockZooms(start, end)) return null;

    const durationDays = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
    const band = radius != null && !isNaN(radius)
      ? { rInner: Math.max(earthDist * 0.2, radius * 0.92), rOuter: Math.min(earthDist * 0.8, radius * 1.08) }
      : getEventBandRadii(earthDist, durationDays);
    let { rInner, rOuter } = band;
    if (rOuter <= rInner) rOuter = rInner + earthDist * 0.04;
    const ribbonScaled = applyLayerRibbonWidthScale(rInner, rOuter, earthDist, layerConfig);
    rInner = ribbonScaled.rInner;
    rOuter = ribbonScaled.rOuter;
    if (shouldApplyConcentricLongEventRibbonLayout() && !eventBandUsesWeekCorridor(durationDays)) {
      const rank01 = layerConfig._durationRank01 != null ? layerConfig._durationRank01 : null;
      const conc = applyConcentricEventRibbonRadii(earthDist, rInner, rOuter, rank01);
      rInner = conc.rInner;
      rOuter = conc.rOuter;
    }

    const segments = 32;
    const { innerFlat, outerFlat } = buildHelixPair(startHeight, endHeight, rInner, rOuter, refWorldline, segments);
    const staggerLogical = getEventBandVerticalStagger(durationDays);
    const hasRibbon = innerFlat.length >= 6 && innerFlat.length === outerFlat.length;

    const plotType = layerConfig.plotType ?? 'polygon3d'; // default filled; use 'lines' in layer style for outline-only
    const opacity = Math.min(1,
      (layerConfig.opacity != null ? layerConfig.opacity : 0.7) * getDurationOpacityScale(durationDays));
    const roBoost = getDurationRibbonRenderOrderBoost(durationDays);
    const roFill = -4 + roBoost;
    const roLine = -2 + roBoost;
    const fillOpacity = Math.min(0.98, opacity * getDurationFillOpacityFactor(durationDays));
    const anchorMsLong = getEventTemporalAnchorMs(start, end);
    const eventColorRaw = event.color ?? event.colorId ?? null;
    const explicitEventColor = hasExplicitEventColor(event);
    const fallbackGradient = getTimeGradientHex(getNormalizedTimeForDate(start, layerConfig._timeColorRange));
    let eventHex = parseColor(explicitEventColor ? eventColorRaw : fallbackGradient);
    eventHex = applyLongTermContextColorToHex(eventHex, anchorMsLong, start, end, durationDays);
    const layerHex = parseColor(layerConfig.color || '#00b4d8');
    // Prefer explicit fillColor, then per-event color, then layer color.
    let fillHex = parseColor(layerConfig.fillColor || (explicitEventColor ? eventColorRaw : null) || fallbackGradient);
    fillHex = applyLongTermContextColorToHex(fillHex, anchorMsLong, start, end, durationDays);
    const borderStyle = layerConfig.borderStyle || 'event';
    let outlineColorHex = resolveRibbonOutlineColor(borderStyle, layerConfig, eventHex, layerHex, event);
    if (outlineColorHex != null) outlineColorHex = applyLongTermContextColorToHex(outlineColorHex, anchorMsLong, start, end, durationDays);
    const outlineOp = getRibbonOutlineOpacity(opacity, borderStyle, layerConfig);
    const fillFade = getLongTermContextFillFadeScales(anchorMsLong, start, end, durationDays);

    const userData = {
      vevent: event,
      layerId: layerConfig.id,
      type: 'EventObject',
      eventUid: (typeof VEvent !== 'undefined' && event instanceof VEvent ? event.uid : event.uid || event.id) || null
    };

    function lineFromFlat(flat, hex, op, renderOrder, lineWidth) {
      const lw = lineWidth != null ? lineWidth : 1;
      const geometry = new global.THREE.BufferGeometry();
      geometry.setAttribute('position', new global.THREE.Float32BufferAttribute(flat, 3));
      const material = new global.THREE.LineBasicMaterial({
        color: hex,
        transparent: true,
        opacity: op,
        linewidth: lw
      });
      const lineObj = new global.THREE.Line(geometry, material);
      lineObj.renderOrder = renderOrder != null ? renderOrder : roLine;
      return lineObj;
    }

    if (plotType === 'lines' && hasRibbon) {
      const group = new global.THREE.Group();
      group.userData = userData;
      group.add(lineFromFlat(innerFlat, eventHex, opacity, roLine));
      group.add(lineFromFlat(outerFlat, eventHex, opacity, roLine));
      addBandEndConnectors(group, innerFlat, outerFlat, eventHex, opacity, roLine);
      return attachEventStaggerRoot(
        wrapWorldlineWithLabels(group, userData, event, start, end, startHeight, endHeight, rInner, rOuter, eventHex, refWorldline, 0, innerFlat, outerFlat, midTitleAlong01),
        staggerLogical);
    }

    if ((plotType === 'polygon3d' || plotType === 'polygon2d') && hasRibbon) {
      const ribbonGeo = createRibbonBufferFromFlatArrays(innerFlat, outerFlat);
      if (ribbonGeo) {
        const group = new global.THREE.Group();
        group.userData = userData;
        const fillMesh = createRibbonFillMesh(ribbonGeo, fillHex, fillOpacity, plotType, roFill, durationDays, fillFade);
        group.add(fillMesh);
        if (borderStyle !== 'none' && outlineColorHex != null) {
          const tubeR = getRibbonOutlineTubeRadius(earthDist, layerConfig);
          const oIn = createTubeOutlineAlongFlat(innerFlat, outlineColorHex, outlineOp, roLine, earthDist, layerConfig);
          const oOut = createTubeOutlineAlongFlat(outerFlat, outlineColorHex, outlineOp, roLine, earthDist, layerConfig);
          if (oIn) group.add(oIn);
          if (oOut) group.add(oOut);
          addBandEndConnectors(group, innerFlat, outerFlat, outlineColorHex, outlineOp, roLine, tubeR);
        }
        return attachEventStaggerRoot(
          wrapWorldlineWithLabels(group, userData, event, start, end, startHeight, endHeight, rInner, rOuter, eventHex, refWorldline, 0, innerFlat, outerFlat, midTitleAlong01),
          staggerLogical);
      }
    }

    const rMid = (rInner + rOuter) * 0.5;
    let points;
    if (typeof SceneGeometry !== 'undefined' && SceneGeometry.createEarthHelicalCurve) {
      points = SceneGeometry.createEarthHelicalCurve(startHeight, endHeight, rMid, refWorldline, 32);
    } else {
      const angle0 = typeof SceneGeometry !== 'undefined' && SceneGeometry.getAngle
        ? SceneGeometry.getAngle(startHeight, refWorldline)
        : 0;
      const angle1 = typeof SceneGeometry !== 'undefined' && SceneGeometry.getAngle
        ? SceneGeometry.getAngle(endHeight, refWorldline)
        : angle0;
      const p0 = typeof SceneGeometry !== 'undefined' && SceneGeometry.getPosition3D
        ? SceneGeometry.getPosition3D(startHeight, angle0, rMid)
        : { x: Math.cos(angle0) * rMid, y: startHeight, z: Math.sin(angle0) * rMid };
      const p1 = typeof SceneGeometry !== 'undefined' && SceneGeometry.getPosition3D
        ? SceneGeometry.getPosition3D(endHeight, angle1, rMid)
        : { x: Math.cos(angle1) * rMid, y: endHeight, z: Math.sin(angle1) * rMid };
      points = [p0.x, p0.y, p0.z, p1.x, p1.y, p1.z];
    }
    let fallbackOutlineHex = resolveRibbonOutlineColor(borderStyle, layerConfig, eventHex, layerHex, event);
    if (fallbackOutlineHex != null) fallbackOutlineHex = applyLongTermContextColorToHex(fallbackOutlineHex, anchorMsLong, start, end, durationDays);
    const useOutline = borderStyle !== 'none' && fallbackOutlineHex != null;
    const strokeHex = useOutline ? fallbackOutlineHex : eventHex;
    const strokeOp = useOutline ? getRibbonOutlineOpacity(opacity, borderStyle, layerConfig) : opacity;
    let strokeObj = null;
    if (useOutline) {
      strokeObj = createTubeOutlineAlongFlat(points, strokeHex, strokeOp, roLine, earthDist, layerConfig);
    }
    if (!strokeObj) {
      const geometry = new global.THREE.BufferGeometry();
      geometry.setAttribute('position', new global.THREE.Float32BufferAttribute(points, 3));
      const material = new global.THREE.LineBasicMaterial({
        color: strokeHex,
        transparent: true,
        opacity: strokeOp,
        linewidth: 1
      });
      strokeObj = new global.THREE.Line(geometry, material);
      strokeObj.renderOrder = roLine;
    }
    strokeObj.userData = userData;
    return attachEventStaggerRoot(
      wrapWorldlineWithLabels(strokeObj, userData, event, start, end, startHeight, endHeight, rInner, rOuter, eventHex, refWorldline, 0, null, null, midTitleAlong01),
      staggerLogical);
  }

  /**
   * Create line segments from raw { start, end, label?, color? }. Used by addEventLines API.
   * Radius is between Earth worldline and day-name boundary (55/64 of earth distance).
   * Labels: event name at midsection, MM/DD at start and end; same color as the line.
   * @param {Array<{ start: Date|string, end: Date|string, label?: string, color?: string|number }>} lines
   * @param {Object} layerConfig - Layer config (id, color, opacity, ...)
   * @param {THREE.Group|null} sceneContentGroup - Group to add lines to (usually flattenableGroup)
   * @param {number} radiusOverride - Optional; if not set, uses radius between worldline and day-name boundary
   * @param {THREE.Group|null} worldSpaceGroup - When set (scene root), short circadian lines attach here if userData.circadianWorldSpaceLayer
   * @returns {Array<THREE.Object3D>} Created line and label objects (EventLine + sprites)
   */
  function createEventLineObjects(lines, layerConfig, sceneContentGroup, radiusOverride, worldSpaceGroup) {
    const lineTimeRange = getTimeRange(lines);
    const earthDist = typeof radiusOverride === 'number' && !isNaN(radiusOverride)
      ? radiusOverride
      : getEarthDistance();
    const objects = [];
    if (!lines || !Array.isArray(lines) || !layerConfig) return objects;
    const group = sceneContentGroup || null;
    const worldGroup = worldSpaceGroup || null;
    const lineZl = getZoomLevelForEvents();
    const lineDurationRanks = buildDurationRankMapForLines(lines);
    const titleAlongByLineIdx = computeTitleAlongForLayerLines(lines);

    function addToFlattenOrWorld(root) {
      if (!root) return;
      const p = (worldGroup && root.userData && root.userData.circadianWorldSpaceLayer) ? worldGroup : group;
      if (p) p.add(root);
    }

    const refSelected = getEventOrbitReferenceHeight();
    const refWorldline = getWorldlineOrbitReferenceHeight();

    const getAngle = typeof SceneGeometry !== 'undefined' && SceneGeometry.getAngle
      ? function (h) { return SceneGeometry.getAngle(h, refWorldline); }
      : function () { return 0; };
    const getPos = function (h, rad) {
      const a = getAngle(h);
      return {
        x: Math.cos(a) * rad,
        y: h,
        z: Math.sin(a) * rad
      };
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const start = line.start instanceof Date ? line.start : new Date(line.start);
      const end = line.end instanceof Date ? line.end : new Date(line.end);
      if (!start || isNaN(start.getTime()) || !end || isNaN(end.getTime()) || end <= start) continue;

      const startHeight = typeof calculateDateHeight === 'function'
        ? calculateDateHeight(start.getFullYear(), start.getMonth(), start.getDate(), start.getHours())
        : 0;
      const endHeight = typeof calculateDateHeight === 'function'
        ? calculateDateHeight(end.getFullYear(), end.getMonth(), end.getDate(), end.getHours())
        : startHeight;

      const durationMs = end.getTime() - start.getTime();
      const durationDays = durationMs / (24 * 60 * 60 * 1000);
      const durationH = durationHoursBetween(start, end);
      const sameDay = start.getFullYear() === end.getFullYear() &&
        start.getMonth() === end.getMonth() && start.getDate() === end.getDate();
      const isShortEvent = durationH < 24;

      const midDate = new Date((start.getTime() + end.getTime()) / 2);
      const anchorMs = midDate.getTime();
      const rShort = getRadiusForDailyEventDot(earthDist, midDate, i % 4);

      const lineHasExplicitColor = hasExplicitEventColor(line);
      const lineGradient = getTimeGradientHex(getNormalizedTimeForDate(start, lineTimeRange));
      let colorHex = parseColor(lineHasExplicitColor ? line.color : lineGradient);
      colorHex = applyTemporalVividnessToHex(colorHex, anchorMs, start, end);
      const midHeight = (startHeight + endHeight) / 2;

      const byCategory = layerConfig.layerStylesByCategory || {};
      const firstStyle = Object.keys(byCategory).length > 0 ? byCategory[Object.keys(byCategory)[0]] : {};
      const lineStyle = (line.category && byCategory[line.category]) ? byCategory[line.category] : firstStyle;
      const outlineLayerCfg = { ...layerConfig, ...lineStyle };

      if (isShortEvent) {
        if (shouldHideCircadianShortEventForDayScope(start, end)) {
          continue;
        }
        const zl = getZoomLevelForEvents();
        const circ = normalizedCircadianState();
        const straightenBlendLines = getCircadianStraightenBlendForEvents();
        const useHelixRibbon =
          isCircadianHelixZoom(zl) &&
          circ !== 'off' &&
          typeof global.CircadianRenderer !== 'undefined' &&
          typeof global.CircadianRenderer.buildHelixRibbonBetween === 'function' &&
          typeof calculateDateHeight === 'function';

        const getPosShort = function (h, rad) {
          const a = getOrbitAngleForShortEventPlacement(h, refSelected);
          return {
            x: Math.cos(a) * rad,
            y: h,
            z: Math.sin(a) * rad
          };
        };

        if (useHelixRibbon) {
          const segments = Math.max(8, Math.min(48, Math.ceil(durationH * 4)));
          const ribbonPair = global.CircadianRenderer.buildHelixRibbonBetween(
            start,
            end,
            refSelected,
            calculateDateHeight,
            segments,
            straightenBlendLines
          );
          if (ribbonPair && ribbonPair.innerFlat && ribbonPair.outerFlat && ribbonPair.innerFlat.length >= 6) {
            const durationDaysSmall = Math.max(durationH / 24, 1 / 24);
            const plotType = lineStyle.plotType ?? layerConfig.plotType ?? firstStyle.plotType ?? 'polygon3d';
            const dailyMulLines = getDailyCircadianEventOpacityMul(start, end);
            const opacity = Math.min(1,
              ((lineStyle.opacity != null ? lineStyle.opacity : layerConfig.opacity) ?? 0.78) *
                getDurationOpacityScale(durationDaysSmall) * dailyMulLines);
            const roBoost = getDurationRibbonRenderOrderBoost(durationDaysSmall);
            const roFill = -4 + roBoost;
            const roLine = -2 + roBoost;
            const fillOpacity = Math.min(0.98,
              opacity * getDurationFillOpacityFactor(durationDaysSmall) * getShortTermEventFillOpacityMul());
            const layerColorHex = parseColor(layerConfig.color || '#00b4d8');
            let eventColorHex = parseColor(lineHasExplicitColor ? line.color : lineGradient);
            eventColorHex = applyTemporalVividnessToHex(eventColorHex, anchorMs, start, end);
            const fillColorFromStyle = lineStyle.fillColor ?? layerConfig.fillColor ?? firstStyle.fillColor ?? null;
            let fillHex = fillColorFromStyle ? parseColor(fillColorFromStyle) : (lineHasExplicitColor ? parseColor(line.color) : eventColorHex);
            fillHex = applyTemporalVividnessToHex(fillHex, anchorMs, start, end);
            const borderStyle = lineStyle.borderStyle ?? layerConfig.borderStyle ?? firstStyle.borderStyle ?? 'event';
            let outlineColorHexEvt = resolveRibbonOutlineColor(borderStyle, outlineLayerCfg, eventColorHex, layerColorHex, line);
            if (outlineColorHexEvt != null) outlineColorHexEvt = applyTemporalVividnessToHex(outlineColorHexEvt, anchorMs, start, end);
            let outlineOpEvt = getRibbonOutlineOpacity(opacity, borderStyle, outlineLayerCfg);
            outlineOpEvt *= 0.74;
            const innerFlat = ribbonPair.innerFlat;
            const outerFlat = ribbonPair.outerFlat;
            const circTubeMulLines = getShortCircadianRibbonTubeScale();

            function evtShortLineFromFlat(flat, hex, op, lw) {
              const g = new global.THREE.BufferGeometry();
              g.setAttribute('position', new global.THREE.Float32BufferAttribute(flat, 3));
              const m = new global.THREE.LineBasicMaterial({
                color: hex,
                transparent: true,
                opacity: borderStyle === 'none' ? 0 : op,
                linewidth: lw != null ? lw : 1
              });
              const lo = new global.THREE.Line(g, m);
              lo.renderOrder = roLine;
              return lo;
            }

            const lineUserData = {
              layerId: layerConfig.id,
              type: 'EventLine',
              start,
              end,
              label: line.label || null,
              index: i
            };
            if (shouldAttachShortCircadianToWorldGroup()) lineUserData.circadianWorldSpaceLayer = true;
            const lineRoot = new global.THREE.Group();
            lineRoot.userData = { ...lineUserData };

            if (plotType === 'lines') {
              lineRoot.add(evtShortLineFromFlat(innerFlat, eventColorHex, opacity, 1));
              lineRoot.add(evtShortLineFromFlat(outerFlat, eventColorHex, opacity, 1));
              addBandEndConnectors(lineRoot, innerFlat, outerFlat, eventColorHex, opacity, roLine,
                getRibbonOutlineTubeRadius(earthDist, outlineLayerCfg) * circTubeMulLines);
            } else if (plotType === 'polygon3d' || plotType === 'polygon2d') {
              const ribbonGeo = createRibbonBufferFromFlatArrays(innerFlat, outerFlat);
              if (ribbonGeo) {
                const fillMesh = createRibbonFillMesh(ribbonGeo, fillHex, fillOpacity, plotType, roFill, durationDaysSmall);
                lineRoot.add(fillMesh);
                if (borderStyle !== 'none' && outlineColorHexEvt != null) {
                  const tubeR = getRibbonOutlineTubeRadius(earthDist, outlineLayerCfg) * circTubeMulLines;
                  const oIn = createTubeOutlineAlongFlat(innerFlat, outlineColorHexEvt, outlineOpEvt, roLine, earthDist, outlineLayerCfg, circTubeMulLines);
                  const oOut = createTubeOutlineAlongFlat(outerFlat, outlineColorHexEvt, outlineOpEvt, roLine, earthDist, outlineLayerCfg, circTubeMulLines);
                  if (oIn) lineRoot.add(oIn);
                  if (oOut) lineRoot.add(oOut);
                  addBandEndConnectors(lineRoot, innerFlat, outerFlat, outlineColorHexEvt, outlineOpEvt, roLine, tubeR);
                }
              }
            } else {
              // Unknown plotType: prefer visible arc lines over dot-only fallback.
              const tConnL = getRibbonOutlineTubeRadius(earthDist, outlineLayerCfg) * circTubeMulLines;
              lineRoot.add(evtShortLineFromFlat(innerFlat, eventColorHex, opacity, 1));
              lineRoot.add(evtShortLineFromFlat(outerFlat, eventColorHex, opacity, 1));
              addBandEndConnectors(lineRoot, innerFlat, outerFlat, eventColorHex, opacity, roLine, tConnL);
            }

            if (areEventTextLabelsVisibleAtCurrentZoom(start, end) || areEventNameLabelsVisibleAtCurrentZoom(start, end)) {
              const pseudoLineEvent = {
                summary: (line.label && String(line.label).trim()) || null,
                title: (line.label && String(line.label).trim()) || null
              };
              const bdLine = getEventBandRadii(earthDist, durationDaysSmall);
              addEventWorldlineLabelSprites(
                lineRoot,
                pseudoLineEvent,
                start,
                end,
                startHeight,
                endHeight,
                bdLine.rInner,
                bdLine.rOuter,
                colorHex,
                refSelected,
                0,
                innerFlat,
                outerFlat,
                titleAlongByLineIdx.get(i) ?? 0.5
              );
            }

            if (lineRoot.children.length > 0) {
              addToFlattenOrWorld(lineRoot);
              objects.push(lineRoot);
              continue;
            }
          }
        }

        let midPos = null;
        if (shouldUseCircadianNearEarthShortPlacement()) {
          midPos = getShortEventCircadianNearEarthPosition(start, end, refSelected);
        }
        if (!midPos) {
          midPos = getPosShort(midHeight, rShort);
        }
        const markerSize = Math.max(0.2, Math.min(0.48, 0.2 + 0.28 * Math.min(1, durationH / 24)));
        const shortRoot = new global.THREE.Group();
        shortRoot.userData = {
          layerId: layerConfig.id,
          type: 'EventLine',
          start,
          end,
          label: line.label || null,
          index: i,
          shortEvent: true
        };
        if (shouldAttachShortCircadianToWorldGroup()) shortRoot.userData.circadianWorldSpaceLayer = true;

        const marker = createEventLinePointMarker(midPos.x, midPos.y, midPos.z, colorHex, markerSize, {
          layerId: layerConfig.id,
          type: 'EventLine',
          start,
          end,
          label: line.label || null,
          index: i,
          shortEvent: true
        }, start, end);
        shortRoot.add(marker);

        if (areEventTextLabelsVisibleAtCurrentZoom(start, end) || areEventNameLabelsVisibleAtCurrentZoom(start, end)) {
          const pseudoLineEvent = {
            summary: (line.label && String(line.label).trim()) || null,
            title: (line.label && String(line.label).trim()) || null
          };
          const bdShortLine = getEventBandRadii(earthDist, Math.max(durationH / 24, 1e-3));
          addEventWorldlineLabelSprites(
            shortRoot,
            pseudoLineEvent,
            start,
            end,
            startHeight,
            endHeight,
            bdShortLine.rInner,
            bdShortLine.rOuter,
            colorHex,
            refSelected,
            0,
            undefined,
            undefined,
            titleAlongByLineIdx.get(i) ?? 0.5
          );
        }

        addCircadianConnectorIfApplicable(shortRoot, midPos.x, midPos.y, midPos.z, midDate, colorHex);
        addToFlattenOrWorld(shortRoot);
        objects.push(shortRoot);
        continue;
      }

      if (shouldHideCircadianEventOutsideSelectedDayAtClockZooms(start, end)) {
        continue;
      }

      // Multi-day: inner/outer helices, end connectors, optional ribbon fill
      let { rInner, rOuter } = getEventBandRadii(earthDist, durationDays);
      if (rOuter <= rInner) rOuter = rInner + earthDist * 0.04;
      const ribbonScaled = applyLayerRibbonWidthScale(rInner, rOuter, earthDist, outlineLayerCfg);
      rInner = ribbonScaled.rInner;
      rOuter = ribbonScaled.rOuter;
      if (shouldApplyConcentricLongEventRibbonLayout() && !eventBandUsesWeekCorridor(durationDays)) {
        const rank01 = lineDurationRanks.has(i) ? lineDurationRanks.get(i) : null;
        const conc = applyConcentricEventRibbonRadii(earthDist, rInner, rOuter, rank01);
        rInner = conc.rInner;
        rOuter = conc.rOuter;
      }

      const plotType = lineStyle.plotType ?? layerConfig.plotType ?? firstStyle.plotType ?? 'polygon3d';
      const fillColorFromStyle = lineStyle.fillColor ?? layerConfig.fillColor ?? firstStyle.fillColor ?? null;
      const borderStyle = lineStyle.borderStyle ?? layerConfig.borderStyle ?? firstStyle.borderStyle ?? 'event';

      const layerColorHex = parseColor(layerConfig.color || '#00b4d8');
      let eventColorHex = parseColor(lineHasExplicitColor ? line.color : lineGradient);
      eventColorHex = applyLongTermContextColorToHex(eventColorHex, anchorMs, start, end, durationDays);
      let fillHex = fillColorFromStyle ? parseColor(fillColorFromStyle) : (lineHasExplicitColor ? parseColor(line.color) : eventColorHex);
      fillHex = applyLongTermContextColorToHex(fillHex, anchorMs, start, end, durationDays);
      const opacity = Math.min(1,
        ((lineStyle.opacity != null ? lineStyle.opacity : layerConfig.opacity) ?? 0.7) * getDurationOpacityScale(durationDays));
      const roBoost = getDurationRibbonRenderOrderBoost(durationDays);
      const roFill = -4 + roBoost;
      const roLine = -2 + roBoost;
      const fillOpacity = Math.min(0.98, opacity * getDurationFillOpacityFactor(durationDays));
      let outlineColorHexEvt = resolveRibbonOutlineColor(borderStyle, outlineLayerCfg, eventColorHex, layerColorHex, line);
      if (outlineColorHexEvt != null) outlineColorHexEvt = applyLongTermContextColorToHex(outlineColorHexEvt, anchorMs, start, end, durationDays);
      const outlineOpEvt = getRibbonOutlineOpacity(opacity, borderStyle, outlineLayerCfg);
      const fillFade = getLongTermContextFillFadeScales(anchorMs, start, end, durationDays);

      const { innerFlat, outerFlat } = buildHelixPair(startHeight, endHeight, rInner, rOuter, refWorldline, 32);
      const staggerLogical = getEventBandVerticalStagger(durationDays);
      const hasRibbon = innerFlat.length >= 6 && innerFlat.length === outerFlat.length;

      const lineUserData = {
        layerId: layerConfig.id,
        type: 'EventLine',
        start,
        end,
        label: line.label || null,
        index: i
      };

      const lineRoot = new global.THREE.Group();
      lineRoot.userData = { ...lineUserData };

      function evtLineFromFlat(flat, hex, op, lineWidth) {
        const lw = lineWidth != null ? lineWidth : 1;
        const g = new global.THREE.BufferGeometry();
        g.setAttribute('position', new global.THREE.Float32BufferAttribute(flat, 3));
        const m = new global.THREE.LineBasicMaterial({
          color: hex,
          transparent: true,
          opacity: borderStyle === 'none' ? 0 : op,
          linewidth: lw
        });
        const lo = new global.THREE.Line(g, m);
        lo.renderOrder = roLine;
        lo.userData = { ...lineUserData };
        return lo;
      }

      let bandAdded = false;
      if (hasRibbon && plotType === 'lines') {
        const bandGroup = new global.THREE.Group();
        bandGroup.userData = { ...lineUserData };
        bandGroup.add(evtLineFromFlat(innerFlat, eventColorHex, opacity));
        bandGroup.add(evtLineFromFlat(outerFlat, eventColorHex, opacity));
        addBandEndConnectors(bandGroup, innerFlat, outerFlat, eventColorHex, opacity, roLine);
        lineRoot.add(bandGroup);
        bandAdded = true;
      } else if (hasRibbon && (plotType === 'polygon3d' || plotType === 'polygon2d')) {
        const ribbonGeo = createRibbonBufferFromFlatArrays(innerFlat, outerFlat);
        if (ribbonGeo) {
          const bandGroup = new global.THREE.Group();
          bandGroup.userData = { ...lineUserData };
          const fillMesh = createRibbonFillMesh(ribbonGeo, fillHex, fillOpacity, plotType, roFill, durationDays, fillFade);
          fillMesh.userData = { ...lineUserData, longTermFill: true };
          bandGroup.add(fillMesh);
          if (borderStyle !== 'none' && outlineColorHexEvt != null) {
            const tubeR = getRibbonOutlineTubeRadius(earthDist, outlineLayerCfg);
            const oIn = createTubeOutlineAlongFlat(innerFlat, outlineColorHexEvt, outlineOpEvt, roLine, earthDist, outlineLayerCfg);
            const oOut = createTubeOutlineAlongFlat(outerFlat, outlineColorHexEvt, outlineOpEvt, roLine, earthDist, outlineLayerCfg);
            if (oIn) bandGroup.add(oIn);
            if (oOut) bandGroup.add(oOut);
            addBandEndConnectors(bandGroup, innerFlat, outerFlat, outlineColorHexEvt, outlineOpEvt, roLine, tubeR);
          }
          lineRoot.add(bandGroup);
          bandAdded = true;
        }
      }

      if (!bandAdded) {
        const rMid = (rInner + rOuter) * 0.5;
        let points;
        if (typeof SceneGeometry !== 'undefined' && SceneGeometry.createEarthHelicalCurve) {
          points = SceneGeometry.createEarthHelicalCurve(startHeight, endHeight, rMid, refWorldline, 32);
        } else {
          const angle0 = getAngle(startHeight);
          const angle1 = getAngle(endHeight);
          const p0 = typeof SceneGeometry !== 'undefined' && SceneGeometry.getPosition3D
            ? SceneGeometry.getPosition3D(startHeight, angle0, rMid)
            : { x: Math.cos(angle0) * rMid, y: startHeight, z: Math.sin(angle0) * rMid };
          const p1 = typeof SceneGeometry !== 'undefined' && SceneGeometry.getPosition3D
            ? SceneGeometry.getPosition3D(endHeight, angle1, rMid)
            : { x: Math.cos(angle1) * rMid, y: endHeight, z: Math.sin(angle1) * rMid };
          points = [p0.x, p0.y, p0.z, p1.x, p1.y, p1.z];
        }
        let outlineColorFb = resolveRibbonOutlineColor(borderStyle, outlineLayerCfg, eventColorHex, layerColorHex, line);
        if (outlineColorFb != null) outlineColorFb = applyLongTermContextColorToHex(outlineColorFb, anchorMs, start, end, durationDays);
        const outlineOpFb = getRibbonOutlineOpacity(opacity, borderStyle, outlineLayerCfg);
        const useOutFb = borderStyle !== 'none' && outlineColorFb != null;
        const strokeHexFb = useOutFb ? outlineColorFb : eventColorHex;
        const strokeOpFb = borderStyle === 'none' ? 0 : outlineOpFb;
        let strokeObjFb = null;
        if (useOutFb && strokeOpFb > 0) {
          strokeObjFb = createTubeOutlineAlongFlat(points, strokeHexFb, strokeOpFb, roLine, earthDist, outlineLayerCfg);
        }
        if (!strokeObjFb) {
          const lineGeometry = new global.THREE.BufferGeometry();
          lineGeometry.setAttribute('position', new global.THREE.Float32BufferAttribute(points, 3));
          const lineMaterial = new global.THREE.LineBasicMaterial({
            color: strokeHexFb,
            transparent: true,
            opacity: borderStyle === 'none' ? 0 : strokeOpFb,
            linewidth: 1
          });
          strokeObjFb = new global.THREE.Line(lineGeometry, lineMaterial);
          strokeObjFb.renderOrder = roLine;
        }
        strokeObjFb.userData = lineUserData;
        lineRoot.add(strokeObjFb);
      }

      if (areEventTextLabelsVisibleAtCurrentZoom(start, end) || areEventNameLabelsVisibleAtCurrentZoom(start, end)) {
        const pseudoLineEvent = {
          summary: (line.label && String(line.label).trim()) || null,
          title: (line.label && String(line.label).trim()) || null
        };
        addEventWorldlineLabelSprites(
          lineRoot,
          pseudoLineEvent,
          start,
          end,
          startHeight,
          endHeight,
          rInner,
          rOuter,
          colorHex,
          refWorldline,
          0,
          innerFlat,
          outerFlat,
          titleAlongByLineIdx.get(i) ?? 0.5
        );
      }

      attachEventStaggerRoot(lineRoot, staggerLogical);
      addToFlattenOrWorld(lineRoot);
      objects.push(lineRoot);
    }
    return objects;
  }

  /**
   * Create EventObjects for a set of events and add them to the scene group.
   * @param {Array} events - Array of VEvent or VEVENT-like objects
   * @param {Object} layerConfig - Layer config (id, color, opacity, ...)
   * @param {THREE.Group|null} sceneContentGroup - Group to add meshes to (timeline / flatten group)
   * @param {THREE.Scene|null} scene - Scene (unused for now, for API compatibility)
   * @param {THREE.Group|null} worldSpaceGroup - When set, objects with userData.circadianWorldSpaceLayer attach here
   * @returns {Array<THREE.Object3D>} Created objects (meshes/lines) with userData.type === 'EventObject'
   */
  function eventUidForDisk(ev, idx) {
    if (typeof VEvent !== 'undefined' && ev instanceof VEvent && ev.uid) return String(ev.uid);
    if (ev.uid != null && String(ev.uid).trim() !== '') return String(ev.uid);
    if (ev.id != null && String(ev.id).trim() !== '') return String(ev.id);
    return '__idx_' + idx;
  }

  function localDayKeyFromDate(d) {
    return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
  }

  function shouldAssignCircadianDiskLanes(events) {
    if (!events || !events.length) return false;
    const zl = getZoomLevelForEvents();
    if (!isCircadianHelixZoom(zl) || normalizedCircadianState() === 'off') return false;
    return true;
  }

  /**
   * Per calendar day: greedy interval lanes (reuse ring when events don’t overlap in time).
   * Maps each event uid → { rIn, rOut, rMid, lane } using concentric annuli inside the disk rim.
   */
  function buildCircadianDiskRibbonByUid(events) {
    const map = new Map();
    const MS_DAY = 86400000;
    const byDay = new Map();
    if (!events || !events.length) return map;

    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      const s = getEventStart(ev);
      const e = getEventEnd(ev);
      if (!s || !e || !(e > s)) continue;
      if (durationHoursBetween(s, e) >= 24) continue;
      const uid = eventUidForDisk(ev, i);
      let d = new Date(s.getFullYear(), s.getMonth(), s.getDate(), 0, 0, 0, 0);
      const endDay = new Date(e.getFullYear(), e.getMonth(), e.getDate(), 0, 0, 0, 0);
      while (d.getTime() <= endDay.getTime()) {
        const key = localDayKeyFromDate(d);
        if (!byDay.has(key)) byDay.set(key, []);
        byDay.get(key).push({ uid, s, e });
        d = new Date(d.getTime() + MS_DAY);
      }
    }

    const uidMaxLane = new Map();
    let globalMaxLanes = 1;

    byDay.forEach((list) => {
      list.sort((a, b) => a.s - b.s);
      const laneEnds = [];
      for (let j = 0; j < list.length; j++) {
        const item = list[j];
        let placed = -1;
        for (let L = 0; L < laneEnds.length; L++) {
          if (laneEnds[L] <= item.s.getTime()) {
            placed = L;
            laneEnds[L] = item.e.getTime();
            break;
          }
        }
        if (placed < 0) {
          placed = laneEnds.length;
          laneEnds.push(item.e.getTime());
        }
        const prev = uidMaxLane.get(item.uid);
        if (prev == null || placed > prev) uidMaxLane.set(item.uid, placed);
      }
      globalMaxLanes = Math.max(globalMaxLanes, laneEnds.length);
    });

    const CR = global.CircadianRenderer;
    const baseHand = CR && typeof CR.getHandLength === 'function' ? CR.getHandLength() : 12;
    const rim = baseHand * 1.08;
    const innerMin = baseHand * 0.24;
    const gapFrac = 0.4;
    const usable = Math.max(baseHand * 0.04, rim - innerMin);
    const laneW = usable / globalMaxLanes;

    for (let i = 0; i < events.length; i++) {
      const uid = eventUidForDisk(events[i], i);
      const L = uidMaxLane.has(uid) ? uidMaxLane.get(uid) : 0;
      const rIn = innerMin + L * laneW;
      const rOut = rIn + laneW * (1 - gapFrac);
      const rMid = (rIn + rOut) * 0.5;
      map.set(uid, { rIn, rOut, rMid, lane: L });
    }
    return map;
  }

  function getEventCategory(event) {
    const c = event.category ?? (Array.isArray(event.categories) && event.categories[0]);
    return (c != null && String(c).trim()) ? String(c).trim() : 'Default';
  }

  function createEventObjects(events, layerConfig, sceneContentGroup, scene, worldSpaceGroup) {
    const objects = [];
    if (!events || !layerConfig) return objects;
    const group = sceneContentGroup || null;
    const worldGroup = worldSpaceGroup || null;
    const byCategory = layerConfig.layerStylesByCategory || {};
    const eventTimeRange = getTimeRange(events);
    const zl = getZoomLevelForEvents();
    const durationRanks = buildDurationRankMapForEvents(events);
    const titleAlongByEventIdx = computeTitleAlongForLayerEvents(events);
    const diskRibbonByUid = shouldAssignCircadianDiskLanes(events)
      ? buildCircadianDiskRibbonByUid(events)
      : null;

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const category = getEventCategory(event);
      const styleOverride = byCategory[category];
      if (styleOverride && styleOverride.visible === false) continue;
      const rank01 = durationRanks.has(i) ? durationRanks.get(i) : null;
      const alongSpan = titleAlongByEventIdx.get(i) ?? 0.5;
      const diskRibbon = diskRibbonByUid ? diskRibbonByUid.get(eventUidForDisk(event, i)) : null;
      const diskAttach = diskRibbon ? { _diskRibbon: diskRibbon } : {};
      const effectiveConfig = styleOverride
        ? { ...layerConfig, ...styleOverride, layerStylesByCategory: undefined, _timeColorRange: eventTimeRange, _durationRank01: rank01, _midTitleAlongSpan: alongSpan, ...diskAttach }
        : { ...layerConfig, layerStylesByCategory: undefined, _timeColorRange: eventTimeRange, _durationRank01: rank01, _midTitleAlongSpan: alongSpan, ...diskAttach };
      const hasEnd = !!getEventEnd(event);
      const obj = hasEnd ? createEventWorldline(event, effectiveConfig) : createEventMarker(event, effectiveConfig);
      if (obj) {
        const parent = (worldGroup && obj.userData && obj.userData.circadianWorldSpaceLayer) ? worldGroup : group;
        if (parent) parent.add(obj);
        objects.push(obj);
      }
    }

    const seriesBaseConfig = { ...layerConfig, layerStylesByCategory: undefined, _timeColorRange: eventTimeRange };
    const seriesRoots = createTimeSeriesDecorationGroups(events, seriesBaseConfig);
    for (let si = 0; si < seriesRoots.length; si++) {
      const sg = seriesRoots[si];
      if (group) group.add(sg);
      objects.push(sg);
    }

    return objects;
  }

  const EventRenderer = {
    createEventObjects,
    createEventLineObjects,
    createEventMarker,
    createEventWorldline,
    getEventStart,
    getEventEnd,
    /** Same inner/outer radii as multi-day event ribbons (used by list-horizon shell in main.js). */
    getEventBandRadii,
    /** Log-scaled radius vs span length (list-horizon hoop in main.js). */
    getRadiusForDuration,
    eventTextLabelsMinZoomForDurationDays,
    eventDurationEligibleForFullListAtZoom,
    areEventNameLabelsVisibleAtCurrentZoom,
    isEventLabelRadialContextSurpassesInner,
    getListContextRingOuterRadius
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = EventRenderer;
  } else {
    global.EventRenderer = EventRenderer;
  }
})(typeof window !== 'undefined' ? window : this);
