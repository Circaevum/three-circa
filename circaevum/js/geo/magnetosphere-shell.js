/**
 * Magnetosphere on the Earth globe (stylized, display-scaled Earth radii).
 *
 * Frame split (important for obliquity / tilt):
 * - Van Allen belts: child of orientGroup — co-rotate with Earth; torus axis = geomagnetic
 *   dipole (~11.5° from geographic spin axis). Obliquity (23.4°) is already in orientGroup.
 * - Magnetopause & bow shock: child of earthGroup solar-wind frame — aligned to Sun–Earth line,
 *   do NOT spin with Earth's daily rotation (Earth spins inside the magnetosphere).
 */
(function (global) {
  const EARTH_RADIUS_KM = 6371;
  const DEG = Math.PI / 180;
  /**
   * Approx. north geomagnetic pole (Earth-fixed, ~2024; wanders ~50–60 km/yr).
   * Van Allen torus axis = center → this pole, not geographic Y / equator.
   */
  const GEOMAG_NORTH_LAT_DEG = 81.5;
  const GEOMAG_NORTH_LON_DEG = -72.0;

  /** Nominal standoff distances in Earth radii (R_E), sunward / equatorial / tail. */
  const MAGNETOPAUSE_RE = { sunward: 10.5, equatorial: 11.5, tail: 22 };
  const BOW_SHOCK_RE = { sunward: 13.2, equatorial: 14.5, tail: 26 };
  const VAN_ALLEN = {
    inner: { majorRe: 1.55, tubeRe: 0.22 },
    outer: { majorRe: 3.2, tubeRe: 0.38 },
  };

  function areMagnetosphereShellsEnabled() {
    if (typeof global.GeophysicalShells !== 'undefined' && global.GeophysicalShells.areGeophysicalShellsEnabled) {
      return global.GeophysicalShells.areGeophysicalShellsEnabled();
    }
    return true;
  }

  function getSunDirectionWorld(earthGroup) {
    const THREE = global.THREE;
    if (!THREE || !earthGroup) return new THREE.Vector3(1, 0, 0);
    const center = new THREE.Vector3();
    earthGroup.getWorldPosition(center);
    const sun = new THREE.Vector3(0, center.y, 0);
    const dir = sun.sub(center);
    if (dir.lengthSq() < 1e-12) return new THREE.Vector3(1, 0, 0);
    return dir.normalize();
  }

  /** Compress R_E so bow shock fits the day-zoom globe (~2.3× planet radius sunward). */
  function getMagnetosphereVisualGain(globeRadius) {
    const r = typeof globeRadius === 'number' && globeRadius > 0 ? globeRadius : 1.95;
    const targetSunward = r * 2.35;
    const physicalSunward = r * BOW_SHOCK_RE.sunward;
    return Math.max(0.12, Math.min(0.35, targetSunward / physicalSunward));
  }

  function reToSceneRadius(globeRadius, rRe, gain) {
    return globeRadius * rRe * gain;
  }

  function shouldShowMagnetosphereShells(zoomLevel) {
    if (!areMagnetosphereShellsEnabled()) return false;
    if (zoomLevel === 0 || zoomLevel === 8 || zoomLevel === 9) return true;
    if (typeof global.getFocusTargetOverride === 'function' && global.getFocusTargetOverride() === 'earth') {
      return true;
    }
    if (zoomLevel === 5 || zoomLevel === 7) {
      const circ =
        typeof global.getCircadianRhythmState === 'function'
          ? global.getCircadianRhythmState()
          : 'wrapped';
      if (circ !== 'off') return true;
    }
    return false;
  }

  function createFaintShellMaterial(THREE, colorRgb, opacity) {
    return new THREE.MeshBasicMaterial({
      color: new THREE.Color(colorRgb[0], colorRgb[1], colorRgb[2]),
      transparent: true,
      opacity: opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
    });
  }

  function latLonToUnit(latDeg, lonDeg) {
    const lat = latDeg * DEG;
    const lon = lonDeg * DEG;
    const c = Math.cos(lat);
    return { x: c * Math.cos(lon), y: Math.sin(lat), z: c * Math.sin(lon) };
  }

  /** Body Y (geographic north) → geomagnetic dipole axis unit vector. */
  function applyDipoleAxisToGroup(dipoleGroup, THREE) {
    const u = latLonToUnit(GEOMAG_NORTH_LAT_DEG, GEOMAG_NORTH_LON_DEG);
    const from = new THREE.Vector3(0, 1, 0);
    const to = new THREE.Vector3(u.x, u.y, u.z).normalize();
    dipoleGroup.quaternion.setFromUnitVectors(from, to);
  }

  function vanAllenSceneRadius(globeRadius, rRe, gain) {
    return Math.max(globeRadius * 1.15, reToSceneRadius(globeRadius, rRe, gain));
  }

  function addVanAllenBelts(dipoleGroup, THREE, globeRadius, gain) {
    const innerM = vanAllenSceneRadius(globeRadius, VAN_ALLEN.inner.majorRe, gain);
    const innerT = Math.max(globeRadius * 0.1, reToSceneRadius(globeRadius, VAN_ALLEN.inner.tubeRe, gain));
    const outerM = vanAllenSceneRadius(globeRadius, VAN_ALLEN.outer.majorRe, gain);
    const outerT = Math.max(globeRadius * 0.12, reToSceneRadius(globeRadius, VAN_ALLEN.outer.tubeRe, gain));

    const inner = new THREE.Mesh(
      new THREE.TorusGeometry(innerM, innerT, 12, 48),
      createFaintShellMaterial(THREE, [0.95, 0.75, 0.35], 0.22)
    );
    inner.rotation.x = Math.PI / 2;
    inner.userData.magnetoPart = 'van-allen-inner';
    inner.renderOrder = 14;

    const outer = new THREE.Mesh(
      new THREE.TorusGeometry(outerM, outerT, 12, 56),
      createFaintShellMaterial(THREE, [0.55, 0.82, 1.0], 0.18)
    );
    outer.rotation.x = Math.PI / 2;
    outer.userData.magnetoPart = 'van-allen-outer';
    outer.renderOrder = 15;

    dipoleGroup.add(inner, outer);
  }

  function addSolarWindEllipsoid(group, THREE, globeRadius, gain, reSpec, color, opacity, partKey, renderOrder) {
    const sx = reToSceneRadius(globeRadius, reSpec.sunward, gain);
    const sy = reToSceneRadius(globeRadius, reSpec.equatorial, gain);
    const sz = reToSceneRadius(globeRadius, reSpec.tail, gain);
    const base = Math.max(globeRadius * 0.5, Math.min(sx, sy, sz) * 0.15);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(base, 40, 28),
      createFaintShellMaterial(THREE, color, opacity)
    );
    mesh.scale.set(sx / base, sy / base, sz / base);
    mesh.userData.magnetoPart = partKey;
    mesh.renderOrder = renderOrder;
    group.add(mesh);
    return mesh;
  }

  function alignSolarWindFrame(solarGroup, earthGroup) {
    const THREE = global.THREE;
    if (!THREE || !solarGroup || !earthGroup) return;
    const sunWorld = getSunDirectionWorld(earthGroup);
    earthGroup.updateMatrixWorld(true);
    const sunLocal = earthGroup.worldToLocal(sunWorld.clone());
    if (sunLocal.lengthSq() < 1e-12) return;
    sunLocal.normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), sunLocal);
    solarGroup.quaternion.copy(q);
  }

  function buildMagnetosphereGroups(earthGroup) {
    const THREE = global.THREE;
    if (!THREE || !earthGroup || !earthGroup.userData || !earthGroup.userData.orientGroup) return null;
    const orient = earthGroup.userData.orientGroup;
    const globeRadius =
      typeof earthGroup.userData.globeRadius === 'number' ? earthGroup.userData.globeRadius : 1.95;
    const gain = getMagnetosphereVisualGain(globeRadius);

    const root = new THREE.Group();
    root.name = 'magnetosphere-shells';
    root.userData.magnetosphereShellAnim = true;
    root.userData.globeRadius = globeRadius;
    root.userData.visualGain = gain;

    const dipoleGroup = new THREE.Group();
    dipoleGroup.name = 'van-allen-dipole';
    applyDipoleAxisToGroup(dipoleGroup, THREE);
    addVanAllenBelts(dipoleGroup, THREE, globeRadius, gain);
    orient.add(dipoleGroup);
    root.userData.dipoleGroup = dipoleGroup;

    const solarGroup = new THREE.Group();
    solarGroup.name = 'solar-wind-magnetosphere';
    addSolarWindEllipsoid(
      solarGroup,
      THREE,
      globeRadius,
      gain,
      MAGNETOPAUSE_RE,
      [0.45, 0.72, 1.0],
      0.14,
      'magnetopause',
      12
    );
    addSolarWindEllipsoid(
      solarGroup,
      THREE,
      globeRadius,
      gain,
      BOW_SHOCK_RE,
      [1.0, 0.55, 0.32],
      0.1,
      'bow-shock',
      11
    );
    earthGroup.add(solarGroup);
    root.userData.solarGroup = solarGroup;

    alignSolarWindFrame(solarGroup, earthGroup);
    earthGroup.userData.magnetosphereShellRoot = root;
    return root;
  }

  function ensureMagnetosphereShells(earthGroup) {
    if (!earthGroup || !earthGroup.userData) return null;
    const globeRadius =
      typeof earthGroup.userData.globeRadius === 'number' ? earthGroup.userData.globeRadius : 1.95;
    const gain = getMagnetosphereVisualGain(globeRadius);
    let root = earthGroup.userData.magnetosphereShellRoot;
    if (root && root.userData.globeRadius === globeRadius && root.userData.visualGain === gain) {
      return root;
    }
    disposeMagnetosphereShells(earthGroup);
    return buildMagnetosphereGroups(earthGroup);
  }

  function refreshMagnetosphereShells(earthGroup, date, zoomLevel) {
    if (!areMagnetosphereShellsEnabled()) {
      const root = earthGroup && earthGroup.userData && earthGroup.userData.magnetosphereShellRoot;
      if (root && root.userData.dipoleGroup) root.userData.dipoleGroup.visible = false;
      if (root && root.userData.solarGroup) root.userData.solarGroup.visible = false;
      return;
    }
    const root = ensureMagnetosphereShells(earthGroup);
    if (!root) return;
    const show = shouldShowMagnetosphereShells(zoomLevel);
    if (root.userData.dipoleGroup) root.userData.dipoleGroup.visible = show;
    if (root.userData.solarGroup) {
      root.userData.solarGroup.visible = show;
      if (show) alignSolarWindFrame(root.userData.solarGroup, earthGroup);
    }
  }

  function disposeMagnetosphereShells(earthGroup) {
    if (!earthGroup || !earthGroup.userData) return;
    const root = earthGroup.userData.magnetosphereShellRoot;
    if (!root) return;
    const orient = earthGroup.userData.orientGroup;
    if (root.userData.dipoleGroup && orient) orient.remove(root.userData.dipoleGroup);
    if (root.userData.solarGroup) earthGroup.remove(root.userData.solarGroup);
    function disposeTree(obj) {
      if (!obj) return;
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
      if (obj.children) obj.children.forEach(disposeTree);
    }
    if (root.userData.dipoleGroup) disposeTree(root.userData.dipoleGroup);
    if (root.userData.solarGroup) disposeTree(root.userData.solarGroup);
    earthGroup.userData.magnetosphereShellRoot = null;
  }

  function renderLegendHtml() {
    return (
      '<div class="atc-legend magnetosphere-legend">' +
      '<div class="calendar-layers-section-title">Magnetosphere (Earth radii, stylized)</div>' +
      '<p class="atc-legend-intro">' +
      '<strong>Obliquity (23.4°)</strong> tilts the spin axis vs orbit (seasons) — already in the globe. ' +
      '<strong>Magnetic dipole</strong> (~11° off geographic north, pole near 81°N 72°W) — Van Allen torus follows that axis, not the equator. ' +
      '<strong>Sun–Earth line</strong> sets bow shock & magnetopause (dayside compressed, nightside tail); they stay sunward while Earth spins inside.</p>' +
      '<div class="atc-legend-row">' +
      '<span class="atc-legend-swatch" style="background:rgb(242,191,89)"></span>' +
      '<span class="atc-legend-label"><strong>Van Allen belts</strong>' +
      '<span class="atc-legend-hint">~1.6–4 R_E · magnetic axis (≠ equator) · spins with Earth</span></span></div>' +
      '<div class="atc-legend-row">' +
      '<span class="atc-legend-swatch" style="background:rgb(115,184,255)"></span>' +
      '<span class="atc-legend-label"><strong>Magnetopause</strong>' +
      '<span class="atc-legend-hint">~10.5 R_E sunward · ~22 R_E tail (display scaled)</span></span></div>' +
      '<div class="atc-legend-row">' +
      '<span class="atc-legend-swatch" style="background:rgb(255,140,82)"></span>' +
      '<span class="atc-legend-label"><strong>Bow shock</strong>' +
      '<span class="atc-legend-hint">~13 R_E sunward · solar-wind frame, not daily spin</span></span></div>' +
      '</div>'
    );
  }

  global.getMagnetosphereShellsVisible = areMagnetosphereShellsEnabled;
  global.setMagnetosphereShellsVisible = function (on) {
    if (typeof global.setGeophysicalShellsVisible === 'function') global.setGeophysicalShellsVisible(on);
  };

  const MagnetosphereShell = {
    EARTH_RADIUS_KM,
    GEOMAG_NORTH_LAT_DEG,
    GEOMAG_NORTH_LON_DEG,
    MAGNETOPAUSE_RE,
    BOW_SHOCK_RE,
    VAN_ALLEN,
    areMagnetosphereShellsEnabled,
    ensureMagnetosphereShells,
    refreshMagnetosphereShells,
    disposeMagnetosphereShells,
    renderLegendHtml,
    shouldShowMagnetosphereShells,
    getMagnetosphereVisualGain,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = MagnetosphereShell;
  } else {
    global.MagnetosphereShell = MagnetosphereShell;
  }
})(typeof window !== 'undefined' ? window : this);
