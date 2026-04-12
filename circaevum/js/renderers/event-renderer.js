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
    const circ = typeof global.getCircadianRhythmState === 'function' ? global.getCircadianRhythmState() : 'off';
    if (!circ || circ === 'off') return false;
    return isCircadianHelixZoom(getZoomLevelForEvents());
  }

  function getCircadianStraightenBlendForEvents() {
    if (typeof global.getCircadianStraightenBlend === 'function') {
      return Math.min(1, Math.max(0, global.getCircadianStraightenBlend()));
    }
    return 0;
  }

  /** When day scope is on at circadian zooms, hide sub-day geometry that does not overlap the selected calendar day. */
  function shouldHideCircadianShortEventForDayScope(start, end) {
    const zl = getZoomLevelForEvents();
    const circ = typeof global.getCircadianRhythmState === 'function' ? global.getCircadianRhythmState() : 'off';
    if (!isCircadianHelixZoom(zl) || circ === 'off') return false;
    if (typeof global.getCircadianShortEventScope === 'function' && global.getCircadianShortEventScope() === 'year') {
      return false;
    }
    const selFn = getSelectedDateTimeFn();
    if (!selFn || !start || isNaN(start.getTime())) return false;
    const sel = selFn();
    const dayStart = new Date(sel.getFullYear(), sel.getMonth(), sel.getDate(), 0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime());
    dayEnd.setDate(dayEnd.getDate() + 1);
    const evStart = start;
    const evEnd = end && end > start ? end : new Date(evStart.getTime() + 3600000);
    const overlap = evEnd > dayStart && evStart < dayEnd;
    return !overlap;
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

  /** Week+ views draw day numbers / names; place sub-day event dots in that band. */
  function shouldUseDayBandDotPlacement() {
    return getZoomLevelForEvents() >= 7;
  }

  function durationHoursBetween(start, end) {
    if (!start || !end || !(end > start)) return 0;
    return (end.getTime() - start.getTime()) / (3600 * 1000);
  }

  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  /** Span length in days (fractional). Zero if missing or non-positive span. */
  function durationDaysBetween(start, end) {
    if (!start || !end || !(end > start)) return 0;
    return (end.getTime() - start.getTime()) / MS_PER_DAY;
  }

  /**
   * Minimum zoom level (main.js 0–9) at which we draw event text sprites (titles and MM/DD ticks).
   * Longer spans appear at coarser zoom; short spans require Week / Day / Clock.
   */
  function eventTextLabelsMinZoomForDurationDays(durationDays) {
    if (durationDays < 1) return 8; // sub-day → Zoom 8+
    if (durationDays < 7) return 7; // super-day, sub-week → Zoom 7+
    if (durationDays < 31) return 5; // super-week, sub-month → Zoom 5+
    return 4; // ~1 month and longer (incl. several-month) → Zoom 4+
  }

  function areEventTextLabelsVisibleAtCurrentZoom(start, end) {
    const zl = getZoomLevelForEvents();
    const days = durationDaysBetween(start, end);
    return zl >= eventTextLabelsMinZoomForDurationDays(days);
  }

  function isSub24HourSpan(start, end) {
    if (!end || end <= start) return true;
    return durationHoursBetween(start, end) < 24;
  }

  function datesSameCalendarDay(a, b) {
    if (!a || !b) return false;
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function getSelectedDateTimeFn() {
    if (typeof global.getSelectedDateTime === 'function') return global.getSelectedDateTime;
    return null;
  }

  function isDateOnSelectedCalendarDay(d) {
    const fn = getSelectedDateTimeFn();
    if (!fn) return false;
    return datesSameCalendarDay(d, fn());
  }

  function getRadiusForDailyEventDot(earthDist, midDate, indexOffset) {
    if (shouldUseDayBandDotPlacement()) {
      return earthDist * DAY_EVENT_DOT_RADIUS_FRAC;
    }
    return getRadiusForTimeOfDay(midDate, earthDist, indexOffset);
  }

  /**
   * Line from sub-day event dot toward circadian hour-hand tip — only Day/Clock zoom, circadian on, selected day.
   */
  function addCircadianConnectorIfApplicable(parent, ax, ay, az, atDate, colorHex) {
    const zl = getZoomLevelForEvents();
    if (!isCircadianHelixZoom(zl) || !parent) return;
    const circ = typeof global.getCircadianRhythmState === 'function' ? global.getCircadianRhythmState() : 'off';
    if (!circ || circ === 'off') return;
    if (!isDateOnSelectedCalendarDay(atDate)) return;
    if (typeof global.CircadianRenderer === 'undefined' || !global.CircadianRenderer.getWrappedHandTipAtHeight) return;
    const currentHeight = typeof calculateCurrentDateHeight === 'function'
      ? calculateCurrentDateHeight()
      : 0;
    const h = typeof calculateDateHeight === 'function'
      ? calculateDateHeight(
        atDate.getFullYear(),
        atDate.getMonth(),
        atDate.getDate(),
        atDate.getHours() + atDate.getMinutes() / 60 + atDate.getSeconds() / 3600
      )
      : ay;
    const tip = global.CircadianRenderer.getWrappedHandTipAtHeight(h, currentHeight, getCircadianStraightenBlendForEvents());
    if (!tip) return;
    const geo = new global.THREE.BufferGeometry();
    geo.setAttribute('position', new global.THREE.Float32BufferAttribute([
      ax, ay, az,
      tip.x, tip.y, tip.z
    ], 3));
    const mat = new global.THREE.LineBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.5
    });
    const line = new global.THREE.Line(geo, mat);
    line.renderOrder = 3;
    line.userData = { type: 'EventCircadianConnector' };
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

  /**
   * Inner/outer radii for duration-event band (aligned with TimeMarkers RADII_CONFIG week/month/day rings).
   * Inner pulls toward month.inner for long spans; outer clears day number / day name label bands by span length.
   */
  function getEventBandRadii(earthDist, durationDays) {
    const W = earthDist;
    const rMonthInner = W * 0.25;
    const rWeekInner = W * 0.5;
    // Match TimeMarkers RADII_CONFIG.week.label — inner helix must not sit sun-ward of this (under the text)
    const rWeekLabel = W * (9 / 16);
    const rDayOuter = W * 0.75;
    const d = Math.max(durationDays, 1e-4);
    let rInner;
    let rOuter;
    if (d > 7) {
      const t = Math.max(0, Math.min(1, Math.log(1 + d) / Math.log(366)));
      rInner = rWeekInner + (rMonthInner - rWeekInner) * t;
      rOuter = rDayOuter + W * 0.018;
    } else {
      // Under one week: inner helix stays sun-ward of TimeMarkers week.outer (5/8 W), and at/ beyond week.label
      // so fill does not sit under week text. Longer sub-week spans move slightly toward Earth but never reach week.outer.
      const margin = W * 0.003;
      const innerFloor = rWeekLabel + margin;
      const rWeekOuter = W * (5 / 8);
      const insideWeekOuter = W * 0.005; // strictly smaller radius than week.outer
      const rInnerCeiling = rWeekOuter - insideWeekOuter;
      const rAtShort = rWeekOuter - W * 0.012; // ~2-day: deeper inside week outer ring
      const rAtLong = rWeekOuter - insideWeekOuter; // ~7-day: just inside week.outer
      const dInterp = Math.min(Math.max(d, 2), 7);
      const tBand = (dInterp - 2) / 5;
      rInner = rAtShort + (rAtLong - rAtShort) * tBand;
      rInner = Math.max(rInner, innerFloor);
      rInner = Math.min(rInner, rInnerCeiling);
      // Outer edge: midway between TimeMarkers day.label and day.dayName.
      rOuter = W * DAY_EVENT_DOT_RADIUS_FRAC;
      const minBand = W * 0.022;
      if (rInner > rOuter - minBand) rInner = rOuter - minBand;
      if (rInner > rInnerCeiling) rInner = rInnerCeiling;
    }
    return { rInner, rOuter };
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
    geo.computeVertexNormals();
    return geo;
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
    context.fillStyle = `rgba(${r}, ${g}, ${b}, 0.95)`;
    context.font = font;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, width / 2, height / 2);

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
   * Format date as MM/DD for start/end labels
   */
  function formatMMDD(date) {
    const m = date.getMonth() + 1;
    const d = date.getDate();
    return (m < 10 ? '0' : '') + m + '/' + (d < 10 ? '0' : '') + d;
  }

  /**
   * Create a single point marker (sphere) for short/same-day event lines.
   * @param {number} x, y, z - world position
   * @param {number} colorHex
   * @param {number} size - sphere radius (proportional to event duration)
   * @param {Object} userData - optional userData for the mesh
   * @returns {THREE.Mesh}
   */
  function createEventLinePointMarker(x, y, z, colorHex, size, userData) {
    const geometry = new global.THREE.SphereGeometry(size, 12, 12);
    const material = new global.THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.9
    });
    const mesh = new global.THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.userData = userData || { type: 'EventLineMarker' };
    return mesh;
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

  /**
   * Human-readable title for label sprites (ingested events / VEVENT).
   */
  function getEventSummaryText(event) {
    if (typeof VEvent !== 'undefined' && event instanceof VEvent) {
      const s = event.summary;
      return s && String(s).trim() ? String(s).trim() : null;
    }
    const s = event.summary || event.title;
    return s && String(s).trim() ? String(s).trim() : null;
  }

  /**
   * Text sprites for duration worldlines (matches createEventLineObjects labeling).
   */
  function addEventWorldlineLabelSprites(parent, event, start, end, startHeight, endHeight, r, eventHex, currentHeight, staggerY) {
    if (!parent || !start || !end || end <= start) return;
    if (!areEventTextLabelsVisibleAtCurrentZoom(start, end)) return;
    const sy = staggerY != null && !isNaN(staggerY) ? staggerY : 0;
    const sameDay = start.getFullYear() === end.getFullYear() &&
      start.getMonth() === end.getMonth() && start.getDate() === end.getDate();
    const isShortEvent = durationHoursBetween(start, end) < 24;

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

    const labelRadius = r + EVENT_LINE_LABEL_RADIUS_OFFSET;
    const midHeight = (startHeight + endHeight) / 2;
    const nameStr = getEventSummaryText(event);
    const dayNumberScale = 1.5;
    const startEndScale = dayNumberScale * 2;
    const nameScale = dayNumberScale * 3;

    if (isShortEvent) {
      const midLabel = nameStr || (formatMMDD(start) + (sameDay ? '' : ' – ' + formatMMDD(end)));
      const midPos = getPos(midHeight, labelRadius);
      const midSprite = createEventLineLabelSprite(midLabel, eventHex, midPos.x, midPos.y + sy, midPos.z, nameScale, true);
      Object.assign(midSprite.userData, { type: 'EventObjectLabel', kind: 'mid' });
      parent.add(midSprite);
      return;
    }

    const startPos = getPos(startHeight, labelRadius);
    const endPos = getPos(endHeight, labelRadius);
    const midPos = getPos(midHeight, labelRadius);

    const startSprite = createEventLineLabelSprite(formatMMDD(start), eventHex, startPos.x, startPos.y + sy, startPos.z, startEndScale, false);
    Object.assign(startSprite.userData, { type: 'EventObjectLabel', kind: 'start' });
    parent.add(startSprite);

    const endSprite = createEventLineLabelSprite(formatMMDD(end), eventHex, endPos.x, endPos.y + sy, endPos.z, startEndScale, false);
    Object.assign(endSprite.userData, { type: 'EventObjectLabel', kind: 'end' });
    parent.add(endSprite);

    const midLabel = nameStr || (formatMMDD(start) + ' – ' + formatMMDD(end));
    const midSprite = createEventLineLabelSprite(midLabel, eventHex, midPos.x, midPos.y + sy, midPos.z, nameScale, true);
    Object.assign(midSprite.userData, { type: 'EventObjectLabel', kind: 'mid' });
    parent.add(midSprite);
  }

  /**
   * Wrap a worldline mesh/line in a group if needed, attach label sprites, preserve picking userData on the primary.
   */
  function wrapWorldlineWithLabels(primary, userData, event, start, end, startHeight, endHeight, r, eventHex, currentHeight, staggerY) {
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
    addEventWorldlineLabelSprites(parent, event, start, end, startHeight, endHeight, r, eventHex, currentHeight, staggerY);
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
   */
  function createTubeOutlineAlongFlat(flat, colorHex, opacity, renderOrder, earthDist, layerConfig) {
    const THREE = global.THREE;
    const nPts = flat.length / 3;
    if (nPts < 2) return null;
    const r = getRibbonOutlineTubeRadius(earthDist, layerConfig);
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

  /**
   * At Zoom 5+ (month/week/day/clock), ease saturation down for events outside the zoom’s time window.
   * Stronger at 7–9; smooth band just outside the window.
   */
  function getPeripheralVividness01(spanStart, spanEnd) {
    const zl = getZoomLevelForEvents();
    if (zl < 5) return 1;
    const selFn = getSelectedDateTimeFn();
    if (!selFn) return 1;
    if (!spanStart || isNaN(spanStart.getTime())) return 1;
    const centerMs = selFn().getTime();
    const halfMs = getFocusHalfSpanMsForZoom(zl);
    const sep = getPeripheralSeparationMs(spanStart, spanEnd, centerMs, halfMs);
    if (sep <= 0) return 1;
    const fadeMs = Math.max(halfMs * 0.24, MS_PER_DAY * 0.85);
    const u = temporalFadeSmoothstep(0, fadeMs, sep);
    let floor;
    if (zl >= 9) floor = 0.16;
    else if (zl >= 8) floor = 0.22;
    else if (zl >= 7) floor = 0.3;
    else floor = 0.45;
    return floor + (1 - floor) * (1 - u);
  }

  /**
   * @param {Date|null} spanStart - event (or line) interval start; drives peripheral window test
   * @param {Date|null} spanEnd - interval end; omit or same as start for instant events
   */
  function applyTemporalVividnessToHex(hex, anchorMs, spanStart, spanEnd) {
    const vt = getTemporalVividness01(anchorMs);
    const vp = spanStart && !isNaN(spanStart.getTime())
      ? getPeripheralVividness01(spanStart, spanEnd)
      : 1;
    const v = Math.min(vt, vp);
    return lerpHexColor(TEMPORAL_NEUTRAL_HEX, hex, v);
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
    const currentHeight = typeof calculateCurrentDateHeight === 'function'
      ? calculateCurrentDateHeight()
      : 0;
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

    const r = shouldUseDayBandDotPlacement()
      ? earthDist * DAY_EVENT_DOT_RADIUS_FRAC
      : (radius != null ? radius : getRadiusForTimeOfDay(start, earthDist, 0));

    const height = typeof calculateDateHeight === 'function'
      ? calculateDateHeight(start.getFullYear(), start.getMonth(), start.getDate(), start.getHours())
      : 0;
    const currentHeight = typeof calculateCurrentDateHeight === 'function'
      ? calculateCurrentDateHeight()
      : height;
    const angle = getOrbitAngleForShortEventPlacement(height, currentHeight);
    const pos = typeof SceneGeometry !== 'undefined' && SceneGeometry.getPosition3D
      ? SceneGeometry.getPosition3D(height, angle, r)
      : { x: Math.cos(angle) * r, y: height, z: Math.sin(angle) * r };

    const explicitColor = hasExplicitEventColor(event);
    const fallbackGradient = getTimeGradientHex(getNormalizedTimeForDate(start, layerConfig._timeColorRange));
    const colorBase = parseColor(explicitColor ? (event.color ?? event.colorId) : fallbackGradient);
    let spanEnd = getEventEnd(event);
    if (!spanEnd || spanEnd <= start) spanEnd = start;
    const color = applyTemporalVividnessToHex(colorBase, start.getTime(), start, spanEnd);
    const sphereR = shouldUseDayBandDotPlacement() ? 0.28 : 0.55;
    const geometry = new global.THREE.SphereGeometry(sphereR, 12, 12);
    const material = new global.THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.4
    });
    const mesh = new global.THREE.Mesh(geometry, material);
    mesh.position.set(pos.x, pos.y, pos.z);
    const userData = {
      vevent: event,
      layerId: layerConfig.id,
      type: 'EventObject',
      eventUid: (typeof VEvent !== 'undefined' && event instanceof VEvent ? event.uid : event.uid || event.id) || null
    };
    if (shouldAttachShortCircadianToWorldGroup()) userData.circadianWorldSpaceLayer = true;
    mesh.userData = userData;

    const showConn = isCircadianHelixZoom(getZoomLevelForEvents()) &&
      typeof global.getCircadianRhythmState === 'function' &&
      global.getCircadianRhythmState() !== 'off' &&
      isDateOnSelectedCalendarDay(start);
    if (showConn) {
      const grp = new global.THREE.Group();
      grp.userData = userData;
      grp.add(mesh);
      addCircadianConnectorIfApplicable(grp, pos.x, pos.y, pos.z, start, color);
      return grp;
    }
    return mesh;
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

    const currentHeight = typeof calculateCurrentDateHeight === 'function'
      ? calculateCurrentDateHeight()
      : 0;
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
      const circ = typeof global.getCircadianRhythmState === 'function' ? global.getCircadianRhythmState() : 'off';
      const straightenBlend = getCircadianStraightenBlendForEvents();
      const useHelixRibbon =
        isCircadianHelixZoom(zl) &&
        circ !== 'off' &&
        typeof global.CircadianRenderer !== 'undefined' &&
        typeof global.CircadianRenderer.buildHelixRibbonBetween === 'function' &&
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

      if (useHelixRibbon) {
        const segments = Math.max(8, Math.min(48, Math.ceil(durationH * 4)));
        const ribbonPair = global.CircadianRenderer.buildHelixRibbonBetween(
          start,
          end,
          currentHeight,
          calculateDateHeight,
          segments,
          straightenBlend
        );
        if (ribbonPair && ribbonPair.innerFlat && ribbonPair.outerFlat && ribbonPair.innerFlat.length >= 6) {
          const durationDays = Math.max(durationH / 24, 1 / 24);
          const plotType = layerConfig.plotType ?? 'polygon3d';
          const opacity = Math.min(1,
            (layerConfig.opacity != null ? layerConfig.opacity : 0.78) * getDurationOpacityScale(durationDays));
          const roBoost = getDurationRibbonRenderOrderBoost(durationDays);
          const roFill = -4 + roBoost;
          const roLine = -2 + roBoost;
          const fillOpacity = Math.min(0.98, opacity * getDurationFillOpacityFactor(durationDays));
          let fillHex = parseColor(layerConfig.fillColor || (explicitEventColor ? eventColorRaw : null) || fallbackGradient);
          fillHex = applyTemporalVividnessToHex(fillHex, anchorMsShort, start, end);
          const borderStyle = layerConfig.borderStyle || 'event';
          let outlineColorHex = resolveRibbonOutlineColor(borderStyle, layerConfig, eventHex, layerHex, event);
          if (outlineColorHex != null) outlineColorHex = applyTemporalVividnessToHex(outlineColorHex, anchorMsShort, start, end);
          const outlineOp = getRibbonOutlineOpacity(opacity, borderStyle, layerConfig);

          const innerFlat = ribbonPair.innerFlat;
          const outerFlat = ribbonPair.outerFlat;
          const rLabelBand = earthDist * DAY_EVENT_DOT_RADIUS_FRAC;

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
              const fillMesh = new global.THREE.Mesh(ribbonGeo, new global.THREE.MeshBasicMaterial({
                color: fillHex,
                transparent: true,
                opacity: fillOpacity,
                side: global.THREE.DoubleSide,
                depthWrite: false,
                polygonOffset: true,
                polygonOffsetFactor: 2,
                polygonOffsetUnits: 1
              }));
              if (plotType === 'polygon2d') fillMesh.scale.y = 0.02;
              fillMesh.renderOrder = roFill;
              group.add(fillMesh);
              if (borderStyle !== 'none' && outlineColorHex != null) {
                const tubeR = getRibbonOutlineTubeRadius(earthDist, layerConfig);
                const oIn = createTubeOutlineAlongFlat(innerFlat, outlineColorHex, outlineOp, roLine, earthDist, layerConfig);
                const oOut = createTubeOutlineAlongFlat(outerFlat, outlineColorHex, outlineOp, roLine, earthDist, layerConfig);
                if (oIn) group.add(oIn);
                if (oOut) group.add(oOut);
                addBandEndConnectors(group, innerFlat, outerFlat, outlineColorHex, outlineOp, roLine, tubeR);
              }
            }
          }

          const midDate = new Date((start.getTime() + end.getTime()) / 2);
          const midH =
            typeof calculateDateHeight === 'function'
              ? calculateDateHeight(
                midDate.getFullYear(),
                midDate.getMonth(),
                midDate.getDate(),
                midDate.getHours() +
                  midDate.getMinutes() / 60 +
                  midDate.getSeconds() / 3600 +
                  midDate.getMilliseconds() / 3600000
              )
              : (startHeight + endHeight) / 2;
          const tip =
            global.CircadianRenderer.getWrappedHandTipAtHeight &&
            global.CircadianRenderer.getWrappedHandTipAtHeight(midH, currentHeight, straightenBlend);
          const sameDay =
            start.getFullYear() === end.getFullYear() &&
            start.getMonth() === end.getMonth() &&
            start.getDate() === end.getDate();
          const nameStr = getEventSummaryText(event);
          const midLabelText = nameStr || formatMMDD(start) + (sameDay ? '' : ' – ' + formatMMDD(end));
          const nameScale = 4.5;
          if (areEventTextLabelsVisibleAtCurrentZoom(start, end)) {
            if (tip) {
              const midSprite = createEventLineLabelSprite(midLabelText, eventHex, tip.x, tip.y, tip.z, nameScale, true);
              Object.assign(midSprite.userData, { type: 'EventObjectLabel', kind: 'mid' });
              group.add(midSprite);
            } else {
              addEventWorldlineLabelSprites(group, event, start, end, startHeight, endHeight, rLabelBand, eventHex, currentHeight, 0);
            }
          }

          if (group.children.length > 0) return group;
        }
      }

      const midDate = new Date((start.getTime() + end.getTime()) / 2);
      const rDot = getRadiusForDailyEventDot(earthDist, midDate, 0);
      const getPos = function (h, rad) {
        const a = getOrbitAngleForShortEventPlacement(h, currentHeight);
        return { x: Math.cos(a) * rad, y: h, z: Math.sin(a) * rad };
      };
      const midHeight = (startHeight + endHeight) / 2;
      const pos = getPos(midHeight, rDot);
      const markerSize = Math.max(0.22, Math.min(0.5, 0.22 + 0.28 * Math.min(1, durationH / 24)));
      const marker = createEventLinePointMarker(pos.x, pos.y, pos.z, eventHex, markerSize, userData);
      const grp = new global.THREE.Group();
      grp.userData = userData;
      grp.add(marker);
      addEventWorldlineLabelSprites(grp, event, start, end, startHeight, endHeight, rDot, eventHex, currentHeight, 0);
      addCircadianConnectorIfApplicable(grp, pos.x, pos.y, pos.z, midDate, eventHex);
      if (shouldAttachShortCircadianToWorldGroup()) grp.userData.circadianWorldSpaceLayer = true;
      return grp;
    }

    const durationDays = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
    const band = radius != null && !isNaN(radius)
      ? { rInner: Math.max(earthDist * 0.2, radius * 0.92), rOuter: Math.min(earthDist * 0.8, radius * 1.08) }
      : getEventBandRadii(earthDist, durationDays);
    let { rInner, rOuter } = band;
    if (rOuter <= rInner) rOuter = rInner + earthDist * 0.04;
    const ribbonScaled = applyLayerRibbonWidthScale(rInner, rOuter, earthDist, layerConfig);
    rInner = ribbonScaled.rInner;
    rOuter = ribbonScaled.rOuter;

    const segments = 32;
    const { innerFlat, outerFlat } = buildHelixPair(startHeight, endHeight, rInner, rOuter, currentHeight, segments);
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
    eventHex = applyTemporalVividnessToHex(eventHex, anchorMsLong, start, end);
    const layerHex = parseColor(layerConfig.color || '#00b4d8');
    // Prefer explicit fillColor, then per-event color, then layer color.
    let fillHex = parseColor(layerConfig.fillColor || (explicitEventColor ? eventColorRaw : null) || fallbackGradient);
    fillHex = applyTemporalVividnessToHex(fillHex, anchorMsLong, start, end);
    const borderStyle = layerConfig.borderStyle || 'event';
    let outlineColorHex = resolveRibbonOutlineColor(borderStyle, layerConfig, eventHex, layerHex, event);
    if (outlineColorHex != null) outlineColorHex = applyTemporalVividnessToHex(outlineColorHex, anchorMsLong, start, end);
    const outlineOp = getRibbonOutlineOpacity(opacity, borderStyle, layerConfig);

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
        wrapWorldlineWithLabels(group, userData, event, start, end, startHeight, endHeight, rOuter, eventHex, currentHeight, 0),
        staggerLogical);
    }

    if ((plotType === 'polygon3d' || plotType === 'polygon2d') && hasRibbon) {
      const ribbonGeo = createRibbonBufferFromFlatArrays(innerFlat, outerFlat);
      if (ribbonGeo) {
        const group = new global.THREE.Group();
        group.userData = userData;
        const fillMesh = new global.THREE.Mesh(ribbonGeo, new global.THREE.MeshBasicMaterial({
          color: fillHex,
          transparent: true,
          opacity: fillOpacity,
          side: global.THREE.DoubleSide,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: 2,
          polygonOffsetUnits: 1
        }));
        if (plotType === 'polygon2d') fillMesh.scale.y = 0.02;
        fillMesh.renderOrder = roFill;
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
          wrapWorldlineWithLabels(group, userData, event, start, end, startHeight, endHeight, rOuter, eventHex, currentHeight, 0),
          staggerLogical);
      }
    }

    const rMid = (rInner + rOuter) * 0.5;
    let points;
    if (typeof SceneGeometry !== 'undefined' && SceneGeometry.createEarthHelicalCurve) {
      points = SceneGeometry.createEarthHelicalCurve(startHeight, endHeight, rMid, currentHeight, 32);
    } else {
      const angle0 = typeof SceneGeometry !== 'undefined' && SceneGeometry.getAngle
        ? SceneGeometry.getAngle(startHeight, currentHeight)
        : 0;
      const angle1 = typeof SceneGeometry !== 'undefined' && SceneGeometry.getAngle
        ? SceneGeometry.getAngle(endHeight, currentHeight)
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
    if (fallbackOutlineHex != null) fallbackOutlineHex = applyTemporalVividnessToHex(fallbackOutlineHex, anchorMsLong, start, end);
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
      wrapWorldlineWithLabels(strokeObj, userData, event, start, end, startHeight, endHeight, rOuter, eventHex, currentHeight, 0),
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

    function addToFlattenOrWorld(root) {
      if (!root) return;
      const p = (worldGroup && root.userData && root.userData.circadianWorldSpaceLayer) ? worldGroup : group;
      if (p) p.add(root);
    }

    const currentHeight = typeof calculateCurrentDateHeight === 'function'
      ? calculateCurrentDateHeight()
      : 0;

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
    const dayNumberScale = 1.5;
    const startEndScale = dayNumberScale * 2;
    const nameScale = dayNumberScale * 3;

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
        const circ = typeof global.getCircadianRhythmState === 'function' ? global.getCircadianRhythmState() : 'off';
        const straightenBlendLines = getCircadianStraightenBlendForEvents();
        const useHelixRibbon =
          isCircadianHelixZoom(zl) &&
          circ !== 'off' &&
          typeof global.CircadianRenderer !== 'undefined' &&
          typeof global.CircadianRenderer.buildHelixRibbonBetween === 'function' &&
          typeof calculateDateHeight === 'function';

        const getPosShort = function (h, rad) {
          const a = getOrbitAngleForShortEventPlacement(h, currentHeight);
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
            currentHeight,
            calculateDateHeight,
            segments,
            straightenBlendLines
          );
          if (ribbonPair && ribbonPair.innerFlat && ribbonPair.outerFlat && ribbonPair.innerFlat.length >= 6) {
            const durationDaysSmall = Math.max(durationH / 24, 1 / 24);
            const plotType = lineStyle.plotType ?? layerConfig.plotType ?? firstStyle.plotType ?? 'polygon3d';
            const opacity = Math.min(1,
              ((lineStyle.opacity != null ? lineStyle.opacity : layerConfig.opacity) ?? 0.78) *
                getDurationOpacityScale(durationDaysSmall));
            const roBoost = getDurationRibbonRenderOrderBoost(durationDaysSmall);
            const roFill = -4 + roBoost;
            const roLine = -2 + roBoost;
            const fillOpacity = Math.min(0.98, opacity * getDurationFillOpacityFactor(durationDaysSmall));
            const layerColorHex = parseColor(layerConfig.color || '#00b4d8');
            let eventColorHex = parseColor(lineHasExplicitColor ? line.color : lineGradient);
            eventColorHex = applyTemporalVividnessToHex(eventColorHex, anchorMs, start, end);
            const fillColorFromStyle = lineStyle.fillColor ?? layerConfig.fillColor ?? firstStyle.fillColor ?? null;
            let fillHex = fillColorFromStyle ? parseColor(fillColorFromStyle) : (lineHasExplicitColor ? parseColor(line.color) : eventColorHex);
            fillHex = applyTemporalVividnessToHex(fillHex, anchorMs, start, end);
            const borderStyle = lineStyle.borderStyle ?? layerConfig.borderStyle ?? firstStyle.borderStyle ?? 'event';
            let outlineColorHexEvt = resolveRibbonOutlineColor(borderStyle, outlineLayerCfg, eventColorHex, layerColorHex, line);
            if (outlineColorHexEvt != null) outlineColorHexEvt = applyTemporalVividnessToHex(outlineColorHexEvt, anchorMs, start, end);
            const outlineOpEvt = getRibbonOutlineOpacity(opacity, borderStyle, outlineLayerCfg);
            const innerFlat = ribbonPair.innerFlat;
            const outerFlat = ribbonPair.outerFlat;

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
              addBandEndConnectors(lineRoot, innerFlat, outerFlat, eventColorHex, opacity, roLine);
            } else if (plotType === 'polygon3d' || plotType === 'polygon2d') {
              const ribbonGeo = createRibbonBufferFromFlatArrays(innerFlat, outerFlat);
              if (ribbonGeo) {
                const fillMesh = new global.THREE.Mesh(ribbonGeo, new global.THREE.MeshBasicMaterial({
                  color: fillHex,
                  transparent: true,
                  opacity: fillOpacity,
                  side: global.THREE.DoubleSide,
                  depthWrite: false,
                  polygonOffset: true,
                  polygonOffsetFactor: 2,
                  polygonOffsetUnits: 1
                }));
                if (plotType === 'polygon2d') fillMesh.scale.y = 0.02;
                fillMesh.renderOrder = roFill;
                lineRoot.add(fillMesh);
                if (borderStyle !== 'none' && outlineColorHexEvt != null) {
                  const tubeR = getRibbonOutlineTubeRadius(earthDist, outlineLayerCfg);
                  const oIn = createTubeOutlineAlongFlat(innerFlat, outlineColorHexEvt, outlineOpEvt, roLine, earthDist, outlineLayerCfg);
                  const oOut = createTubeOutlineAlongFlat(outerFlat, outlineColorHexEvt, outlineOpEvt, roLine, earthDist, outlineLayerCfg);
                  if (oIn) lineRoot.add(oIn);
                  if (oOut) lineRoot.add(oOut);
                  addBandEndConnectors(lineRoot, innerFlat, outerFlat, outlineColorHexEvt, outlineOpEvt, roLine, tubeR);
                }
              }
            }

            const midH =
              typeof calculateDateHeight === 'function'
                ? calculateDateHeight(
                  midDate.getFullYear(),
                  midDate.getMonth(),
                  midDate.getDate(),
                  midDate.getHours() +
                    midDate.getMinutes() / 60 +
                    midDate.getSeconds() / 3600 +
                    midDate.getMilliseconds() / 3600000
                )
                : midHeight;
            const tip =
              global.CircadianRenderer.getWrappedHandTipAtHeight &&
              global.CircadianRenderer.getWrappedHandTipAtHeight(midH, currentHeight, straightenBlendLines);
            const midLabel =
              (line.label && String(line.label).trim())
                ? String(line.label).trim()
                : formatMMDD(start) + (sameDay ? '' : ' – ' + formatMMDD(end));
            if (areEventTextLabelsVisibleAtCurrentZoom(start, end)) {
              if (tip) {
                const midSprite = createEventLineLabelSprite(midLabel, colorHex, tip.x, tip.y, tip.z, nameScale, true);
                Object.assign(midSprite.userData, { type: 'EventLineLabel', kind: 'mid' });
                lineRoot.add(midSprite);
              } else {
                const labelRadius = rShort + EVENT_LINE_LABEL_RADIUS_OFFSET;
                const labelPos = getPosShort(midHeight, labelRadius);
                const midSprite = createEventLineLabelSprite(midLabel, colorHex, labelPos.x, labelPos.y, labelPos.z, nameScale, true);
                Object.assign(midSprite.userData, { type: 'EventLineLabel', kind: 'mid' });
                lineRoot.add(midSprite);
              }
            }

            if (lineRoot.children.length > 0) {
              addToFlattenOrWorld(lineRoot);
              objects.push(lineRoot);
              continue;
            }
          }
        }

        const labelRadius = rShort + EVENT_LINE_LABEL_RADIUS_OFFSET;
        const midPos = getPosShort(midHeight, rShort);
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
        });
        shortRoot.add(marker);

        if (areEventTextLabelsVisibleAtCurrentZoom(start, end)) {
          const midLabelFallback = (line.label && String(line.label).trim()) ? String(line.label).trim() : (formatMMDD(start) + (sameDay ? '' : ' – ' + formatMMDD(end)));
          const labelPos = getPosShort(midHeight, labelRadius);
          const midSprite = createEventLineLabelSprite(midLabelFallback, colorHex, labelPos.x, labelPos.y, labelPos.z, nameScale, true);
          Object.assign(midSprite.userData, { type: 'EventLineLabel', kind: 'mid' });
          shortRoot.add(midSprite);
        }

        addCircadianConnectorIfApplicable(shortRoot, midPos.x, midPos.y, midPos.z, midDate, colorHex);
        addToFlattenOrWorld(shortRoot);
        objects.push(shortRoot);
        continue;
      }

      // Multi-day: inner/outer helices, end connectors, optional ribbon fill
      let { rInner, rOuter } = getEventBandRadii(earthDist, durationDays);
      if (rOuter <= rInner) rOuter = rInner + earthDist * 0.04;
      const ribbonScaled = applyLayerRibbonWidthScale(rInner, rOuter, earthDist, outlineLayerCfg);
      rInner = ribbonScaled.rInner;
      rOuter = ribbonScaled.rOuter;
      const labelRadius = rOuter + EVENT_LINE_LABEL_RADIUS_OFFSET;

      const plotType = lineStyle.plotType ?? layerConfig.plotType ?? firstStyle.plotType ?? 'polygon3d';
      const fillColorFromStyle = lineStyle.fillColor ?? layerConfig.fillColor ?? firstStyle.fillColor ?? null;
      const borderStyle = lineStyle.borderStyle ?? layerConfig.borderStyle ?? firstStyle.borderStyle ?? 'event';

      const layerColorHex = parseColor(layerConfig.color || '#00b4d8');
      let eventColorHex = parseColor(lineHasExplicitColor ? line.color : lineGradient);
      eventColorHex = applyTemporalVividnessToHex(eventColorHex, anchorMs, start, end);
      let fillHex = fillColorFromStyle ? parseColor(fillColorFromStyle) : (lineHasExplicitColor ? parseColor(line.color) : eventColorHex);
      fillHex = applyTemporalVividnessToHex(fillHex, anchorMs, start, end);
      const opacity = Math.min(1,
        ((lineStyle.opacity != null ? lineStyle.opacity : layerConfig.opacity) ?? 0.7) * getDurationOpacityScale(durationDays));
      const roBoost = getDurationRibbonRenderOrderBoost(durationDays);
      const roFill = -4 + roBoost;
      const roLine = -2 + roBoost;
      const fillOpacity = Math.min(0.98, opacity * getDurationFillOpacityFactor(durationDays));
      let outlineColorHexEvt = resolveRibbonOutlineColor(borderStyle, outlineLayerCfg, eventColorHex, layerColorHex, line);
      if (outlineColorHexEvt != null) outlineColorHexEvt = applyTemporalVividnessToHex(outlineColorHexEvt, anchorMs, start, end);
      const outlineOpEvt = getRibbonOutlineOpacity(opacity, borderStyle, outlineLayerCfg);

      const { innerFlat, outerFlat } = buildHelixPair(startHeight, endHeight, rInner, rOuter, currentHeight, 32);
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
          const fillMesh = new global.THREE.Mesh(ribbonGeo, new global.THREE.MeshBasicMaterial({
            color: fillHex,
            transparent: true,
            opacity: fillOpacity,
            side: global.THREE.DoubleSide,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: 2,
            polygonOffsetUnits: 1
          }));
          if (plotType === 'polygon2d') fillMesh.scale.y = 0.02;
          fillMesh.renderOrder = roFill;
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
          points = SceneGeometry.createEarthHelicalCurve(startHeight, endHeight, rMid, currentHeight, 32);
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
        if (outlineColorFb != null) outlineColorFb = applyTemporalVividnessToHex(outlineColorFb, anchorMs, start, end);
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

      const startPos = getPos(startHeight, labelRadius);
      const endPos = getPos(endHeight, labelRadius);
      const midPos = getPos(midHeight, labelRadius);

      if (areEventTextLabelsVisibleAtCurrentZoom(start, end)) {
        const startSprite = createEventLineLabelSprite(formatMMDD(start), colorHex, startPos.x, startPos.y, startPos.z, startEndScale, false);
        Object.assign(startSprite.userData, { type: 'EventLineLabel', kind: 'start' });
        lineRoot.add(startSprite);

        const endSprite = createEventLineLabelSprite(formatMMDD(end), colorHex, endPos.x, endPos.y, endPos.z, startEndScale, false);
        Object.assign(endSprite.userData, { type: 'EventLineLabel', kind: 'end' });
        lineRoot.add(endSprite);

        const midLabel = (line.label && String(line.label).trim()) ? String(line.label).trim() : (formatMMDD(start) + ' – ' + formatMMDD(end));
        const midSprite = createEventLineLabelSprite(midLabel, colorHex, midPos.x, midPos.y, midPos.z, nameScale, true);
        Object.assign(midSprite.userData, { type: 'EventLineLabel', kind: 'mid' });
        lineRoot.add(midSprite);
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

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const category = getEventCategory(event);
      const styleOverride = byCategory[category];
      if (styleOverride && styleOverride.visible === false) continue;
      const effectiveConfig = styleOverride
        ? { ...layerConfig, ...styleOverride, layerStylesByCategory: undefined, _timeColorRange: eventTimeRange }
        : { ...layerConfig, layerStylesByCategory: undefined, _timeColorRange: eventTimeRange };
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
    getEventEnd
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = EventRenderer;
  } else {
    global.EventRenderer = EventRenderer;
  }
})(typeof window !== 'undefined' ? window : this);
