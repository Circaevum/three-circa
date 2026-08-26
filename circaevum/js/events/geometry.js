// @ts-check
/**
 * events/geometry.js — ribbon/tube geometry helpers
 * Split from renderers/event-renderer.js:3473-4430.
 * - createRibbonBufferFromFlatArrays delegates to RibbonGeometry.fromInnerOuter (cheaper than TubeGeometry Frenet)
 * - buildHelixPair creates inner/outer helical flats via SceneGeometry
 * - chordLenAlongInner, sampleRibbonSurfaceFrame for label placement
 */
(function (global) {
  function createRibbonBufferFromFlatArrays(innerFlat, outerFlat) {
    if (typeof global.RibbonGeometry !== 'undefined' && global.RibbonGeometry.fromInnerOuter) {
      return global.RibbonGeometry.fromInnerOuter(innerFlat, outerFlat, {
        THREE: global.THREE,
        ribbonEdgeAttr: true,
        computeNormals: false
      });
    }
    const n = innerFlat.length / 3;
    if (n < 2 || innerFlat.length !== outerFlat.length) return null;
    const pos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      pos[i * 6] = innerFlat[i * 3]; pos[i * 6 + 1] = innerFlat[i * 3 + 1]; pos[i * 6 + 2] = innerFlat[i * 3 + 2];
      pos[i * 6 + 3] = outerFlat[i * 3]; pos[i * 6 + 4] = outerFlat[i * 3 + 1]; pos[i * 6 + 5] = outerFlat[i * 3 + 2];
    }
    const idx = [];
    for (let i = 0; i < n - 1; i++) { const a = 2 * i; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const geo = new global.THREE.BufferGeometry();
    geo.setIndex(idx);
    geo.setAttribute('position', new global.THREE.BufferAttribute(pos, 3));
    const ribbonEdge = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { ribbonEdge[i * 2] = 0; ribbonEdge[i * 2 + 1] = 1; }
    geo.setAttribute('ribbonEdge', new global.THREE.BufferAttribute(ribbonEdge, 1));
    return geo;
  }

  function buildHelixPair(startHeight, endHeight, rInner, rOuter, currentHeight, segments) {
    let innerFlat, outerFlat;
    if (typeof SceneGeometry !== 'undefined' && SceneGeometry.createEarthHelicalCurve) {
      innerFlat = SceneGeometry.createEarthHelicalCurve(startHeight, endHeight, rInner, currentHeight, segments);
      outerFlat = SceneGeometry.createEarthHelicalCurve(startHeight, endHeight, rOuter, currentHeight, segments);
    } else {
      const angle0 = typeof SceneGeometry !== 'undefined' && SceneGeometry.getAngle ? SceneGeometry.getAngle(startHeight, currentHeight) : 0;
      const angle1 = typeof SceneGeometry !== 'undefined' && SceneGeometry.getAngle ? SceneGeometry.getAngle(endHeight, currentHeight) : angle0;
      const p0i = SceneGeometry && SceneGeometry.getPosition3D ? SceneGeometry.getPosition3D(startHeight, angle0, rInner) : { x: Math.cos(angle0) * rInner, y: startHeight, z: Math.sin(angle0) * rInner };
      const p1i = SceneGeometry && SceneGeometry.getPosition3D ? SceneGeometry.getPosition3D(endHeight, angle1, rInner) : { x: Math.cos(angle1) * rInner, y: endHeight, z: Math.sin(angle1) * rInner };
      const p0o = SceneGeometry && SceneGeometry.getPosition3D ? SceneGeometry.getPosition3D(startHeight, angle0, rOuter) : { x: Math.cos(angle0) * rOuter, y: startHeight, z: Math.sin(angle0) * rOuter };
      const p1o = SceneGeometry && SceneGeometry.getPosition3D ? SceneGeometry.getPosition3D(endHeight, angle1, rOuter) : { x: Math.cos(angle1) * rOuter, y: endHeight, z: Math.sin(angle1) * rOuter };
      innerFlat = [p0i.x, p0i.y, p0i.z, p1i.x, p1i.y, p1i.z];
      outerFlat = [p0o.x, p0o.y, p0o.z, p1o.x, p1o.y, p1o.z];
    }
    return { innerFlat, outerFlat };
  }

  function chordLenAlongInner(innerFlat, i0, i1) {
    if (!innerFlat || i0 < 0 || i1 >= innerFlat.length / 3) return 0;
    let len = 0;
    for (let i = i0; i < i1; i++) {
      const ax = innerFlat[i * 3], ay = innerFlat[i * 3 + 1], az = innerFlat[i * 3 + 2];
      const bx = innerFlat[(i + 1) * 3], by = innerFlat[(i + 1) * 3 + 1], bz = innerFlat[(i + 1) * 3 + 2];
      const dx = bx - ax, dy = by - ay, dz = bz - az;
      len += Math.hypot(dx, dy, dz);
    }
    return len;
  }

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
    const tW = tAlongWidth != null && isFinite(tAlongWidth) ? Math.max(0, Math.min(1, Number(tAlongWidth))) : 0.5;
    const center = new THREE.Vector3().lerpVectors(Pi, Po, tW);
    const width = new THREE.Vector3().subVectors(Po, Pi);
    const band = width.length();
    if (band < 1e-6) width.set(1, 0, 0); else width.normalize();
    const tangent = new THREE.Vector3().subVectors(PiNext, PiPrev);
    if (tangent.lengthSq() < 1e-10) tangent.set(-width.z, 0, width.x);
    const tw = tangent.dot(width);
    tangent.addScaledVector(width, -tw);
    if (tangent.lengthSq() < 1e-10) tangent.set(0, 1, 0); else tangent.normalize();
    const bx = width, by = tangent;
    const bz = new THREE.Vector3().crossVectors(bx, by);
    if (bz.lengthSq() < 1e-10) return null;
    bz.normalize();
    const quat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(bx, by, bz));
    const normal = bz.clone();
    return { position: center, quaternion: quat, tangent, width, normal, band };
  }

  const Geometry = {
    Ribbon: (typeof window !== 'undefined' && window.RibbonGeometry) || null,
    createRibbonBufferFromFlatArrays,
    buildHelixPair,
    chordLenAlongInner,
    sampleRibbonSurfaceFrame,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Geometry;
  else {
    global.EventGeometry = Geometry;
    // Back-compat globals for event-renderer fallback
    global.createRibbonBufferFromFlatArrays = createRibbonBufferFromFlatArrays;
    global.buildHelixPair = buildHelixPair;
    global.chordLenAlongInner = chordLenAlongInner;
    global.sampleRibbonSurfaceFrame = sampleRibbonSurfaceFrame;
  }
})(typeof window !== 'undefined' ? window : globalThis);
