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

  function getZoomLevelForEvents() {
    if (typeof global.getCurrentZoomLevel === 'function') return global.getCurrentZoomLevel();
    return 5;
  }

  /** Week+ views draw day numbers / names; place sub-day event dots in that band. */
  function shouldUseDayBandDotPlacement() {
    return getZoomLevelForEvents() >= 7;
  }

  function durationHoursBetween(start, end) {
    if (!start || !end || !(end > start)) return 0;
    return (end.getTime() - start.getTime()) / (3600 * 1000);
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
    if (zl < 8 || zl > 9 || !parent) return;
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
    const tip = global.CircadianRenderer.getWrappedHandTipAtHeight(h, currentHeight);
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

  function addBandEndConnectors(group, innerFlat, outerFlat, colorHex, opacity, renderOrder) {
    const n = innerFlat.length / 3;
    if (n < 1) return;
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
        opacity: opacity
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

    const r = shouldUseDayBandDotPlacement()
      ? earthDist * DAY_EVENT_DOT_RADIUS_FRAC
      : (radius != null ? radius : getRadiusForTimeOfDay(start, earthDist, 0));

    const height = typeof calculateDateHeight === 'function'
      ? calculateDateHeight(start.getFullYear(), start.getMonth(), start.getDate(), start.getHours())
      : 0;
    const currentHeight = typeof calculateCurrentDateHeight === 'function'
      ? calculateCurrentDateHeight()
      : height;
    const angle = typeof SceneGeometry !== 'undefined' && SceneGeometry.getAngle
      ? SceneGeometry.getAngle(height, currentHeight)
      : 0;
    const pos = typeof SceneGeometry !== 'undefined' && SceneGeometry.getPosition3D
      ? SceneGeometry.getPosition3D(height, angle, r)
      : { x: Math.cos(angle) * r, y: height, z: Math.sin(angle) * r };

    const explicitColor = hasExplicitEventColor(event);
    const fallbackGradient = getTimeGradientHex(getNormalizedTimeForDate(start, layerConfig._timeColorRange));
    const color = parseColor(explicitColor ? (event.color ?? event.colorId) : fallbackGradient);
    const sphereR = shouldUseDayBandDotPlacement() ? 0.48 : 0.8;
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
    mesh.userData = userData;

    const showConn = getZoomLevelForEvents() >= 8 &&
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
   * Create a short worldline for a duration event. Supports layer style: plotType (lines | polygon2d | polygon3d),
   * lineThickness, fillColor, borderStyle (event | layer | none).
   * @param {Object|VEvent} event
   * @param {Object} layerConfig - id, color, opacity, plotType?, lineThickness?, fillColor?, borderStyle?
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
      const midDate = new Date((start.getTime() + end.getTime()) / 2);
      const rDot = getRadiusForDailyEventDot(earthDist, midDate, 0);
      const getAngle = typeof SceneGeometry !== 'undefined' && SceneGeometry.getAngle
        ? function (h) { return SceneGeometry.getAngle(h, currentHeight); }
        : function () { return 0; };
      const getPos = function (h, rad) {
        const a = getAngle(h);
        return { x: Math.cos(a) * rad, y: h, z: Math.sin(a) * rad };
      };
      const eventColorRaw = event.color ?? event.colorId ?? null;
      const explicitEventColor = hasExplicitEventColor(event);
      const fallbackGradient = getTimeGradientHex(getNormalizedTimeForDate(start, layerConfig._timeColorRange));
      const eventHex = parseColor(explicitEventColor ? eventColorRaw : fallbackGradient);
      const userData = {
        vevent: event,
        layerId: layerConfig.id,
        type: 'EventObject',
        eventUid: (typeof VEvent !== 'undefined' && event instanceof VEvent ? event.uid : event.uid || event.id) || null
      };
      const midHeight = (startHeight + endHeight) / 2;
      const pos = getPos(midHeight, rDot);
      const markerSize = Math.max(0.38, Math.min(0.95, 0.38 + 0.55 * Math.min(1, durationH / 24)));
      const marker = createEventLinePointMarker(pos.x, pos.y, pos.z, eventHex, markerSize, userData);
      const grp = new global.THREE.Group();
      grp.userData = userData;
      grp.add(marker);
      addEventWorldlineLabelSprites(grp, event, start, end, startHeight, endHeight, rDot, eventHex, currentHeight, 0);
      addCircadianConnectorIfApplicable(grp, pos.x, pos.y, pos.z, midDate, eventHex);
      return grp;
    }

    const durationDays = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
    const band = radius != null && !isNaN(radius)
      ? { rInner: Math.max(earthDist * 0.2, radius * 0.92), rOuter: Math.min(earthDist * 0.8, radius * 1.08) }
      : getEventBandRadii(earthDist, durationDays);
    let { rInner, rOuter } = band;
    if (rOuter <= rInner) rOuter = rInner + earthDist * 0.04;

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
    const eventColorRaw = event.color ?? event.colorId ?? null;
    const explicitEventColor = hasExplicitEventColor(event);
    const fallbackGradient = getTimeGradientHex(getNormalizedTimeForDate(start, layerConfig._timeColorRange));
    const eventHex = parseColor(explicitEventColor ? eventColorRaw : fallbackGradient);
    const layerHex = parseColor(layerConfig.color || '#00b4d8');
    // Prefer explicit fillColor, then per-event color, then layer color.
    const fillHex = parseColor(layerConfig.fillColor || (explicitEventColor ? eventColorRaw : null) || fallbackGradient);
    const borderStyle = layerConfig.borderStyle || 'event';

    const userData = {
      vevent: event,
      layerId: layerConfig.id,
      type: 'EventObject',
      eventUid: (typeof VEvent !== 'undefined' && event instanceof VEvent ? event.uid : event.uid || event.id) || null
    };

    function lineFromFlat(flat, hex, op, renderOrder) {
      const geometry = new global.THREE.BufferGeometry();
      geometry.setAttribute('position', new global.THREE.Float32BufferAttribute(flat, 3));
      const material = new global.THREE.LineBasicMaterial({
        color: hex,
        transparent: true,
        opacity: op
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
        if (borderStyle !== 'none') {
          const outlineColor = borderStyle === 'event' ? eventHex : layerHex;
          group.add(lineFromFlat(innerFlat, outlineColor, opacity, roLine));
          group.add(lineFromFlat(outerFlat, outlineColor, opacity, roLine));
          addBandEndConnectors(group, innerFlat, outerFlat, outlineColor, opacity, roLine);
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
    const geometry = new global.THREE.BufferGeometry();
    geometry.setAttribute('position', new global.THREE.Float32BufferAttribute(points, 3));
    const material = new global.THREE.LineBasicMaterial({
      color: eventHex,
      transparent: true,
      opacity
    });
    const line = new global.THREE.Line(geometry, material);
    line.renderOrder = roLine;
    line.userData = userData;
    return attachEventStaggerRoot(
      wrapWorldlineWithLabels(line, userData, event, start, end, startHeight, endHeight, rOuter, eventHex, currentHeight, 0),
      staggerLogical);
  }

  /**
   * Create line segments from raw { start, end, label?, color? }. Used by addEventLines API.
   * Radius is between Earth worldline and day-name boundary (55/64 of earth distance).
   * Labels: event name at midsection, MM/DD at start and end; same color as the line.
   * @param {Array<{ start: Date|string, end: Date|string, label?: string, color?: string|number }>} lines
   * @param {Object} layerConfig - Layer config (id, color, opacity, ...)
   * @param {THREE.Group|null} sceneContentGroup - Group to add lines to
   * @param {number} radiusOverride - Optional; if not set, uses radius between worldline and day-name boundary
   * @returns {Array<THREE.Object3D>} Created line and label objects (EventLine + sprites)
   */
  function createEventLineObjects(lines, layerConfig, sceneContentGroup, radiusOverride) {
    const lineTimeRange = getTimeRange(lines);
    const earthDist = typeof radiusOverride === 'number' && !isNaN(radiusOverride)
      ? radiusOverride
      : getEarthDistance();
    const objects = [];
    if (!lines || !Array.isArray(lines) || !layerConfig) return objects;
    const group = sceneContentGroup || null;

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
      const rShort = getRadiusForDailyEventDot(earthDist, midDate, i % 4);

      const lineHasExplicitColor = hasExplicitEventColor(line);
      const lineGradient = getTimeGradientHex(getNormalizedTimeForDate(start, lineTimeRange));
      const colorHex = parseColor(lineHasExplicitColor ? line.color : lineGradient);
      const midHeight = (startHeight + endHeight) / 2;

      if (isShortEvent) {
        const labelRadius = rShort + EVENT_LINE_LABEL_RADIUS_OFFSET;
        // Single marker at midpoint, only event name label (no arc, no start/end MM/DD)
        const midPos = getPos(midHeight, rShort);
        const markerSize = Math.max(0.35, Math.min(0.9, 0.35 + 0.55 * Math.min(1, durationH / 24)));
        const marker = createEventLinePointMarker(midPos.x, midPos.y, midPos.z, colorHex, markerSize, {
          layerId: layerConfig.id,
          type: 'EventLine',
          start,
          end,
          label: line.label || null,
          index: i,
          shortEvent: true
        });
        if (group) group.add(marker);
        objects.push(marker);

        const midLabel = (line.label && String(line.label).trim()) ? String(line.label).trim() : (formatMMDD(start) + (sameDay ? '' : ' – ' + formatMMDD(end)));
        const labelPos = getPos(midHeight, labelRadius);
        const midSprite = createEventLineLabelSprite(midLabel, colorHex, labelPos.x, labelPos.y, labelPos.z, nameScale, true);
        Object.assign(midSprite.userData, { type: 'EventLineLabel', kind: 'mid' });
        if (group) group.add(midSprite);
        objects.push(midSprite);
        if (group) addCircadianConnectorIfApplicable(group, midPos.x, midPos.y, midPos.z, midDate, colorHex);
        continue;
      }

      // Multi-day: inner/outer helices, end connectors, optional ribbon fill
      const { rInner, rOuter } = getEventBandRadii(earthDist, durationDays);
      const labelRadius = rOuter + EVENT_LINE_LABEL_RADIUS_OFFSET;

      const byCategory = layerConfig.layerStylesByCategory || {};
      const firstStyle = Object.keys(byCategory).length > 0 ? byCategory[Object.keys(byCategory)[0]] : {};
      const lineStyle = (line.category && byCategory[line.category]) ? byCategory[line.category] : firstStyle;
      const plotType = lineStyle.plotType ?? layerConfig.plotType ?? firstStyle.plotType ?? 'polygon3d';
      const fillColorFromStyle = lineStyle.fillColor ?? layerConfig.fillColor ?? firstStyle.fillColor ?? null;
      const borderStyle = lineStyle.borderStyle ?? layerConfig.borderStyle ?? firstStyle.borderStyle ?? 'event';

      const layerColorHex = parseColor(layerConfig.color || '#00b4d8');
      const eventColorHex = parseColor(lineHasExplicitColor ? line.color : lineGradient);
      const fillHex = fillColorFromStyle ? parseColor(fillColorFromStyle) : (lineHasExplicitColor ? parseColor(line.color) : eventColorHex);
      const opacity = Math.min(1,
        ((lineStyle.opacity != null ? lineStyle.opacity : layerConfig.opacity) ?? 0.7) * getDurationOpacityScale(durationDays));
      const roBoost = getDurationRibbonRenderOrderBoost(durationDays);
      const roFill = -4 + roBoost;
      const roLine = -2 + roBoost;
      const fillOpacity = Math.min(0.98, opacity * getDurationFillOpacityFactor(durationDays));

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

      function evtLineFromFlat(flat, hex, op) {
        const g = new global.THREE.BufferGeometry();
        g.setAttribute('position', new global.THREE.Float32BufferAttribute(flat, 3));
        const m = new global.THREE.LineBasicMaterial({
          color: hex,
          transparent: true,
          opacity: borderStyle === 'none' ? 0 : op
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
          if (borderStyle !== 'none') {
            const outlineColor = borderStyle === 'event' ? eventColorHex : (borderStyle === 'layer' ? layerColorHex : eventColorHex);
            bandGroup.add(evtLineFromFlat(innerFlat, outlineColor, opacity));
            bandGroup.add(evtLineFromFlat(outerFlat, outlineColor, opacity));
            addBandEndConnectors(bandGroup, innerFlat, outerFlat, outlineColor, opacity, roLine);
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
        const outlineColor = borderStyle === 'event' ? eventColorHex : (borderStyle === 'layer' ? layerColorHex : eventColorHex);
        const lineGeometry = new global.THREE.BufferGeometry();
        lineGeometry.setAttribute('position', new global.THREE.Float32BufferAttribute(points, 3));
        const lineMaterial = new global.THREE.LineBasicMaterial({
          color: outlineColor,
          transparent: true,
          opacity: borderStyle === 'none' ? 0 : opacity
        });
        const lineObj = new global.THREE.Line(lineGeometry, lineMaterial);
        lineObj.renderOrder = roLine;
        lineObj.userData = lineUserData;
        lineRoot.add(lineObj);
      }

      const startPos = getPos(startHeight, labelRadius);
      const endPos = getPos(endHeight, labelRadius);
      const midPos = getPos(midHeight, labelRadius);

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

      attachEventStaggerRoot(lineRoot, staggerLogical);
      if (group) group.add(lineRoot);
      objects.push(lineRoot);
    }
    return objects;
  }

  /**
   * Create EventObjects for a set of events and add them to the scene group.
   * @param {Array} events - Array of VEvent or VEVENT-like objects
   * @param {Object} layerConfig - Layer config (id, color, opacity, ...)
   * @param {THREE.Group|null} sceneContentGroup - Group to add meshes to
   * @param {THREE.Scene|null} scene - Scene (unused for now, for API compatibility)
   * @returns {Array<THREE.Object3D>} Created objects (meshes/lines) with userData.type === 'EventObject'
   */
  function getEventCategory(event) {
    const c = event.category ?? (Array.isArray(event.categories) && event.categories[0]);
    return (c != null && String(c).trim()) ? String(c).trim() : 'Default';
  }

  function createEventObjects(events, layerConfig, sceneContentGroup, scene) {
    const objects = [];
    if (!events || !layerConfig) return objects;
    const group = sceneContentGroup || null;
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
        if (group) group.add(obj);
        objects.push(obj);
      }
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
