/**
 * Circadian rhythm renderer — daily disks + optional legacy helix helpers.
 *
 * Short events sit on one **disk per calendar day** (center at local noon on Earth’s orbit).
 * Time-of-day maps to angle; overlapping slots stack in **concentric annuli** (see event-renderer lane packer).
 * Wrapped / straightened blend still morphs disk placement like the old hour-hand frame.
 *
 * Dependencies: SceneGeometry, calculateDateHeight, PLANET_DATA (Earth), THREE
 */
(function (global) {
  const HOURS_PER_DAY = 24;
  const HEIGHT_PER_YEAR = 100;
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  let SceneGeometry;
  let calculateDateHeight;
  let calculateCurrentDateHeight;
  let PLANET_DATA;
  let earthDistance = 50;
  let handLength = 12;

  /** Same as TimeMarkers RADII_CONFIG.hour.spiral(earthDistance) – Earth Ring / hour markers radius */
  function getEarthRingRadius() {
    return earthDistance * 0.1 * 0.9;
  }

  function init(dependencies) {
    SceneGeometry = dependencies.SceneGeometry;
    calculateDateHeight = dependencies.calculateDateHeight;
    calculateCurrentDateHeight = dependencies.calculateCurrentDateHeight;
    PLANET_DATA = dependencies.PLANET_DATA;
    if (PLANET_DATA) {
      const earth = PLANET_DATA.find(p => p.name === 'Earth');
      if (earth) earthDistance = earth.distance;
    }
    handLength = (dependencies.handLength != null) ? dependencies.handLength : getEarthRingRadius();
  }

  /**
   * Build helix points: at each (date, hour), Earth position + hour-hand tip in orbital plane.
   * @param {number} startHeight - start of span (y)
   * @param {number} endHeight - end of span (y)
   * @param {number} currentHeight - reference for angle
   * @param {number} segmentsPerDay - samples per day (e.g. 24 for hourly)
   * @returns {Array<number>} flat [x,y,z,...]
   */
  function buildCircadianHelixPoints(startHeight, endHeight, currentHeight, segmentsPerDay) {
    if (!SceneGeometry || !SceneGeometry.getAngle || !SceneGeometry.getPosition3D || typeof calculateDateHeight !== 'function') {
      return [];
    }
    const points = [];
    const totalHeight = endHeight - startHeight;
    const days = totalHeight / (HEIGHT_PER_YEAR / 365.25);
    const steps = Math.max(2, Math.ceil(days * segmentsPerDay));
    const stretch =
      typeof global.getCircadianHelixYStretchMult === 'function' ? global.getCircadianHelixYStretchMult() : 1;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const heightAlong = startHeight + t * totalHeight;
      const orbitAngle = SceneGeometry.getAngle(heightAlong, currentHeight);
      const earthPos0 = SceneGeometry.getPosition3D(heightAlong, orbitAngle, earthDistance);
      const yW = currentHeight + (heightAlong - currentHeight) * stretch;
      const earthPos = { x: earthPos0.x, y: yW, z: earthPos0.z };
      const HY = HEIGHT_PER_YEAR;
      const remainder = ((heightAlong % HY) + HY) % HY / HY;
      const dayOfYear = remainder * 365.25;
      const day = Math.floor(dayOfYear);
      const hourFrac = (dayOfYear - day) * HOURS_PER_DAY;
      const dayAngle = (hourFrac / HOURS_PER_DAY) * Math.PI * 2;
      // Match TimeMarkers / zoom-8 hour spiral: midnight = far from Sun along Earth radial; noon = toward Sun.
      // sun–Earth angle in XZ; subtract hour progression so local time advances CCW from +Y (north) as Earth rotates.
      const sunToEarthAngle = Math.atan2(earthPos.z, earthPos.x);
      const handAngle = sunToEarthAngle - dayAngle;
      const tip = {
        x: earthPos.x + handLength * Math.cos(handAngle),
        y: earthPos.y,
        z: earthPos.z + handLength * Math.sin(handAngle)
      };
      points.push(tip.x, tip.y, tip.z);
    }
    return points;
  }

  /**
   * Straightened helix tip positions in world space (same sampling as buildCircadianHelixPoints).
   */
  function buildStraightenedHelixPointsWorld(startHeight, endHeight, currentHeight, segmentsPerDay) {
    if (!SceneGeometry || !SceneGeometry.getAngle || !SceneGeometry.getPosition3D) {
      return [];
    }
    const stretch =
      typeof global.getCircadianHelixYStretchMult === 'function' ? global.getCircadianHelixYStretchMult() : 1;
    const totalHeight = endHeight - startHeight;
    const days = totalHeight / (HEIGHT_PER_YEAR / 365.25);
    const steps = Math.max(2, Math.ceil(days * segmentsPerDay));
    const points = [];
    const orbitAngleNow = SceneGeometry.getAngle(currentHeight, currentHeight);
    const earthRef = SceneGeometry.getPosition3D(currentHeight, orbitAngleNow, earthDistance);
    const c = Math.cos(-orbitAngleNow);
    const s = Math.sin(-orbitAngleNow);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const heightAlong = startHeight + t * totalHeight;
      const yLocal = (heightAlong - currentHeight) * stretch;
      const remainder =
        ((heightAlong % HEIGHT_PER_YEAR) + HEIGHT_PER_YEAR) % HEIGHT_PER_YEAR / HEIGHT_PER_YEAR;
      const dayOfYear = remainder * 365.25;
      const hourFrac = (dayOfYear - Math.floor(dayOfYear)) * HOURS_PER_DAY;
      const dayAngle = (hourFrac / HOURS_PER_DAY) * Math.PI * 2;
      const xLocal = handLength * Math.cos(-dayAngle);
      const zLocal = handLength * Math.sin(-dayAngle);
      const wx = earthRef.x + c * xLocal + s * zLocal;
      const wy = earthRef.y + yLocal;
      const wz = earthRef.z - s * xLocal + c * zLocal;
      points.push(wx, wy, wz);
    }
    return points;
  }

  function blendHelixPointArrays(wrappedFlat, straightFlat, blend) {
    const t = Math.min(1, Math.max(0, blend));
    const n = Math.min(wrappedFlat.length, straightFlat.length);
    const out = new Float32Array(n);
    const om = 1 - t;
    for (let i = 0; i < n; i++) {
      out[i] = wrappedFlat[i] * om + straightFlat[i] * t;
    }
    return out;
  }

  function readCircadianHelixStyle() {
    if (typeof global.getCircadianHelixVisualStyle === 'function') {
      return global.getCircadianHelixVisualStyle();
    }
    return {
      helixColor: 0xffaa44,
      helixOpacity: 0.78,
      markerMonth: 0x7dd3fc,
      markerWeek: 0xa78bfa,
      markerOpacity: 0.9,
      markerWeekOpacity: 0.78
    };
  }

  function applyStyleToLineMaterial(line) {
    if (!line || !line.material) return;
    const st = readCircadianHelixStyle();
    line.material.color.setHex(st.helixColor);
    line.material.opacity = st.helixOpacity != null ? st.helixOpacity : 0.78;
  }

  function earthWrappedAtHeight(height, currentHeight) {
    const stretch =
      typeof global.getCircadianHelixYStretchMult === 'function' ? global.getCircadianHelixYStretchMult() : 1;
    const orbitAngle = SceneGeometry.getAngle(height, currentHeight);
    const earthPos0 = SceneGeometry.getPosition3D(height, orbitAngle, earthDistance);
    return {
      x: earthPos0.x,
      y: currentHeight + (height - currentHeight) * stretch,
      z: earthPos0.z
    };
  }

  function earthStraightAtHeight(height, currentHeight) {
    const stretch =
      typeof global.getCircadianHelixYStretchMult === 'function' ? global.getCircadianHelixYStretchMult() : 1;
    const orbitAngleNow = SceneGeometry.getAngle(currentHeight, currentHeight);
    const earthRef = SceneGeometry.getPosition3D(currentHeight, orbitAngleNow, earthDistance);
    const yLocal = (height - currentHeight) * stretch;
    return { x: earthRef.x, y: earthRef.y + yLocal, z: earthRef.z };
  }

  function blendedEarthAtHeight(height, currentHeight, b) {
    const t = Math.min(1, Math.max(0, b));
    const ew = earthWrappedAtHeight(height, currentHeight);
    const es = earthStraightAtHeight(height, currentHeight);
    const om = 1 - t;
    return {
      x: ew.x * om + es.x * t,
      y: ew.y * om + es.y * t,
      z: ew.z * om + es.z * t
    };
  }

  function hexToRgbUnit(hex) {
    const h = hex >>> 0;
    return {
      r: ((h >> 16) & 255) / 255,
      g: ((h >> 8) & 255) / 255,
      b: (h & 255) / 255
    };
  }

  function sameLocalCalendarDay(a, b) {
    return !!(a && b && !isNaN(a.getTime()) && !isNaN(b.getTime()) &&
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate());
  }

  /**
   * Orbit phase ref = actual “now” height; timeline pivot + Earth XZ = navigation (matches main.js planets).
   */
  function readCircadianSceneTimeContext(fallbackHeight) {
    if (typeof global.getCircadianSceneTimeContext === 'function') {
      const ctx = global.getCircadianSceneTimeContext();
      if (ctx &&
          ctx.currentDateHeight != null && !isNaN(ctx.currentDateHeight) &&
          ctx.selectedDateHeight != null && !isNaN(ctx.selectedDateHeight)) {
        return ctx;
      }
    }
    return {
      currentDateHeight: fallbackHeight,
      selectedDateHeight: fallbackHeight,
      selectedDate: typeof global.getSelectedDateTime === 'function' ? global.getSelectedDateTime() : new Date(),
      earthX: NaN,
      earthZ: NaN
    };
  }

  /** Helix guide + structure ticks are visual only; keep them out of event picking. */
  function disableDecorationRaycast(root) {
    if (!root) return;
    root.traverse(function (o) {
      o.raycast = function () {};
    });
  }

  /**
   * Week starts (Monday) and month starts along the helix — ticks outward from hand tip at local midnights.
   */
  function buildHelixStructureMarkerGeometry(spanDays, centerDate, currentHeight, straightenBlend, calculateDateHeightFn) {
    const positions = [];
    const colors = [];
    const st = readCircadianHelixStyle();
    const monthRgb = hexToRgbUnit(st.markerMonth != null ? st.markerMonth : 0x7dd3fc);
    const weekRgb = hexToRgbUnit(st.markerWeek != null ? st.markerWeek : 0xa78bfa);
    const b = Math.min(1, Math.max(0, straightenBlend));
    const heightPerDay = HEIGHT_PER_YEAR / 365.25;
    const halfSpan = (spanDays / 2) * heightPerDay;
    const startHeight = currentHeight - halfSpan;
    const endHeight = currentHeight + halfSpan;
    const pad = Math.max(3, Math.ceil(spanDays / 2) + 2);
    const c = new Date(centerDate.getTime());
    c.setHours(0, 0, 0, 0);
    const startCal = new Date(c);
    startCal.setDate(startCal.getDate() - pad);
    for (let di = 0; di <= pad * 2 + 2; di++) {
      const d = new Date(startCal);
      d.setDate(d.getDate() + di);
      const h = calculateDateHeightFn(d.getFullYear(), d.getMonth(), d.getDate(), 0);
      if (h == null || isNaN(h) || h < startHeight - 1e-5 || h > endHeight + 1e-5) {
        continue;
      }
      const isMonthStart = d.getDate() === 1;
      const isWeekStart = d.getDay() === 1;
      if (!isMonthStart && !isWeekStart) continue;
      const tip = getWrappedHandTipAtHeight(h, currentHeight, b);
      const earth = blendedEarthAtHeight(h, currentHeight, b);
      if (!tip) continue;
      let dx = tip.x - earth.x;
      let dy = tip.y - earth.y;
      let dz = tip.z - earth.z;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      dx /= len;
      dy /= len;
      dz /= len;
      const tickLen = isMonthStart ? 3.1 : 1.75;
      const tx = tip.x + dx * tickLen;
      const ty = tip.y + dy * tickLen;
      const tz = tip.z + dz * tickLen;
      positions.push(tip.x, tip.y, tip.z, tx, ty, tz);
      const rgb = isMonthStart ? monthRgb : weekRgb;
      colors.push(rgb.r, rgb.g, rgb.b, rgb.r, rgb.g, rgb.b);
    }
    return { positions, colors };
  }

  function createHelixStructureMarkersGroup(spanDays) {
    if (!global.THREE || !SceneGeometry) return null;
    const THREE = global.THREE;
    const st = readCircadianHelixStyle();
    const geom = new THREE.BufferGeometry();
    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: st.markerOpacity != null ? st.markerOpacity : 0.88,
      depthWrite: false
    });
    const lineSegments = new THREE.LineSegments(geom, mat);
    lineSegments.renderOrder = 6;
    const group = new THREE.Group();
    group.add(lineSegments);
    group.userData = {
      circadianStructureMarkers: true,
      spanDays,
      lineSegments
    };
    disableDecorationRaycast(group);
    return group;
  }

  function refreshHelixStructureMarkersGroup(group, straightenBlend, currentHeight, centerDate) {
    if (!group || !group.userData.circadianStructureMarkers || !calculateDateHeight || !global.THREE) {
      return;
    }
    const spanDays = group.userData.spanDays;
    const ls = group.userData.lineSegments;
    if (!ls || !ls.geometry) return;
    const built = buildHelixStructureMarkerGeometry(
      spanDays,
      centerDate,
      currentHeight,
      straightenBlend,
      calculateDateHeight
    );
    const THREE = global.THREE;
    const oldPos = ls.geometry.getAttribute('position');
    const oldCol = ls.geometry.getAttribute('color');
    if (oldPos) ls.geometry.deleteAttribute('position');
    if (oldCol) ls.geometry.deleteAttribute('color');
    if (!built.positions || built.positions.length < 6) {
      ls.visible = false;
      ls.geometry.computeBoundingSphere();
      return;
    }
    ls.visible = true;
    ls.geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(built.positions), 3));
    ls.geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(built.colors), 3));
    ls.geometry.computeBoundingSphere();
    const st = readCircadianHelixStyle();
    ls.material.opacity = st.markerOpacity != null ? st.markerOpacity : 0.88;
  }

  /**
   * Orange circadian line: morphs wrapped ↔ straight each frame via straightenBlend (0–1).
   */
  function refreshCircadianHelixLine(line, straightenBlend, currentHeight, spanDays) {
    if (!line || !line.geometry || !line.userData || !line.userData.circadianHelixAnim || !global.THREE) {
      return;
    }
    const heightPerDay = HEIGHT_PER_YEAR / 365.25;
    const halfSpan = (spanDays / 2) * heightPerDay;
    const startHeight = currentHeight - halfSpan;
    const endHeight = currentHeight + halfSpan;
    const w = buildCircadianHelixPoints(startHeight, endHeight, currentHeight, 24);
    const s = buildStraightenedHelixPointsWorld(startHeight, endHeight, currentHeight, 24);
    if (w.length < 6 || w.length !== s.length) return;
    const out = blendHelixPointArrays(w, s, straightenBlend);
    const pos = line.geometry.attributes.position;
    if (!pos || pos.array.length !== out.length) {
      if (line.geometry) line.geometry.dispose();
      line.geometry = new global.THREE.BufferGeometry();
      line.geometry.setAttribute('position', new global.THREE.Float32BufferAttribute(out, 3));
    } else {
      for (let i = 0; i < out.length; i++) pos.array[i] = out[i];
      pos.needsUpdate = true;
    }
    line.geometry.computeBoundingSphere();
    applyStyleToLineMaterial(line);
  }

  /**
   * @param {number} currentHeight
   * @param {{ color?: number, opacity?: number, spanDays?: number }} options
   */
  function createAnimatedHelixLine(currentHeight, options) {
    if (!SceneGeometry || !global.THREE) return null;
    const spanDays = options && options.spanDays != null ? options.spanDays : 2;
    const heightPerDay = HEIGHT_PER_YEAR / 365.25;
    const halfSpan = (spanDays / 2) * heightPerDay;
    const startHeight = currentHeight - halfSpan;
    const endHeight = currentHeight + halfSpan;
    const blend =
      typeof global.getCircadianStraightenBlend === 'function' ? global.getCircadianStraightenBlend() : 0;
    const w = buildCircadianHelixPoints(startHeight, endHeight, currentHeight, 24);
    const s = buildStraightenedHelixPointsWorld(startHeight, endHeight, currentHeight, 24);
    if (w.length < 6 || w.length !== s.length) return null;
    const pts = blendHelixPointArrays(w, s, blend);
    const THREE = global.THREE;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const material = new THREE.LineBasicMaterial({
      color: options && options.color != null ? options.color : 0xffaa44,
      transparent: true,
      opacity: options && options.opacity != null ? options.opacity : 0.6
    });
    const line = new THREE.Line(geometry, material);
    line.userData = {
      circadianHelixAnim: true,
      spanDays
    };
    applyStyleToLineMaterial(line);
    disableDecorationRaycast(line);
    return line;
  }

  /**
   * Mode 2 (wrapped): helix in world space. Returns a THREE.Line.
   */
  function createWrappedHelix(startHeight, endHeight, currentHeight, color, opacity) {
    const pts = buildCircadianHelixPoints(startHeight, endHeight, currentHeight, 24);
    if (pts.length < 6) return null;
    const THREE = global.THREE;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const material = new THREE.LineBasicMaterial({
      color: color != null ? color : 0xffaa44,
      transparent: true,
      opacity: opacity != null ? opacity : 0.6
    });
    return new THREE.Line(geometry, material);
  }

  /**
   * Mode 1 (straightened): helix in Earth-local coords so it moves with Earth.
   * Y = time axis (past/future), XZ = hour-hand circle; group positioned at Earth and rotated so noon/midnight stay correct.
   */
  function createStraightenedHelix(startHeight, endHeight, currentHeight, color, opacity) {
    if (!SceneGeometry || !SceneGeometry.getAngle || typeof calculateDateHeight !== 'function') return null;
    const THREE = global.THREE;
    const totalHeight = endHeight - startHeight;
    const days = totalHeight / (HEIGHT_PER_YEAR / 365.25);
    const steps = Math.max(2, Math.ceil(days * 24));
    const points = [];
    const orbitAngleNow = SceneGeometry.getAngle(currentHeight, currentHeight);
    const stretch =
      typeof global.getCircadianHelixYStretchMult === 'function' ? global.getCircadianHelixYStretchMult() : 1;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const height = startHeight + t * totalHeight;
      const yLocal = (height - currentHeight) * stretch;
      const remainder = ((height % HEIGHT_PER_YEAR) + HEIGHT_PER_YEAR) % HEIGHT_PER_YEAR / HEIGHT_PER_YEAR;
      const dayOfYear = remainder * 365.25;
      const hourFrac = (dayOfYear - Math.floor(dayOfYear)) * HOURS_PER_DAY;
      const dayAngle = (hourFrac / HOURS_PER_DAY) * Math.PI * 2;
      const xLocal = handLength * Math.cos(-dayAngle);
      const zLocal = handLength * Math.sin(-dayAngle);
      points.push(xLocal, yLocal, zLocal);
    }
    if (points.length < 6) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    const material = new THREE.LineBasicMaterial({
      color: color != null ? color : 0xffaa44,
      transparent: true,
      opacity: opacity != null ? opacity : 0.6
    });
    const line = new THREE.Line(geometry, material);
    const earthPos = SceneGeometry.getPosition3D(currentHeight, orbitAngleNow, earthDistance);
    const group = new THREE.Group();
    group.position.set(earthPos.x, earthPos.y, earthPos.z);
    group.rotation.y = -orbitAngleNow;
    group.add(line);
    group.userData = { circadianMode: 'straightened', centerHeight: currentHeight };
    return group;
  }

  /**
   * Create or update circadian worldline. Call from main when zoom level is day/clock.
   * @param {number} zoomLevel
   * @param {number} currentHeight
   * @param {number} mode - 1 = straightened, 2 = wrapped
   * @param {Object} options - { color, opacity, spanDays }
   * @returns {THREE.Line|null}
   */
  function create(zoomLevel, currentHeight, mode, options) {
    if (!SceneGeometry) return null;
    const spanDays = (options && options.spanDays != null) ? options.spanDays : 2;
    const heightPerDay = HEIGHT_PER_YEAR / 365.25;
    const halfSpan = (spanDays / 2) * heightPerDay;
    const startHeight = currentHeight - halfSpan;
    const endHeight = currentHeight + halfSpan;
    const color = options && options.color != null ? options.color : 0xffaa44;
    const opacity = options && options.opacity != null ? options.opacity : 0.6;

    if (mode === 1) {
      return createStraightenedHelix(startHeight, endHeight, currentHeight, color, opacity);
    }
    return createWrappedHelix(startHeight, endHeight, currentHeight, color, opacity);
  }

  function tipWrappedAtHeight(height, currentHeight) {
    const stretch =
      typeof global.getCircadianHelixYStretchMult === 'function' ? global.getCircadianHelixYStretchMult() : 1;
    const HY = HEIGHT_PER_YEAR;
    const remainder = ((height % HY) + HY) % HY / HY;
    const dayOfYear = remainder * 365.25;
    const hourFrac = (dayOfYear - Math.floor(dayOfYear)) * HOURS_PER_DAY;
    const dayAngle = (hourFrac / HOURS_PER_DAY) * Math.PI * 2;
    const orbitAngle = SceneGeometry.getAngle(height, currentHeight);
    const earthPos0 = SceneGeometry.getPosition3D(height, orbitAngle, earthDistance);
    const earthPos = {
      x: earthPos0.x,
      y: currentHeight + (height - currentHeight) * stretch,
      z: earthPos0.z
    };
    const sunToEarthAngle = Math.atan2(earthPos.z, earthPos.x);
    const handAngle = sunToEarthAngle - dayAngle;
    return {
      x: earthPos.x + handLength * Math.cos(handAngle),
      y: earthPos.y,
      z: earthPos.z + handLength * Math.sin(handAngle)
    };
  }

  function tipStraightAtHeight(height, currentHeight) {
    const stretch =
      typeof global.getCircadianHelixYStretchMult === 'function' ? global.getCircadianHelixYStretchMult() : 1;
    const HY = HEIGHT_PER_YEAR;
    const remainder = ((height % HY) + HY) % HY / HY;
    const dayOfYear = remainder * 365.25;
    const hourFrac = (dayOfYear - Math.floor(dayOfYear)) * HOURS_PER_DAY;
    const dayAngle = (hourFrac / HOURS_PER_DAY) * Math.PI * 2;
    const orbitAngleNow = SceneGeometry.getAngle(currentHeight, currentHeight);
    const earthRef = SceneGeometry.getPosition3D(currentHeight, orbitAngleNow, earthDistance);
    const xLocal = handLength * Math.cos(-dayAngle);
    const zLocal = handLength * Math.sin(-dayAngle);
    const yLocal = (height - currentHeight) * stretch;
    const c = Math.cos(-orbitAngleNow);
    const s = Math.sin(-orbitAngleNow);
    return {
      x: earthRef.x + c * xLocal + s * zLocal,
      y: earthRef.y + yLocal,
      z: earthRef.z - s * xLocal + c * zLocal
    };
  }

  /**
   * Hour-hand tip at scene height — for sub-day event labels and connectors.
   * @param {number|boolean} [straightenBlendOrLegacyBool] - 0–1 wrapped→straight, or legacy true = full straight
   */
  function parseStraightenBlend(straightenBlendOrLegacyBool) {
    let b = 0;
    if (typeof straightenBlendOrLegacyBool === 'number' && !isNaN(straightenBlendOrLegacyBool)) {
      b = Math.min(1, Math.max(0, straightenBlendOrLegacyBool));
    } else if (straightenBlendOrLegacyBool === true) {
      b = 1;
    }
    return b;
  }

  /**
   * Approximate wall-clock instant from a scene height (for connectors / legacy height-only callers).
   */
  function approxDateFromSceneHeight(height, refDate, calculateDateHeightFn) {
    if (!refDate || !calculateDateHeightFn || typeof height !== 'number') return refDate || new Date();
    const refH = heightForDate(refDate, calculateDateHeightFn);
    if (refH == null || isNaN(refH)) return refDate;
    const HY = HEIGHT_PER_YEAR;
    const deltaH = height - refH;
    const msPerYear = 365.25 * 24 * 3600000;
    return new Date(refDate.getTime() + (deltaH / HY) * msPerYear);
  }

  /**
   * One point on the daily disk: calendar day fixed at local noon for center; angle from wall-clock time.
   */
  function diskPointWrappedAtDate(date, r, currentHeight, calculateDateHeightFn) {
    if (!SceneGeometry || !date || !calculateDateHeightFn) return null;
    const y = date.getFullYear();
    const mo = date.getMonth();
    const d = date.getDate();
    const hNoon = calculateDateHeightFn(y, mo, d, 12);
    if (hNoon == null || isNaN(hNoon)) return null;
    const stretch =
      typeof global.getCircadianHelixYStretchMult === 'function' ? global.getCircadianHelixYStretchMult() : 1;
    const ctx = readCircadianSceneTimeContext(currentHeight);
    const orbitRef = ctx.currentDateHeight;
    const timelineRef = ctx.selectedDateHeight;
    const orbitAngle = SceneGeometry.getAngle(hNoon, orbitRef);
    const earthPos0 = SceneGeometry.getPosition3D(hNoon, orbitAngle, earthDistance);
    const earthPos = {
      x: earthPos0.x,
      y: timelineRef + (hNoon - timelineRef) * stretch,
      z: earthPos0.z
    };
    if (ctx.selectedDate && sameLocalCalendarDay(date, ctx.selectedDate) &&
        Number.isFinite(ctx.earthX) && Number.isFinite(ctx.earthZ)) {
      earthPos.x = ctx.earthX;
      earthPos.z = ctx.earthZ;
    }
    const frac =
      (date.getHours() +
        date.getMinutes() / 60 +
        date.getSeconds() / 3600 +
        date.getMilliseconds() / 3600000) /
      HOURS_PER_DAY;
    const dayAngle = frac * Math.PI * 2;
    const sunToEarthAngle = Math.atan2(earthPos.z, earthPos.x);
    const handAngle = sunToEarthAngle - dayAngle;
    return {
      x: earthPos.x + r * Math.cos(handAngle),
      y: earthPos.y,
      z: earthPos.z + r * Math.sin(handAngle)
    };
  }

  function diskPointStraightAtDate(date, r, currentHeight, calculateDateHeightFn) {
    if (!SceneGeometry || !date || !calculateDateHeightFn) return null;
    const y = date.getFullYear();
    const mo = date.getMonth();
    const d = date.getDate();
    const hNoon = calculateDateHeightFn(y, mo, d, 12);
    if (hNoon == null || isNaN(hNoon)) return null;
    const stretch =
      typeof global.getCircadianHelixYStretchMult === 'function' ? global.getCircadianHelixYStretchMult() : 1;
    const ctx = readCircadianSceneTimeContext(currentHeight);
    const orbitRef = ctx.currentDateHeight;
    const timelineRef = ctx.selectedDateHeight;
    const orbitAngleNow = SceneGeometry.getAngle(timelineRef, orbitRef);
    let earthRef = SceneGeometry.getPosition3D(timelineRef, orbitAngleNow, earthDistance);
    if (Number.isFinite(ctx.earthX) && Number.isFinite(ctx.earthZ)) {
      earthRef = { x: ctx.earthX, y: timelineRef, z: ctx.earthZ };
    }
    const frac =
      (date.getHours() +
        date.getMinutes() / 60 +
        date.getSeconds() / 3600 +
        date.getMilliseconds() / 3600000) /
      HOURS_PER_DAY;
    const dayAngle = frac * Math.PI * 2;
    const xLocal = r * Math.cos(-dayAngle);
    const zLocal = r * Math.sin(-dayAngle);
    const yLocal = (hNoon - timelineRef) * stretch;
    const c = Math.cos(-orbitAngleNow);
    const s = Math.sin(-orbitAngleNow);
    return {
      x: earthRef.x + c * xLocal + s * zLocal,
      y: earthRef.y + yLocal,
      z: earthRef.z - s * xLocal + c * zLocal
    };
  }

  function blendedDiskPointAtDate(date, r, currentHeight, calculateDateHeightFn, blend) {
    const b = parseStraightenBlend(blend);
    const pW = diskPointWrappedAtDate(date, r, currentHeight, calculateDateHeightFn);
    const pS = diskPointStraightAtDate(date, r, currentHeight, calculateDateHeightFn);
    if (!pW) return pS;
    if (!pS) return pW;
    const om = 1 - b;
    return {
      x: pW.x * om + pS.x * b,
      y: pW.y * om + pS.y * b,
      z: pW.z * om + pS.z * b
    };
  }

  function getWrappedHandTipAtHeight(height, currentHeight, straightenBlendOrLegacyBool) {
    if (!SceneGeometry || !SceneGeometry.getAngle || !SceneGeometry.getPosition3D || typeof height !== 'number') {
      return null;
    }
    const b = parseStraightenBlend(straightenBlendOrLegacyBool);
    const ref =
      typeof global.getSelectedDateTime === 'function' ? global.getSelectedDateTime() : new Date();
    if (typeof calculateDateHeight !== 'function') {
      const pW = tipWrappedAtHeight(height, currentHeight);
      const pS = tipStraightAtHeight(height, currentHeight);
      const om = 1 - b;
      return { x: pW.x * om + pS.x * b, y: pW.y * om + pS.y * b, z: pW.z * om + pS.z * b };
    }
    const d = approxDateFromSceneHeight(height, ref, calculateDateHeight);
    return blendedDiskPointAtDate(d, handLength, currentHeight, calculateDateHeight, b);
  }

  function getHandLength() {
    return handLength;
  }

  /**
   * Scene height (year fraction) for a wall-clock instant — same resolution as event worldlines.
   */
  function heightForDate(date, calculateDateHeightFn) {
    if (!date || !calculateDateHeightFn) return null;
    const frac =
      date.getHours() +
      date.getMinutes() / 60 +
      date.getSeconds() / 3600 +
      date.getMilliseconds() / 3600000;
    return calculateDateHeightFn(date.getFullYear(), date.getMonth(), date.getDate(), frac);
  }

  /**
   * Inner/outer polylines on per-day disks (concentric arcs). Same calendar day shares one disk center (local noon).
   * @param {Date} start
   * @param {Date} end
   * @param {number} rIn
   * @param {number} rOut
   * @param {number} currentHeight
   * @param {function(number,number,number,number):number} calculateDateHeightFn
   * @param {number} segments
   * @param {number|boolean} [straightenBlendOrLegacyBool]
   * @returns {{ innerFlat: number[], outerFlat: number[] }|null}
   */
  function buildDiskRibbonBetween(start, end, rIn, rOut, currentHeight, calculateDateHeightFn, segments, straightenBlendOrLegacyBool) {
    if (
      !SceneGeometry ||
      typeof calculateDateHeightFn !== 'function' ||
      !start ||
      !end ||
      !(end > start) ||
      !(rOut > rIn)
    ) {
      return null;
    }
    const t0 = start.getTime();
    const t1 = end.getTime();
    const n = Math.max(4, Math.min(64, segments != null ? Math.round(segments) : Math.ceil((t1 - t0) / (3600000 / 2))));
    const innerFlat = [];
    const outerFlat = [];
    const blend = parseStraightenBlend(straightenBlendOrLegacyBool);

    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const tMs = t0 + (t1 - t0) * u;
      const d = new Date(tMs);
      const pi = blendedDiskPointAtDate(d, rIn, currentHeight, calculateDateHeightFn, blend);
      const po = blendedDiskPointAtDate(d, rOut, currentHeight, calculateDateHeightFn, blend);
      if (!pi || !po) continue;
      innerFlat.push(pi.x, pi.y, pi.z);
      outerFlat.push(po.x, po.y, po.z);
    }
    if (innerFlat.length < 6) return null;
    return { innerFlat, outerFlat };
  }

  /**
   * Legacy helix ribbon (spiral hour-hand). Kept for callers/tests; main UI uses {@link buildDiskRibbonBetween}.
   */
  function buildHelixRibbonBetween(start, end, currentHeight, calculateDateHeightFn, segments, straightenBlendOrLegacyBool) {
    const halfRadial = Math.max(handLength * 0.028, 0.18);
    const rIn = Math.max(handLength * 0.72, handLength - halfRadial);
    const rOut = handLength + halfRadial;
    return buildDiskRibbonBetween(start, end, rIn, rOut, currentHeight, calculateDateHeightFn, segments, straightenBlendOrLegacyBool);
  }

  /**
   * One closed loop per calendar day: disk rim guide in world space.
   */
  function createDayDiskOutlinesGroup(currentHeight, options) {
    if (!SceneGeometry || !global.THREE || typeof calculateDateHeight !== 'function') return null;
    const THREE = global.THREE;
    const spanDays = options && options.spanDays != null ? options.spanDays : 2;
    const rimR = (options && options.rimRadius != null) ? options.rimRadius : handLength * 1.08;
    const segmentsPerLoop = 72;
    const st = readCircadianHelixStyle();
    const group = new THREE.Group();
    group.userData = { circadianDayDisksAnim: true, spanDays, rimRadius: rimR, segmentsPerLoop };
    const mat = new THREE.LineBasicMaterial({
      color: st.helixColor != null ? st.helixColor : 0xffaa44,
      transparent: true,
      opacity: st.helixOpacity != null ? st.helixOpacity * 0.92 : 0.72,
      depthWrite: false
    });
    for (let i = 0; i < spanDays; i++) {
      const loop = new THREE.LineLoop(new THREE.BufferGeometry(), mat.clone());
      loop.userData.circadianDayDiskLoop = true;
      loop.userData.daySlotIndex = i;
      group.add(loop);
    }
    disableDecorationRaycast(group);
    const blend =
      typeof global.getCircadianStraightenBlend === 'function' ? global.getCircadianStraightenBlend() : 0;
    const centerDate =
      typeof global.getSelectedDateTime === 'function' ? global.getSelectedDateTime() : new Date();
    refreshDayDiskOutlinesGroup(group, blend, currentHeight, centerDate, spanDays, rimR, segmentsPerLoop);
    return group;
  }

  function refreshDayDiskOutlinesGroup(group, straightenBlend, currentHeight, centerDate, spanDays, rimRadius, segmentsPerLoop) {
    if (!group || !group.userData || !group.userData.circadianDayDisksAnim || !calculateDateHeight || !global.THREE) {
      return;
    }
    const rimR = rimRadius != null ? rimRadius : group.userData.rimRadius || handLength * 1.08;
    const nSeg = segmentsPerLoop != null ? segmentsPerLoop : group.userData.segmentsPerLoop || 72;
    const span = spanDays != null ? spanDays : group.userData.spanDays || 2;
    const cd = centerDate instanceof Date ? new Date(centerDate.getTime()) : new Date();
    const halfLo = Math.floor(span / 2);
    const halfHi = span - halfLo;
    const blend = parseStraightenBlend(straightenBlend);
    let childIdx = 0;
    for (let k = -halfLo; k < halfHi; k++) {
      const d0 = new Date(cd.getFullYear(), cd.getMonth(), cd.getDate() + k, 0, 0, 0, 0);
      const flat = [];
      for (let s = 0; s < nSeg; s++) {
        const frac = s / nSeg;
        const d = new Date(d0.getTime() + frac * MS_PER_DAY);
        const p = blendedDiskPointAtDate(d, rimR, currentHeight, calculateDateHeight, blend);
        if (p) flat.push(p.x, p.y, p.z);
      }
      const loop = group.children[childIdx];
      childIdx++;
      if (!loop || !loop.geometry) continue;
      if (flat.length < 9) continue;
      const pos = loop.geometry.getAttribute('position');
      if (!pos || pos.array.length !== flat.length) {
        if (loop.geometry) loop.geometry.dispose();
        loop.geometry = new global.THREE.BufferGeometry();
        loop.geometry.setAttribute('position', new global.THREE.Float32BufferAttribute(new Float32Array(flat), 3));
      } else {
        for (let i = 0; i < flat.length; i++) pos.array[i] = flat[i];
        pos.needsUpdate = true;
      }
      loop.geometry.computeBoundingSphere();
      const stOp = readCircadianHelixStyle();
      let opRing = stOp.helixOpacity != null ? stOp.helixOpacity * 0.92 : 0.72;
      const zlDisk = typeof global.getCurrentZoomLevel === 'function' ? global.getCurrentZoomLevel() : 5;
      if (sameLocalCalendarDay(d0, cd)) {
        opRing *= zlDisk === 0 ? 0.52 : 1;
      } else {
        opRing *= zlDisk === 0 ? 0.11 : 0.3;
      }
      if (loop.material && typeof loop.material.opacity === 'number') {
        loop.material.opacity = Math.max(0.035, Math.min(1, opRing));
      }
    }
  }

  const CircadianRenderer = {
    init,
    create,
    createAnimatedHelixLine,
    refreshCircadianHelixLine,
    buildCircadianHelixPoints,
    buildStraightenedHelixPointsWorld,
    createWrappedHelix,
    createStraightenedHelix,
    getWrappedHandTipAtHeight,
    getHandLength,
    buildHelixRibbonBetween,
    buildDiskRibbonBetween,
    blendedDiskPointAtDate,
    createDayDiskOutlinesGroup,
    refreshDayDiskOutlinesGroup,
    heightForDate,
    createHelixStructureMarkersGroup,
    refreshHelixStructureMarkersGroup
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = CircadianRenderer;
  } else {
    global.CircadianRenderer = CircadianRenderer;
  }
})(typeof window !== 'undefined' ? window : this);
