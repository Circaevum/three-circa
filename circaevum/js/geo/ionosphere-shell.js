/**
 * Ionosphere shells on the Earth globe — altitude to scale (km → scene radius).
 * D / E / F1 mostly day-side; F2 persists weakly at night. Hemispheric fade via sun direction.
 */
(function (global) {
  const EARTH_RADIUS_KM = 6371;
  const SHELL_SEGMENTS = 40;

  /** Chapman-style layers: inner/outer km above sea level. */
  const IONO_LAYERS = [
    {
      key: 'D',
      name: 'D layer',
      innerKm: 60,
      outerKm: 90,
      color: [0.45, 0.32, 0.82],
      dayOpacity: 0.55,
      nightOpacity: 0.03,
      dayOnly: true,
    },
    {
      key: 'E',
      name: 'E layer',
      innerKm: 90,
      outerKm: 120,
      color: [0.52, 0.4, 0.95],
      dayOpacity: 0.48,
      nightOpacity: 0.1,
    },
    {
      key: 'F1',
      name: 'F1 layer',
      innerKm: 150,
      outerKm: 210,
      color: [0.62, 0.5, 1.0],
      dayOpacity: 0.44,
      nightOpacity: 0.04,
      dayOnly: true,
    },
    {
      key: 'F2',
      name: 'F2 layer',
      innerKm: 210,
      outerKm: 400,
      color: [0.78, 0.68, 1.0],
      dayOpacity: 0.5,
      nightOpacity: 0.22,
    },
  ];

  /**
   * Neutral weather atmosphere (meteorological layers only, 0–mesopause).
   * Thermosphere / exosphere are diffuse and overlap the ionosphere — not drawn as extra
   * globe shells (see day-disk ATC bands). Ionosphere shells always sit above these outers.
   */
  const NEUTRAL_ATM_LAYERS = [
    { key: 'troposphere', name: 'Troposphere', innerKm: 0, outerKm: 12, color: [0.35, 0.55, 0.75], opacity: 0.1 },
    { key: 'stratosphere', name: 'Stratosphere', innerKm: 12, outerKm: 50, color: [0.4, 0.62, 0.82], opacity: 0.08 },
    { key: 'mesosphere', name: 'Mesosphere', innerKm: 50, outerKm: 85, color: [0.48, 0.58, 0.78], opacity: 0.07 },
  ];

  function areIonosphereShellsEnabled() {
    if (typeof global.GeophysicalShells !== 'undefined' && global.GeophysicalShells.areGeophysicalShellsEnabled) {
      return global.GeophysicalShells.areGeophysicalShellsEnabled();
    }
    return true;
  }

  /** Exaggerate altitude so shells read on the globe (ratios between layers preserved). */
  function getAltitudeVisualGain(globeRadiusScene) {
    const r = typeof globeRadiusScene === 'number' && globeRadiusScene > 0 ? globeRadiusScene : 1.95;
    const targetOuterDelta = r * 0.14;
    const f2OuterKm = 400;
    const physicalDelta = r * (f2OuterKm / EARTH_RADIUS_KM);
    if (physicalDelta < 1e-8) return 12;
    return Math.max(8, Math.min(48, targetOuterDelta / physicalDelta));
  }

  function kmToSceneRadius(globeRadiusScene, altKm, visualGain) {
    const g = typeof visualGain === 'number' && visualGain > 0 ? visualGain : 1;
    return globeRadiusScene * (1 + (altKm * g) / EARTH_RADIUS_KM);
  }

  function isGlobeDetailZoom(zoomLevel) {
    return zoomLevel === 0 || zoomLevel === 8 || zoomLevel === 9;
  }

  function shouldShowIonosphereShells(zoomLevel) {
    if (!areIonosphereShellsEnabled()) return false;
    if (isGlobeDetailZoom(zoomLevel)) return true;
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

  function getSunDirectionWorld(earthGroup) {
    const THREE = global.THREE;
    if (!THREE || !earthGroup) return new THREE.Vector3(0, 1, 0);
    const center = new THREE.Vector3();
    earthGroup.getWorldPosition(center);
    const sun = new THREE.Vector3(0, center.y, 0);
    const dir = sun.sub(center);
    if (dir.lengthSq() < 1e-12) return new THREE.Vector3(0, 1, 0);
    return dir.normalize();
  }

  function createShellMaterial(THREE, layer, isIono) {
    const uniforms = {
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      shellColor: { value: new THREE.Vector3(layer.color[0], layer.color[1], layer.color[2]) },
      dayOpacity: { value: isIono ? layer.dayOpacity : layer.opacity },
      nightOpacity: { value: isIono ? (layer.nightOpacity != null ? layer.nightOpacity : 0.05) : layer.opacity * 0.35 },
      dayOnly: { value: isIono && layer.dayOnly ? 1.0 : 0.0 },
      neutral: { value: isIono ? 0.0 : 1.0 },
    };

    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: [
        'varying vec3 vWorldNormal;',
        'void main() {',
        '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
        '  vWorldNormal = normalize(mat3(modelMatrix) * normal);',
        '  gl_Position = projectionMatrix * mv;',
        '}',
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 sunDir;',
        'uniform vec3 shellColor;',
        'uniform float dayOpacity;',
        'uniform float nightOpacity;',
        'uniform float dayOnly;',
        'uniform float neutral;',
        'varying vec3 vWorldNormal;',
        'void main() {',
        '  float lit = dot(normalize(vWorldNormal), normalize(sunDir));',
        '  float daySide = smoothstep(-0.12, 0.22, lit);',
        '  float op = mix(nightOpacity, dayOpacity, daySide);',
        '  if (dayOnly > 0.5) op *= daySide;',
        '  if (neutral > 0.5) op *= 0.65 + 0.35 * daySide;',
        '  if (op < 0.01) discard;',
        '  gl_FragColor = vec4(shellColor, op);',
        '}',
      ].join('\n'),
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
      blending: THREE.NormalBlending,
    });
    return mat;
  }

  /** Shell surface at physical outer altitude so nested order matches real stack. */
  function shellSceneRadius(globeRadius, layer, visualGain) {
    return kmToSceneRadius(globeRadius, layer.outerKm, visualGain);
  }

  function addShellMesh(group, THREE, globeRadius, layer, isIono, visualGain, renderOrder) {
    const rOuter = shellSceneRadius(globeRadius, layer, visualGain);
    const rInner = kmToSceneRadius(globeRadius, layer.innerKm, visualGain);
    const thickness = Math.max(0.004, rOuter - rInner);
    const geom = new THREE.SphereGeometry(rOuter, SHELL_SEGMENTS, SHELL_SEGMENTS);
    const mat = createShellMaterial(THREE, layer, isIono);
    const mesh = new THREE.Mesh(geom, mat);
    mesh.userData.ionoShell = true;
    mesh.userData.ionoKey = layer.key;
    mesh.userData.isIonoShell = isIono;
    mesh.userData.altOuterKm = layer.outerKm;
    mesh.userData.shellThicknessHint = thickness;
    mesh.renderOrder = typeof renderOrder === 'number' ? renderOrder : 6;
    mesh.raycast = function () {};
    group.add(mesh);
    return mesh;
  }

  function collectShellLayersSorted() {
    const rows = [];
    NEUTRAL_ATM_LAYERS.forEach(function (layer) {
      rows.push({ layer: layer, isIono: false });
    });
    IONO_LAYERS.forEach(function (layer) {
      rows.push({ layer: layer, isIono: true });
    });
    rows.sort(function (a, b) {
      return a.layer.outerKm - b.layer.outerKm;
    });
    return rows;
  }

  function disposeShellMeshes(group) {
    if (!group) return;
    const toRemove = group.children.slice();
    toRemove.forEach(function (child) {
      group.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
  }

  function rebuildShellMeshes(group, earthGroup) {
    const THREE = global.THREE;
    if (!THREE || !group || !earthGroup || !earthGroup.userData) return;
    const globeRadius =
      typeof earthGroup.userData.globeRadius === 'number' ? earthGroup.userData.globeRadius : 1.95;
    const visualGain = getAltitudeVisualGain(globeRadius);
    disposeShellMeshes(group);
    const sorted = collectShellLayersSorted();
    sorted.forEach(function (entry, index) {
      addShellMesh(group, THREE, globeRadius, entry.layer, entry.isIono, visualGain, 6 + index);
    });
    group.userData.visualGain = visualGain;
    group.userData.globeRadius = globeRadius;
  }

  function ensureShellGroup(earthGroup) {
    if (!earthGroup || !earthGroup.userData || !earthGroup.userData.orientGroup) return null;
    const orient = earthGroup.userData.orientGroup;
    const globeRadius =
      typeof earthGroup.userData.globeRadius === 'number' ? earthGroup.userData.globeRadius : 1.95;
    const visualGain = getAltitudeVisualGain(globeRadius);
    let group = earthGroup.userData.ionosphereShellGroup;
    if (group) {
      if (group.userData.visualGain !== visualGain || group.userData.globeRadius !== globeRadius) {
        rebuildShellMeshes(group, earthGroup);
      }
      return group;
    }
    const THREE = global.THREE;
    if (!THREE) return null;
    group = new THREE.Group();
    group.name = 'ionosphere-shells';
    group.userData.ionosphereShellAnim = true;
    rebuildShellMeshes(group, earthGroup);
    orient.add(group);
    earthGroup.userData.ionosphereShellGroup = group;
    return group;
  }

  function refreshShellGroup(earthGroup, date, zoomLevel) {
    if (!areIonosphereShellsEnabled()) {
      const existing =
        earthGroup && earthGroup.userData && earthGroup.userData.ionosphereShellGroup;
      if (existing) existing.visible = false;
      return;
    }
    const group = ensureShellGroup(earthGroup);
    if (!group) return;
    const show = shouldShowIonosphereShells(zoomLevel);
    group.visible = show;
    if (!show) return;

    const sunDir = getSunDirectionWorld(earthGroup);
    group.children.forEach(function (child) {
      if (!child.material || !child.material.uniforms) return;
      child.material.uniforms.sunDir.value.copy(sunDir);
      child.material.uniformsNeedUpdate = true;
    });
  }

  function disposeShellGroup(earthGroup) {
    if (!earthGroup || !earthGroup.userData) return;
    const group = earthGroup.userData.ionosphereShellGroup;
    if (!group) return;
    const orient = earthGroup.userData.orientGroup;
    if (orient) orient.remove(group);
    group.traverse(function (obj) {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
    earthGroup.userData.ionosphereShellGroup = null;
  }

  function renderLegendHtml() {
    const ionoRows = IONO_LAYERS.map(function (layer) {
      const night = layer.dayOnly
        ? 'Gone at night'
        : layer.nightOpacity < 0.12
          ? 'Faint at night'
          : 'Persists at night';
      return (
        '<div class="atc-legend-row">' +
        '<span class="atc-legend-swatch" style="background:rgb(' +
        Math.round(layer.color[0] * 255) +
        ',' +
        Math.round(layer.color[1] * 255) +
        ',' +
        Math.round(layer.color[2] * 255) +
        ')"></span>' +
        '<span class="atc-legend-label"><strong>' +
        layer.name +
        '</strong>' +
        '<span class="atc-legend-hint">' +
        layer.innerKm +
        '–' +
        layer.outerKm +
        ' km · shell at top · ' +
        night +
        '</span></span>' +
        '</div>'
      );
    }).join('');
    const atmRows = NEUTRAL_ATM_LAYERS.map(function (layer) {
      return (
        '<div class="atc-legend-row">' +
        '<span class="atc-legend-swatch" style="background:rgb(' +
        Math.round(layer.color[0] * 255) +
        ',' +
        Math.round(layer.color[1] * 255) +
        ',' +
        Math.round(layer.color[2] * 255) +
        ')"></span>' +
        '<span class="atc-legend-label"><strong>' +
        layer.name +
        '</strong>' +
        '<span class="atc-legend-hint">' +
        layer.innerKm +
        '–' +
        layer.outerKm +
        ' km (neutral air · shell at top altitude)</span></span>' +
        '</div>'
      );
    }).join('');
    return (
      '<div class="atc-legend ionosphere-legend">' +
      '<div class="calendar-layers-section-title">Earth atmosphere & ionosphere</div>' +
      '<p class="atc-legend-intro">Toggle all globe shells with the <strong>concentric-rings icon</strong> in the scene toolbar (G). Zoom to <strong>Day</strong> (8) or Hour (9). Blue = weather air (0–85 km). Purple = ionosphere (60–400 km), always outside blue. Each ring sits at that layer’s <em>top</em> altitude (exaggerated, ratios kept). Thermosphere / exosphere are on the day-disk ATC bands only.</p>' +
      atmRows +
      '<div class="calendar-layers-section-title" style="margin-top:10px">Ionosphere</div>' +
      ionoRows +
      '</div>'
    );
  }

  global.getIonosphereShellsVisible = areIonosphereShellsEnabled;
  global.setIonosphereShellsVisible = function (on) {
    if (typeof global.setGeophysicalShellsVisible === 'function') global.setGeophysicalShellsVisible(on);
  };

  const IonosphereShell = {
    EARTH_RADIUS_KM,
    IONO_LAYERS,
    NEUTRAL_ATM_LAYERS,
    kmToSceneRadius,
    getAltitudeVisualGain,
    areIonosphereShellsEnabled,
    ensureShellGroup,
    refreshShellGroup,
    disposeShellGroup,
    renderLegendHtml,
    isGlobeDetailZoom,
    shouldShowIonosphereShells,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = IonosphereShell;
  } else {
    global.IonosphereShell = IonosphereShell;
  }
})(typeof window !== 'undefined' ? window : this);
