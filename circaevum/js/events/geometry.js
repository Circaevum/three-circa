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

  function cylinderBetweenPoints(p0, p1, radius, colorHex, opacity, renderOrder) {
    if (typeof global.MeshPrimitives !== 'undefined' && global.MeshPrimitives.cylinderBetween) {
      return global.MeshPrimitives.cylinderBetween(p0, p1, { THREE: global.THREE, radius, color: colorHex, opacity, renderOrder });
    }
    var THREE = global.THREE; if (!THREE) return null;
    var dir = new THREE.Vector3().subVectors(p1, p0);
    var len = dir.length(); if (len < 1e-9) return null;
    var geom = new THREE.CylinderGeometry(radius, radius, len, 6, 1, false);
    var mat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: opacity, side: THREE.DoubleSide, depthWrite: false });
    var mesh = new THREE.Mesh(geom, mat); mesh.renderOrder = renderOrder;
    var axis = new THREE.Vector3(0, 1, 0); mesh.quaternion.setFromUnitVectors(axis, dir.clone().normalize());
    mesh.position.copy(new THREE.Vector3().addVectors(p0, p1).multiplyScalar(0.5)); return mesh;
  }

  function createRibbonFillMesh(ribbonGeo, fillHex, fillOpacity, plotType, roFill, durationDays, contextFade, forceUniformFill) {
    var THREE = global.THREE; if (!THREE || !ribbonGeo) return null;
    var LONG_EVENT_RIBBON_RADIAL_GRADIENT_MIN_DAYS = 7;
    var LONG_EVENT_RIBBON_OUTER_FILL_ALPHA_RATIO = 0.55;
    // Use global helper if present, else fallback threshold
    var minDays = (typeof global.LONG_EVENT_RIBBON_RADIAL_GRADIENT_MIN_DAYS === 'number') ? global.LONG_EVENT_RIBBON_RADIAL_GRADIENT_MIN_DAYS : LONG_EVENT_RIBBON_RADIAL_GRADIENT_MIN_DAYS;
    var useGradient = !forceUniformFill && (typeof durationDays === 'number' && durationDays >= minDays);
    // Try global shader helper
    if (useGradient && typeof global.createLongTermRibbonFillShaderMaterial === 'function') {
      var innerScale = contextFade && contextFade.innerScale != null ? contextFade.innerScale : 1;
      var outerScale = contextFade && contextFade.outerScale != null ? contextFade.outerScale : 1;
      var mat0 = global.createLongTermRibbonFillShaderMaterial(fillHex, fillOpacity, THREE, innerScale, outerScale);
      if (typeof global.CircaevumWebGPUPipeline !== 'undefined' && global.CircaevumWebGPUPipeline.applyGPUFlattenToMaterial) global.CircaevumWebGPUPipeline.applyGPUFlattenToMaterial(mat0);
      var fillMesh0 = new THREE.Mesh(ribbonGeo, mat0); fillMesh0.renderOrder = roFill; fillMesh0.userData.longTermFill = true;
      if (plotType === 'polygon2d') { var amt = typeof global.currentFlattenAmount === 'number' ? global.currentFlattenAmount : 0; var yScale = (typeof global.getTimelineFlattenYScale === 'function' ? global.getTimelineFlattenYScale(amt) : 1); fillMesh0.scale.y = 0.02 / Math.max(0.05, yScale); fillMesh0.userData.polygon2dBaseScaleY = 0.02; }
      return fillMesh0;
    }
    var innerScale2 = contextFade && contextFade.innerScale != null ? contextFade.innerScale : 1;
    var mat;
    if (useGradient) {
      // Inline ShaderMaterial fallback if global helper absent
      var inS = innerScale2, outS = contextFade && contextFade.outerScale != null ? contextFade.outerScale : 1;
      var innerA = Math.min(1, Math.max(0, fillOpacity * inS));
      var outerA = Math.min(1, Math.max(0, fillOpacity * LONG_EVENT_RIBBON_OUTER_FILL_ALPHA_RATIO * outS));
      mat = new THREE.ShaderMaterial({ uniforms: { diffuse: { value: new THREE.Color(fillHex) }, innerAlpha: { value: innerA }, outerAlpha: { value: outerA } }, vertexShader: 'attribute float ribbonEdge; varying float vRibbonEdge; void main(){ vRibbonEdge=ribbonEdge; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }', fragmentShader: 'uniform vec3 diffuse; uniform float innerAlpha; uniform float outerAlpha; varying float vRibbonEdge; void main(){ float a=mix(innerAlpha,outerAlpha,vRibbonEdge); gl_FragColor=vec4(diffuse,a); }', transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 1 });
    } else if (typeof global.createNodeCompatibleMaterial === 'function') {
      mat = global.createNodeCompatibleMaterial(THREE, THREE.MeshBasicMaterial, { color: fillHex, transparent: true, opacity: fillOpacity * innerScale2, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 1 });
    } else {
      mat = new THREE.MeshBasicMaterial({ color: fillHex, transparent: true, opacity: fillOpacity * innerScale2, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 1 });
    }
    if (typeof global.CircaevumWebGPUPipeline !== 'undefined' && global.CircaevumWebGPUPipeline.applyGPUFlattenToMaterial) global.CircaevumWebGPUPipeline.applyGPUFlattenToMaterial(mat);
    var fillMesh = new THREE.Mesh(ribbonGeo, mat);
    if (plotType === 'polygon2d') { var amt2 = typeof global.currentFlattenAmount === 'number' ? global.currentFlattenAmount : 0; var yScale2 = (typeof global.getTimelineFlattenYScale === 'function' ? global.getTimelineFlattenYScale(amt2) : 1); fillMesh.scale.y = 0.02 / Math.max(0.05, yScale2); fillMesh.userData.polygon2dBaseScaleY = 0.02; }
    fillMesh.renderOrder = roFill; fillMesh.userData.longTermFill = true; return fillMesh;
  }

  function updateBandEndConnectorFromFlat(obj, innerFlat, outerFlat, capIndex) {
    if (!obj || !innerFlat || !outerFlat || innerFlat.length < 3) return;
    var n = innerFlat.length / 3; var si = capIndex == null ? 0 : Math.max(0, Math.min(n - 1, capIndex)); var ix = si * 3;
    var ax = innerFlat[ix], ay = innerFlat[ix+1], az = innerFlat[ix+2]; var bx = outerFlat[ix], by = outerFlat[ix+1], bz = outerFlat[ix+2];
    if (obj.isLine && obj.geometry) {
      var pos = obj.geometry.attributes.position; if (!pos || pos.count < 2) return; var arr = pos.array; arr[0]=ax;arr[1]=ay;arr[2]=az;arr[3]=bx;arr[4]=by;arr[5]=bz; pos.needsUpdate=true; if (obj.geometry.computeBoundingSphere) obj.geometry.computeBoundingSphere();
    } else if (obj.isMesh && obj.geometry && obj.geometry.parameters) {
      var THREE = global.THREE; var p0 = new THREE.Vector3(ax,ay,az); var p1 = new THREE.Vector3(bx,by,bz); var dir = new THREE.Vector3().subVectors(p1,p0); var len = dir.length(); if (len<1e-9) return; var origH = obj.geometry.parameters.height; if (typeof origH==='number'&&origH>1e-9) obj.scale.set(1,len/origH,1); var axis2 = new THREE.Vector3(0,1,0); obj.quaternion.setFromUnitVectors(axis2, dir.clone().normalize()); obj.position.copy(p0).add(p1).multiplyScalar(0.5);
    }
  }

  function addBandEndConnectors(group, innerFlat, outerFlat, colorHex, opacity, renderOrder, tubeRadius) {
    var forceHorizonCaps = !!(group && group.userData && group.userData.contextSphereClipped); if (!forceHorizonCaps) return;
    var n = innerFlat.length / 3; if (n<1) return; var THREE = global.THREE;
    if (tubeRadius != null && tubeRadius > 0 && THREE && typeof THREE.CylinderGeometry === 'function') {
      function cap(si){ var ix=si*3; var p0=new THREE.Vector3(innerFlat[ix],innerFlat[ix+1],innerFlat[ix+2]); var p1=new THREE.Vector3(outerFlat[ix],outerFlat[ix+1],outerFlat[ix+2]); var c=cylinderBetweenPoints(p0,p1,tubeRadius*0.92,colorHex,opacity,renderOrder); if(c){ c.userData={type:'EventRibbonBandEnd',capIndex:si,contextSphereHorizon:true}; group.add(c); } }
      cap(0); cap(n-1); return;
    }
    function seg(si){ var ix=si*3; var g=new global.THREE.BufferGeometry(); g.setAttribute('position', new global.THREE.Float32BufferAttribute([innerFlat[ix],innerFlat[ix+1],innerFlat[ix+2],outerFlat[ix],outerFlat[ix+1],outerFlat[ix+2]],3)); var m=new global.THREE.LineBasicMaterial({color:colorHex,transparent:true,opacity:opacity,linewidth:1}); var line=new global.THREE.Line(g,m); line.renderOrder=renderOrder; line.userData={type:'EventRibbonBandEnd',capIndex:si}; group.add(line); }
    seg(0); seg(n-1);
  }

  const Geometry = {
    Ribbon: (typeof window !== 'undefined' && window.RibbonGeometry) || null,
    createRibbonBufferFromFlatArrays,
    buildHelixPair,
    chordLenAlongInner,
    sampleRibbonSurfaceFrame,
    createRibbonFillMesh,
    updateBandEndConnectorFromFlat,
    addBandEndConnectors,
    cylinderBetweenPoints,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Geometry;
  else {
    global.EventGeometry = Geometry;
    // Back-compat globals for event-renderer fallback
    global.createRibbonBufferFromFlatArrays = createRibbonBufferFromFlatArrays;
    global.buildHelixPair = buildHelixPair;
    global.chordLenAlongInner = chordLenAlongInner;
    global.sampleRibbonSurfaceFrame = sampleRibbonSurfaceFrame;
    global.createRibbonFillMesh = createRibbonFillMesh;
    global.addBandEndConnectors = addBandEndConnectors;
    global.updateBandEndConnectorFromFlat = updateBandEndConnectorFromFlat;
    global.cylinderBetweenPoints = cylinderBetweenPoints;
  }
})(typeof window !== 'undefined' ? window : globalThis);
