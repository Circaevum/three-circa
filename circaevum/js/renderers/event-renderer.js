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
  // Event lines sit between Earth's worldline and the day-name outer boundary (timemarker dayName = 23/32).
  // Use midpoint: (1 + 23/32) / 2 = 55/64 of earth distance.
  const EVENT_LINE_RADIUS_FRACTION = 55 / 64;
  const EVENT_LINE_LABEL_RADIUS_FRACTION = 58 / 64; // Slightly outside arc so labels sit above it

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

  /**
   * Create a text sprite for event line labels (event name or MM/DD). Color in hex number.
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

    const r = (colorHex >> 16) & 0xff;
    const g = (colorHex >> 8) & 0xff;
    const b = colorHex & 0xff;
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

    const color = parseColor(layerConfig.color || event.color || '#00b4d8');
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
   * Create a short worldline for a duration event
   * @param {Object|VEvent} event
   * @param {Object} layerConfig
   * @param {number} radius
   * @returns {THREE.Line|null}
   */
  function createEventWorldline(event, layerConfig, radius) {
    const r = radius != null ? radius : EARTH_RADIUS;
    const start = getEventStart(event);
    const end = getEventEnd(event);
    if (!start || isNaN(start.getTime())) return null;
    if (!end || end <= start) return createEventMarker(event, layerConfig, r);

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

    const geometry = new global.THREE.BufferGeometry();
    geometry.setAttribute('position', new global.THREE.Float32BufferAttribute(points, 3));
    const color = parseColor(layerConfig.color || event.color || '#00b4d8');
    const material = new global.THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: layerConfig.opacity != null ? layerConfig.opacity : 0.7
    });
    const line = new global.THREE.Line(geometry, material);
    line.userData = {
      vevent: event,
      layerId: layerConfig.id,
      type: 'EventObject',
      eventUid: (typeof VEvent !== 'undefined' && event instanceof VEvent ? event.uid : event.uid || event.id) || null
    };
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
    const earthDist = typeof radiusOverride === 'number' && !isNaN(radiusOverride)
      ? radiusOverride
      : getEarthDistance();
    const r = earthDist * EVENT_LINE_RADIUS_FRACTION;
    const labelRadius = earthDist * EVENT_LINE_LABEL_RADIUS_FRACTION;
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

      const colorHex = parseColor(line.color != null ? line.color : layerConfig.color || '#00b4d8');
      const midHeight = (startHeight + endHeight) / 2;

      const durationMs = end.getTime() - start.getTime();
      const durationDays = durationMs / (24 * 60 * 60 * 1000);
      const sameDay = start.getFullYear() === end.getFullYear() &&
        start.getMonth() === end.getMonth() && start.getDate() === end.getDate();
      const isShortEvent = sameDay || durationDays <= 1;

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
        midSprite.userData = { type: 'EventLineLabel', kind: 'mid' };
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

      const geometry = new global.THREE.BufferGeometry();
      geometry.setAttribute('position', new global.THREE.Float32BufferAttribute(points, 3));
      const material = new global.THREE.LineBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: layerConfig.opacity != null ? layerConfig.opacity : 0.7
      });
      const lineObj = new global.THREE.Line(geometry, material);
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
      startSprite.userData = { type: 'EventLineLabel', kind: 'start' };
      if (group) group.add(startSprite);
      objects.push(startSprite);

      const endSprite = createEventLineLabelSprite(formatMMDD(end), colorHex, endPos.x, endPos.y, endPos.z, startEndScale, false);
      endSprite.userData = { type: 'EventLineLabel', kind: 'end' };
      if (group) group.add(endSprite);
      objects.push(endSprite);

      const midLabel = (line.label && String(line.label).trim()) ? String(line.label).trim() : (formatMMDD(start) + ' – ' + formatMMDD(end));
      const midSprite = createEventLineLabelSprite(midLabel, colorHex, midPos.x, midPos.y, midPos.z, nameScale, true);
      midSprite.userData = { type: 'EventLineLabel', kind: 'mid' };
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
  function createEventObjects(events, layerConfig, sceneContentGroup, scene) {
    const objects = [];
    if (!events || !layerConfig) return objects;
    const group = sceneContentGroup || null;

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const hasEnd = !!getEventEnd(event);
      const obj = hasEnd ? createEventWorldline(event, layerConfig) : createEventMarker(event, layerConfig);
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
