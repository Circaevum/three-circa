/**
 * Circadian Rhythm Worldline Renderer
 *
 * Draws a helix traced by the "hour hand" extending from Earth as it rotates
 * while moving along its orbital path. Two modes:
 * 1. Straightened: helix center aligned with current Earth position; moves with Earth; noon/midnight stay fixed.
 * 2. Wrapped: helix fixed in space around Earth's worldline; each segment shows hour-hand direction at that time.
 *
 * Dependencies: SceneGeometry, calculateDateHeight, PLANET_DATA (Earth), THREE
 */
(function (global) {
  const HOURS_PER_DAY = 24;
  const HEIGHT_PER_YEAR = 100;

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
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const height = startHeight + t * totalHeight;
      const orbitAngle = SceneGeometry.getAngle(height, currentHeight);
      const earthPos = SceneGeometry.getPosition3D(height, orbitAngle, earthDistance);
      const year = Math.floor(height / HEIGHT_PER_YEAR) + 2000;
      const remainder = (height % HEIGHT_PER_YEAR) / HEIGHT_PER_YEAR;
      const dayOfYear = remainder * 365.25;
      const day = Math.floor(dayOfYear);
      const hourFrac = (dayOfYear - day) * HOURS_PER_DAY;
      const dayAngle = (hourFrac / HOURS_PER_DAY) * Math.PI * 2;
      const handAngle = orbitAngle + dayAngle;
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
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const height = startHeight + t * totalHeight;
      const yLocal = height - currentHeight;
      const remainder = ((height % HEIGHT_PER_YEAR) + HEIGHT_PER_YEAR) % HEIGHT_PER_YEAR / HEIGHT_PER_YEAR;
      const dayOfYear = remainder * 365.25;
      const hourFrac = (dayOfYear - Math.floor(dayOfYear)) * HOURS_PER_DAY;
      const dayAngle = (hourFrac / HOURS_PER_DAY) * Math.PI * 2;
      const xLocal = handLength * Math.cos(dayAngle);
      const zLocal = handLength * Math.sin(dayAngle);
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

  const CircadianRenderer = {
    init,
    create,
    buildCircadianHelixPoints,
    createWrappedHelix,
    createStraightenedHelix
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = CircadianRenderer;
  } else {
    global.CircadianRenderer = CircadianRenderer;
  }
})(typeof window !== 'undefined' ? window : this);
