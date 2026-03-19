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
      opacity: 0.95
    });
    const sprite = new global.THREE.Sprite(mat);
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
    const r = radius != null ? radius : EARTH_RADIUS;
    const start = getEventStart(event);
    if (!start || isNaN(start.getTime())) return null;

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
    const geometry = new global.THREE.SphereGeometry(0.8, 12, 12);
    const material = new global.THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.4
    });
    const mesh = new global.THREE.Mesh(geometry, material);
    mesh.position.set(pos.x, pos.y, pos.z);
    mesh.userData = {
      vevent: event,
      layerId: layerConfig.id,
      type: 'EventObject',
      eventUid: (typeof VEvent !== 'undefined' && event instanceof VEvent ? event.uid : event.uid || event.id) || null
    };
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
      const r = radius != null ? radius : getRadiusForTimeOfDay(start, earthDist, 0);
      return createEventMarker(event, layerConfig, r);
    }
    const durationDays = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
    const midDate = new Date((start.getTime() + end.getTime()) / 2);
    const r = radius != null ? radius : (durationDays > 7
      ? getRadiusForDuration(durationDays, earthDist)
      : getRadiusForTimeOfDay(midDate, earthDist, 0));

    const currentHeight = typeof calculateCurrentDateHeight === 'function'
      ? calculateCurrentDateHeight()
      : 0;
    const startHeight = typeof calculateDateHeight === 'function'
      ? calculateDateHeight(start.getFullYear(), start.getMonth(), start.getDate(), start.getHours())
      : 0;
    const endHeight = typeof calculateDateHeight === 'function'
      ? calculateDateHeight(end.getFullYear(), end.getMonth(), end.getDate(), end.getHours())
      : startHeight;

    let points;
    if (typeof SceneGeometry !== 'undefined' && SceneGeometry.createEarthHelicalCurve) {
      points = SceneGeometry.createEarthHelicalCurve(startHeight, endHeight, r, currentHeight, 32);
    } else {
      const angle0 = typeof SceneGeometry !== 'undefined' && SceneGeometry.getAngle
        ? SceneGeometry.getAngle(startHeight, currentHeight)
        : 0;
      const angle1 = typeof SceneGeometry !== 'undefined' && SceneGeometry.getAngle
        ? SceneGeometry.getAngle(endHeight, currentHeight)
        : angle0;
      const p0 = typeof SceneGeometry !== 'undefined' && SceneGeometry.getPosition3D
        ? SceneGeometry.getPosition3D(startHeight, angle0, r)
        : { x: Math.cos(angle0) * r, y: startHeight, z: Math.sin(angle0) * r };
      const p1 = typeof SceneGeometry !== 'undefined' && SceneGeometry.getPosition3D
        ? SceneGeometry.getPosition3D(endHeight, angle1, r)
        : { x: Math.cos(angle1) * r, y: endHeight, z: Math.sin(angle1) * r };
      points = [p0.x, p0.y, p0.z, p1.x, p1.y, p1.z];
    }

    const plotType = layerConfig.plotType ?? 'polygon3d'; // default filled; use 'lines' in layer style for outline-only
    const lineThickness = Math.max(0.2, (layerConfig.lineThickness != null ? layerConfig.lineThickness : 1));
    const opacity = layerConfig.opacity != null ? layerConfig.opacity : 0.7;
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

    if (plotType === 'lines') {
      // Lines mode: draw only a line (no tube), regardless of lineThickness
      const tubeRadius = 0;
      if (tubeRadius > 0 && points.length >= 9 && global.THREE.CatmullRomCurve3 && global.THREE.TubeGeometry) {
        const vec3s = [];
        for (let k = 0; k < points.length; k += 3) vec3s.push(new global.THREE.Vector3(points[k], points[k + 1], points[k + 2]));
        const curve = new global.THREE.CatmullRomCurve3(vec3s);
        const tubeGeometry = new global.THREE.TubeGeometry(curve, 16, tubeRadius, 6, false);
        const tubeMaterial = new global.THREE.MeshBasicMaterial({
          color: eventHex,
          transparent: true,
          opacity,
          side: global.THREE.DoubleSide
        });
        const tube = new global.THREE.Mesh(tubeGeometry, tubeMaterial);
        tube.userData = userData;
        return tube;
      }
      const geometry = new global.THREE.BufferGeometry();
      geometry.setAttribute('position', new global.THREE.Float32BufferAttribute(points, 3));
      const material = new global.THREE.LineBasicMaterial({
        color: eventHex,
        transparent: true,
        opacity
      });
      const line = new global.THREE.Line(geometry, material);
      line.userData = userData;
      return line;
    }

    if ((plotType === 'polygon3d' || plotType === 'polygon2d') && points.length >= 9 && global.THREE.CatmullRomCurve3 && global.THREE.TubeGeometry) {
      const vec3s = [];
      for (let k = 0; k < points.length; k += 3) vec3s.push(new global.THREE.Vector3(points[k], points[k + 1], points[k + 2]));
      const curve = new global.THREE.CatmullRomCurve3(vec3s);
      const tubeRadius = Math.max(0.3, Math.min(2, 0.4 * lineThickness));
      const tubeGeometry = new global.THREE.TubeGeometry(curve, Math.max(12, Math.min(32, Math.floor((endHeight - startHeight) / 100))), tubeRadius, 8, false);
      const group = new global.THREE.Group();
      group.userData = userData;

      const fillMaterial = new global.THREE.MeshBasicMaterial({
        color: fillHex,
        transparent: true,
        opacity: opacity * 0.6,
        side: global.THREE.DoubleSide
      });
      const fillMesh = new global.THREE.Mesh(tubeGeometry.clone(), fillMaterial);
      if (plotType === 'polygon2d') fillMesh.scale.y = 0.02;
      fillMesh.renderOrder = 10; // Draw after time marker lines so fill is visible where they overlap
      group.add(fillMesh);

      if (borderStyle !== 'none') {
        const outlineColor = borderStyle === 'event' ? eventHex : layerHex;
        const lineGeometry = new global.THREE.BufferGeometry();
        lineGeometry.setAttribute('position', new global.THREE.Float32BufferAttribute(points, 3));
        const lineMaterial = new global.THREE.LineBasicMaterial({
          color: outlineColor,
          transparent: true,
          opacity: borderStyle === 'none' ? 0 : opacity
        });
        const lineObj = new global.THREE.Line(lineGeometry, lineMaterial);
        lineObj.renderOrder = 11;
        group.add(lineObj);
      }
      return group;
    }

    const geometry = new global.THREE.BufferGeometry();
    geometry.setAttribute('position', new global.THREE.Float32BufferAttribute(points, 3));
    const material = new global.THREE.LineBasicMaterial({
      color: eventHex,
      transparent: true,
      opacity
    });
    const line = new global.THREE.Line(geometry, material);
    line.userData = userData;
    return line;
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
      const sameDay = start.getFullYear() === end.getFullYear() &&
        start.getMonth() === end.getMonth() && start.getDate() === end.getDate();
      const isShortEvent = sameDay || durationDays <= 1;

      const midDate = new Date((start.getTime() + end.getTime()) / 2);
      const r = durationDays > 7
        ? getRadiusForDuration(durationDays, earthDist)
        : getRadiusForTimeOfDay(midDate, earthDist, i % 4);
      const labelRadius = r + EVENT_LINE_LABEL_RADIUS_OFFSET;

      const lineHasExplicitColor = hasExplicitEventColor(line);
      const lineGradient = getTimeGradientHex(getNormalizedTimeForDate(start, lineTimeRange));
      const colorHex = parseColor(lineHasExplicitColor ? line.color : lineGradient);
      const midHeight = (startHeight + endHeight) / 2;

      if (isShortEvent) {
        // Single marker at midpoint, only event name label (no arc, no start/end MM/DD)
        const midPos = getPos(midHeight, r);
        const markerSize = Math.max(0.35, Math.min(1.1, 0.35 + 0.75 * Math.min(1, durationDays)));
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
        continue;
      }

      // Multi-day: full arc + start/end MM/DD + name at mid
      let points;
      if (typeof SceneGeometry !== 'undefined' && SceneGeometry.createEarthHelicalCurve) {
        points = SceneGeometry.createEarthHelicalCurve(startHeight, endHeight, r, currentHeight, 32);
      } else {
        const angle0 = getAngle(startHeight);
        const angle1 = getAngle(endHeight);
        const p0 = typeof SceneGeometry !== 'undefined' && SceneGeometry.getPosition3D
          ? SceneGeometry.getPosition3D(startHeight, angle0, r)
          : { x: Math.cos(angle0) * r, y: startHeight, z: Math.sin(angle0) * r };
        const p1 = typeof SceneGeometry !== 'undefined' && SceneGeometry.getPosition3D
          ? SceneGeometry.getPosition3D(endHeight, angle1, r)
          : { x: Math.cos(angle1) * r, y: endHeight, z: Math.sin(angle1) * r };
        points = [p0.x, p0.y, p0.z, p1.x, p1.y, p1.z];
      }

      const byCategory = layerConfig.layerStylesByCategory || {};
      const firstStyle = Object.keys(byCategory).length > 0 ? byCategory[Object.keys(byCategory)[0]] : {};
      const lineStyle = (line.category && byCategory[line.category]) ? byCategory[line.category] : firstStyle;
      const plotType = lineStyle.plotType ?? layerConfig.plotType ?? firstStyle.plotType ?? 'polygon3d';
      const lineThickness = (lineStyle.lineThickness != null ? lineStyle.lineThickness : layerConfig.lineThickness) ?? (firstStyle.lineThickness != null ? firstStyle.lineThickness : 1);
      const fillColorFromStyle = lineStyle.fillColor ?? layerConfig.fillColor ?? firstStyle.fillColor ?? null;
      const borderStyle = lineStyle.borderStyle ?? layerConfig.borderStyle ?? firstStyle.borderStyle ?? 'event';

      const layerColorHex = parseColor(layerConfig.color || '#00b4d8');
      const eventColorHex = parseColor(lineHasExplicitColor ? line.color : lineGradient);
      const fillHex = fillColorFromStyle ? parseColor(fillColorFromStyle) : (lineHasExplicitColor ? parseColor(line.color) : eventColorHex);
      const opacity = (lineStyle.opacity != null ? lineStyle.opacity : layerConfig.opacity) ?? 0.7;
      const isLongTerm = durationDays > 7;
      const showTube = isLongTerm && plotType !== 'lines' && points.length >= 9 && global.THREE.CatmullRomCurve3 && global.THREE.TubeGeometry;

      if (showTube) {
        const vec3s = [];
        for (let k = 0; k < points.length; k += 3) {
          vec3s.push(new global.THREE.Vector3(points[k], points[k + 1], points[k + 2]));
        }
        const curve = new global.THREE.CatmullRomCurve3(vec3s);
        const tubeRadius = Math.max(0.3, Math.min(2, 0.4 * lineThickness));
        const tubeGeometry = new global.THREE.TubeGeometry(curve, Math.max(16, Math.min(48, Math.floor(durationDays))), tubeRadius, 8, false);
        const tubeMaterial = new global.THREE.MeshBasicMaterial({
          color: fillHex,
          transparent: true,
          opacity: opacity * 0.6,
          side: global.THREE.DoubleSide
        });
        const tubeMesh = new global.THREE.Mesh(tubeGeometry, tubeMaterial);
        if (plotType === 'polygon2d') tubeMesh.scale.y = 0.02;
        tubeMesh.renderOrder = 10; // Draw after time marker lines so fill is visible where they overlap
        tubeMesh.userData = {
          layerId: layerConfig.id,
          type: 'EventLine',
          start,
          end,
          label: line.label || null,
          index: i,
          longTermFill: true
        };
        if (group) group.add(tubeMesh);
        objects.push(tubeMesh);
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
      lineObj.renderOrder = 11;
      lineObj.userData = {
        layerId: layerConfig.id,
        type: 'EventLine',
        start,
        end,
        label: line.label || null,
        index: i
      };
      if (group) group.add(lineObj);
      objects.push(lineObj);

      const startPos = getPos(startHeight, labelRadius);
      const endPos = getPos(endHeight, labelRadius);
      const midPos = getPos(midHeight, labelRadius);

      const startSprite = createEventLineLabelSprite(formatMMDD(start), colorHex, startPos.x, startPos.y, startPos.z, startEndScale, false);
      Object.assign(startSprite.userData, { type: 'EventLineLabel', kind: 'start' });
      if (group) group.add(startSprite);
      objects.push(startSprite);

      const endSprite = createEventLineLabelSprite(formatMMDD(end), colorHex, endPos.x, endPos.y, endPos.z, startEndScale, false);
      Object.assign(endSprite.userData, { type: 'EventLineLabel', kind: 'end' });
      if (group) group.add(endSprite);
      objects.push(endSprite);

      const midLabel = (line.label && String(line.label).trim()) ? String(line.label).trim() : (formatMMDD(start) + ' – ' + formatMMDD(end));
      const midSprite = createEventLineLabelSprite(midLabel, colorHex, midPos.x, midPos.y, midPos.z, nameScale, true);
      Object.assign(midSprite.userData, { type: 'EventLineLabel', kind: 'mid' });
      if (group) group.add(midSprite);
      objects.push(midSprite);
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
