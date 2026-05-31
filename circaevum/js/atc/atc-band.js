/**
 * Autocatalytic Thermodynamic Coherence (ATC) — seven radial bands on the day disk.
 *
 * Band 0 = highest friction / metabolic load (closest to Earth).
 * Band 6 = lowest friction / inner sky (furthest on the disk annulus).
 *
 * Deep sleep is band 1 (parasympathetic recovery) — not band 0 (hard workout).
 */
(function (global) {
  const BAND_COUNT = 7;
  /** Fill above EarthDaylightSky (7); borders at 11; below timeseries tubes (12). */
  const GUIDE_FILL_RENDER_ORDER = 10;
  const GUIDE_BORDER_RENDER_ORDER = 11;
  /** Pad past globe surface so rings never sit inside the Earth shell. */
  const EARTH_OCCLUDE_PAD = 1.025;

  /** @type {Array<{ id: number, key: string, name: string, hint: string, color: string }>} */
  const BANDS = [
    { id: 0, key: 'lithosphere', name: 'Lithosphere', hint: 'Hard workout, max output', color: '#ff4d3a' },
    { id: 1, key: 'troposphere', name: 'Troposphere', hint: 'Eat, chores, deep sleep recovery', color: '#ff8a4a' },
    { id: 2, key: 'boundary', name: 'Boundary', hint: 'Social, commute, light movement', color: '#ffc14a' },
    { id: 3, key: 'stratosphere', name: 'Stratosphere', hint: 'Mixed work, light sleep', color: '#9ed84a' },
    { id: 4, key: 'mesosphere', name: 'Mesosphere', hint: 'Deep cognitive work', color: '#4ad8a8' },
    { id: 5, key: 'thermosphere', name: 'Thermosphere', hint: 'Meditation, rest, breath', color: '#4ab8ff' },
    { id: 6, key: 'exosphere', name: 'Exosphere', hint: 'REM, dream edges', color: '#b46cff' },
  ];

  const SLEEP_STAGE_BAND = {
    deep: 1,
    light: 3,
    rem: 6,
    awake: 2,
    unknown: 3,
  };

  let lastGuideRefreshKey = '';

  /** Garmin sleep stage → ATC band (recovery ≠ workout). */
  function sleepStageToBand(stage) {
    const s = String(stage || 'unknown').toLowerCase();
    return SLEEP_STAGE_BAND[s] != null ? SLEEP_STAGE_BAND[s] : SLEEP_STAGE_BAND.unknown;
  }

  /** Resting → exertion maps outward on the disk (band 5 → 0). */
  function bpmToBand(bpm) {
    const b = typeof bpm === 'number' && isFinite(bpm) ? bpm : 0;
    if (b <= 0) return 5;
    if (b < 60) return 5;
    if (b < 80) return 4;
    if (b < 100) return 3;
    if (b < 120) return 2;
    if (b < 140) return 1;
    return 0;
  }

  function clampBand(b) {
    const n = typeof b === 'number' && isFinite(b) ? Math.round(b) : 3;
    return Math.max(0, Math.min(BAND_COUNT - 1, n));
  }

  function handLen() {
    if (global.CircadianRenderer && typeof global.CircadianRenderer.getHandLength === 'function') {
      const h = global.CircadianRenderer.getHandLength();
      if (typeof h === 'number' && isFinite(h) && h > 0) return h;
    }
    return 4.5;
  }

  /** Shared annulus: band 0 hugs Earth-side, band 6 toward hour ticks. */
  function bandRadiusFactors() {
    return { rMin: 0.40, rMax: 0.88 };
  }

  function bandToRadius(band, handOverride) {
    const h = handOverride != null ? handOverride : handLen();
    const b = clampBand(band);
    const { rMin, rMax } = bandRadiusFactors();
    const t = b / (BAND_COUNT - 1);
    return h * (rMin + (rMax - rMin) * t);
  }

  /** Annulus between adjacent band nominal radii (matches sleep/HR placement). */
  function bandZoneRadii(b) {
    const h = handLen();
    const { rMin, rMax } = bandRadiusFactors();
    const rInner = b === 0 ? h * rMin : (bandToRadius(b - 1) + bandToRadius(b)) / 2;
    const rOuter = b === BAND_COUNT - 1 ? h * rMax : (bandToRadius(b) + bandToRadius(b + 1)) / 2;
    return { rInner, rOuter };
  }

  function readSkyRotationY(place) {
    if (!place || !Number.isFinite(place.earthX) || !Number.isFinite(place.earthZ)) return 0;
    const sunToEarth = Math.atan2(place.earthZ, place.earthX);
    const noonAz = sunToEarth - Math.PI;
    return Math.PI / 2 - noonAz;
  }

  function hexToNum(hex) {
    if (typeof hex !== 'string') return 0x8899aa;
    const s = hex.replace('#', '');
    const n = parseInt(s, 16);
    return Number.isFinite(n) ? n : 0x8899aa;
  }

  /** Keyword rules for calendar categories / summaries (phase A — visual band only). */
  const CATEGORY_RULES = [
    { re: /\b(run|workout|fitness|gym|crossfit|hiit|cycle|cycling|swim|hike|sport|training)\b/i, band: 0 },
    { re: /\b(eat|meal|breakfast|lunch|dinner|snack|nutrition|shower|chore)\b/i, band: 1 },
    { re: /\b(coffee|walk|social|party|hang|friend|family|call)\b/i, band: 2 },
    { re: /\b(meeting|email|admin|standup|sync|errand)\b/i, band: 3 },
    { re: /\b(deep work|focus|code|write|study|research|design)\b/i, band: 4 },
    { re: /\b(meditat|mindful|breath|yoga|rest|nap|relax|prayer)\b/i, band: 5 },
    { re: /\b(sleep|rem|dream)\b/i, band: 6 },
  ];

  function resolveEventBand(event) {
    if (!event) return 3;
    const explicit = event.atc && event.atc.band;
    if (typeof explicit === 'number' && isFinite(explicit)) return clampBand(explicit);
    if (event.render && event.render.kind === 'timeseries') {
      if (event.render.metric === 'sleepStage') return sleepStageToBand('light');
      if (event.render.metric === 'hr') return 3;
    }
    const hay = [
      event.category,
      event.summary,
      event.title,
      event.description,
    ].filter(Boolean).join(' ');
    for (let i = 0; i < CATEGORY_RULES.length; i++) {
      if (CATEGORY_RULES[i].re.test(hay)) return CATEGORY_RULES[i].band;
    }
    return 3;
  }

  function buildFlatRingPositions(radius, segments) {
    const n = segments != null ? segments : 32;
    const flat = [];
    for (let s = 0; s <= n; s++) {
      const t = (s / n) * Math.PI * 2;
      flat.push(Math.cos(t) * radius, 0, Math.sin(t) * radius);
    }
    return flat;
  }

  function disableRaycast(root) {
    if (!root) return;
    root.raycast = function () {};
    if (root.children) root.children.forEach(disableRaycast);
  }

  function isGuideVisible() {
    if (typeof global.getAtcGuideRingsVisible === 'function') {
      return !!global.getAtcGuideRingsVisible();
    }
    const zl = typeof global.getCurrentZoomLevel === 'function' ? global.getCurrentZoomLevel() : 8;
    return zl === 0 || zl === 8 || zl === 9;
  }

  function shiftActive() {
    return typeof global.getCircadianShortEventsShiftPreview === 'function'
      ? !!global.getCircadianShortEventsShiftPreview()
      : false;
  }

  function guideOpacityMul() {
    const zl = typeof global.getCurrentZoomLevel === 'function' ? global.getCurrentZoomLevel() : 8;
    const shift = shiftActive();
    let op = shift ? 0.52 : 0.42;
    if (zl === 0) op *= 0.88;
    return Math.max(0.18, Math.min(0.68, op));
  }

  function guideFillOpacity(mul) {
    return Math.max(0.06, Math.min(0.22, mul * 0.26));
  }

  function guideBorderOpacity(mul) {
    return Math.max(0.32, Math.min(0.82, mul * 1.35));
  }

  function buildGuideRefreshKey(straightenBlend, centerDate) {
    const cd = centerDate instanceof Date ? centerDate : new Date();
    const blendQ = Math.round((straightenBlend != null ? straightenBlend : 0) * 5);
    const dayKey = cd.getFullYear() + '-' + cd.getMonth() + '-' + cd.getDate();
    return blendQ + ':' + dayKey + ':' + (shiftActive() ? 1 : 0);
  }

  function resetGuideCache() {
    lastGuideRefreshKey = '';
  }

  function readDayDiskPlacement(currentHeight, centerDate) {
    let ctx = null;
    if (typeof global.getCircadianSceneTimeContext === 'function') {
      ctx = global.getCircadianSceneTimeContext();
    }
    const timelineRef = ctx && ctx.selectedDateHeight != null && !isNaN(ctx.selectedDateHeight)
      ? ctx.selectedDateHeight
      : currentHeight;
    let earthX = ctx && Number.isFinite(ctx.earthX) ? ctx.earthX : NaN;
    let earthZ = ctx && Number.isFinite(ctx.earthZ) ? ctx.earthZ : NaN;
    const refH = ctx && ctx.currentDateHeight != null ? ctx.currentDateHeight : currentHeight;
    if ((!Number.isFinite(earthX) || !Number.isFinite(earthZ)) &&
        global.SceneGeometry && typeof global.SceneGeometry.getAngle === 'function' &&
        typeof global.SceneGeometry.getPosition3D === 'function') {
      const orbitAngle = global.SceneGeometry.getAngle(timelineRef, refH);
      let earthDistance = 50;
      if (global.PLANET_DATA) {
        const earth = global.PLANET_DATA.find((p) => p.name === 'Earth');
        if (earth && earth.distance) earthDistance = earth.distance;
      }
      const ep = global.SceneGeometry.getPosition3D(timelineRef, orbitAngle, earthDistance);
      earthX = ep.x;
      earthZ = ep.z;
    }
    return { earthX, earthY: timelineRef, earthZ };
  }

  function readEarthGlobeRadius() {
    if (typeof global.getEarthGlobeSurfaceRadius === 'function') {
      const r = global.getEarthGlobeSurfaceRadius(null);
      if (typeof r === 'number' && isFinite(r) && r > 0) return r;
    }
    return 1.95;
  }

  /** Keep annuli outside the Earth sphere (XZ); return null if band is fully occluded. */
  function bandRadiiForGuide(b) {
    const { rInner, rOuter } = bandZoneRadii(b);
    const earthR = readEarthGlobeRadius() * EARTH_OCCLUDE_PAD;
    const rIn = Math.max(rInner, earthR);
    if (rOuter <= rIn + 1e-4) return null;
    return { rInner: rIn, rOuter };
  }

  function guideMaterial(THREE, color, opacity) {
    return new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
  }

  /**
   * ATC band fills + rim borders on the selected day disk (sky zooms only).
   * Mesh rings (not LineLoop) so borders stay visible over the sky canvas.
   */
  function createGuideGroup(currentHeight, options) {
    if (!global.THREE) return null;
    const THREE = global.THREE;
    const segments = 48;
    const h = handLen();
    const stroke = Math.max(0.04, h * 0.016);
    const group = new THREE.Group();
    group.userData = { atcGuideAnim: true, atcGuideVersion: 3, segmentsPerLoop: segments, yLift: h * 0.008 };

    for (let b = 0; b < BAND_COUNT; b++) {
      const band = BANDS[b];
      const color = hexToNum(band.color);
      const radii = bandRadiiForGuide(b);
      if (!radii) continue;
      const { rInner, rOuter } = radii;

      const fillGeo = new THREE.RingGeometry(rInner, rOuter, segments);
      fillGeo.rotateX(-Math.PI / 2);
      const fill = new THREE.Mesh(fillGeo, guideMaterial(THREE, color, 0.12));
      fill.renderOrder = GUIDE_FILL_RENDER_ORDER;
      fill.userData.atcGuideBand = b;
      fill.userData.atcGuidePart = 'fill';
      group.add(fill);

      const borderInner = Math.max(rInner, rOuter - stroke);
      const borderGeo = new THREE.RingGeometry(borderInner, rOuter, segments);
      borderGeo.rotateX(-Math.PI / 2);
      const border = new THREE.Mesh(borderGeo, guideMaterial(THREE, color, 0.58));
      border.renderOrder = GUIDE_BORDER_RENDER_ORDER;
      border.userData.atcGuideBand = b;
      border.userData.atcGuidePart = 'border';
      group.add(border);
    }

    const innerRadii = bandRadiiForGuide(0);
    if (innerRadii) {
      const innerEdge = innerRadii.rInner;
      const innerGeo = new THREE.RingGeometry(innerEdge, innerEdge + stroke, segments);
      innerGeo.rotateX(-Math.PI / 2);
      const innerBorder = new THREE.Mesh(
        innerGeo,
        guideMaterial(THREE, hexToNum(BANDS[0].color), 0.58)
      );
      innerBorder.renderOrder = GUIDE_BORDER_RENDER_ORDER;
      innerBorder.userData.atcGuideBand = 0;
      innerBorder.userData.atcGuidePart = 'innerBorder';
      group.add(innerBorder);
    }

    disableRaycast(group);
    refreshGuideGroup(
      group,
      typeof global.getCircadianStraightenBlend === 'function' ? global.getCircadianStraightenBlend() : 0,
      currentHeight,
      typeof global.getSelectedDateTime === 'function' ? global.getSelectedDateTime() : new Date()
    );
    return group;
  }

  function refreshGuideGroup(group, straightenBlend, currentHeight, centerDate) {
    if (!group || !group.userData || !group.userData.atcGuideAnim) return;
    if (!isGuideVisible()) {
      group.visible = false;
      return;
    }
    group.visible = true;
    const key = buildGuideRefreshKey(straightenBlend, centerDate);
    const place = readDayDiskPlacement(currentHeight, centerDate);
    const yLift = group.userData.yLift != null ? group.userData.yLift : 0;
    const rotY = readSkyRotationY(place);
    group.position.set(place.earthX, place.earthY + yLift, place.earthZ);
    group.rotation.set(0, rotY, 0);
    if (key === lastGuideRefreshKey && group.children.length > 0) {
      return;
    }
    lastGuideRefreshKey = key;
    const opMul = guideOpacityMul();
    const fillOp = guideFillOpacity(opMul);
    const borderOp = guideBorderOpacity(opMul);
    for (let i = 0; i < group.children.length; i++) {
      const part = group.children[i];
      if (!part || !part.material) continue;
      const kind = part.userData && part.userData.atcGuidePart;
      if (kind === 'fill') part.material.opacity = fillOp;
      else part.material.opacity = borderOp;
    }
  }

  function renderLegendHtml() {
    const rows = BANDS.map((b) => (
      '<div class="atc-legend-row">' +
      '<span class="atc-legend-swatch" style="background:' + b.color + '"></span>' +
      '<span class="atc-legend-label"><strong>' + b.name + '</strong>' +
      '<span class="atc-legend-hint">' + b.hint + '</span></span>' +
      '</div>'
    )).join('');
    return (
      '<div class="atc-legend">' +
      '<div class="calendar-layers-section-title">ATC bands</div>' +
      '<p class="atc-legend-intro">Earth → sky: load &amp; friction. Sleep crosses bands each night.</p>' +
      rows +
      '</div>'
    );
  }

  const AtcBand = {
    BAND_COUNT,
    BANDS,
    sleepStageToBand,
    bpmToBand,
    clampBand,
    bandToRadius,
    bandRadiusFactors,
    resolveEventBand,
    createGuideGroup,
    refreshGuideGroup,
    resetGuideCache,
    renderLegendHtml,
    hexToNum,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = AtcBand;
  } else {
    global.AtcBand = AtcBand;
  }
})(typeof window !== 'undefined' ? window : this);
