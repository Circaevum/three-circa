/**
 * Shared mesh/line stroke primitives.
 *
 * Cost hierarchy (cheap → expensive), prefer left when fidelity allows:
 *   1. THREE.Line / LineLoop     — 1 draw, no Frenet, linewidth ignored in WebGL
 *   2. Ribbon strip Mesh         — flat quad band (RibbonGeometry); good “thick line”
 *   3. Cylinder segment Mesh     — short 2-point spokes (6 radial segs)
 *   4. TubeGeometry Mesh         — CatmullRom + Frenet (`mn`/`Ro`); costliest; use sparingly
 *
 * Callers pick mode explicitly, or use strokeAlongFlat({ mode: 'auto', … }).
 */
(function (global) {
  function resolveTHREE(explicit) {
    if (explicit) return explicit;
    if (typeof global !== 'undefined' && global.THREE) return global.THREE;
    if (typeof window !== 'undefined' && window.THREE) return window.THREE;
    return null;
  }

  function createNodeCompatibleMaterial(THREE_REF, MaterialType, options) {
    const T = THREE_REF || resolveTHREE();
    if (!T) return null;
    const MatClass = MaterialType || T.MeshBasicMaterial;
    const opts = options || {};
    const isWebGPU = typeof window !== 'undefined' && typeof window.isWebGPUSupported === 'function' && window.isWebGPUSupported();

    let mat;
    if (isWebGPU) {
      if (MatClass === T.MeshBasicMaterial && typeof T.MeshBasicNodeMaterial === 'function') {
        mat = new T.MeshBasicNodeMaterial(opts);
      } else if (MatClass === T.MeshStandardMaterial && typeof T.MeshStandardNodeMaterial === 'function') {
        mat = new T.MeshStandardNodeMaterial(opts);
      } else {
        mat = new MatClass(opts);
      }
    } else {
      mat = new MatClass(opts);
    }
    if (typeof window !== 'undefined' && window.CircaevumWebGPUPipeline && typeof window.CircaevumWebGPUPipeline.applyGPUFlattenToMaterial === 'function') {
      window.CircaevumWebGPUPipeline.applyGPUFlattenToMaterial(mat);
    }
    return mat;
  }

  function lineFromFlat(flat, opts) {
    const THREE = resolveTHREE(opts && opts.THREE);
    if (!THREE || !flat || flat.length < 6) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(flat, 3));
    const matOpts = {
      color: opts && opts.color != null ? opts.color : 0xffffff,
      transparent: !!(opts && opts.transparent !== false && (opts.opacity == null || opts.opacity < 1)),
      opacity: opts && opts.opacity != null ? opts.opacity : 1,
      depthWrite: opts && opts.depthWrite === true,
      depthTest: opts && opts.depthTest === false ? false : true
    };
    if (opts && opts.materialOpts) Object.assign(matOpts, opts.materialOpts);
    const mat = createNodeCompatibleMaterial(THREE, THREE.LineBasicMaterial, matOpts);
    const line = new THREE.Line(geo, mat);
    if (opts && opts.renderOrder != null) line.renderOrder = opts.renderOrder;
    if (opts && opts.userData) line.userData = opts.userData;
    return line;
  }

  function cylinderBetween(p0, p1, opts) {
    const THREE = resolveTHREE(opts && opts.THREE);
    if (!THREE || !p0 || !p1) return null;
    const a = p0.isVector3 ? p0 : new THREE.Vector3(p0.x, p0.y, p0.z);
    const b = p1.isVector3 ? p1 : new THREE.Vector3(p1.x, p1.y, p1.z);
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    if (len < 1e-9) return null;
    const radius = opts && opts.radius != null ? opts.radius : 0.05;
    const radialSegs = opts && opts.radialSegments != null ? opts.radialSegments : 6;
    const geom = new THREE.CylinderGeometry(radius, radius, len, radialSegs, 1, false);
    const mat = createNodeCompatibleMaterial(THREE, THREE.MeshBasicMaterial, {
      color: opts && opts.color != null ? opts.color : 0xffffff,
      transparent: true,
      opacity: opts && opts.opacity != null ? opts.opacity : 1,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(geom, mat);
    if (opts && opts.renderOrder != null) mesh.renderOrder = opts.renderOrder;
    const axis = new THREE.Vector3(0, 1, 0);
    mesh.quaternion.setFromUnitVectors(axis, dir.clone().normalize());
    mesh.position.copy(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5));
    return mesh;
  }

  /**
   * Polyline stroke along flat [x,y,z,...].
   * @param {'line'|'tube'|'auto'} [opts.mode='auto']
   * @param {number} [opts.qualityScale=1] - when mode auto and scale < preferLineBelow, use Line
   * @param {number} [opts.preferLineBelow=0.55]
   * @param {boolean} [opts.forceLine=false]
   */
  function strokeAlongFlat(flat, opts) {
    const THREE = resolveTHREE(opts && opts.THREE);
    if (!THREE || !flat || flat.length < 6) return null;
    const o = opts || {};
    const nPts = flat.length / 3;
    const color = o.color != null ? o.color : 0xffffff;
    const opacity = o.opacity != null ? o.opacity : 1;
    const renderOrder = o.renderOrder != null ? o.renderOrder : 0;
    const q = o.qualityScale != null && isFinite(o.qualityScale) ? o.qualityScale : 1;
    const preferLineBelow = o.preferLineBelow != null ? o.preferLineBelow : 0.55;

    let mode = o.mode || 'auto';
    if (o.forceLine) mode = 'line';
    if (mode === 'auto') {
      mode = q < preferLineBelow || nPts < 2 ? 'line' : 'tube';
    }

    if (mode === 'line') {
      return lineFromFlat(flat, {
        THREE,
        color,
        opacity,
        transparent: true,
        depthWrite: false,
        renderOrder,
        userData: o.userData,
        materialOpts: o.materialOpts
      });
    }

    const radius = o.radius != null && o.radius > 0 ? o.radius : 0.05;
    if (nPts === 2) {
      return cylinderBetween(
        { x: flat[0], y: flat[1], z: flat[2] },
        { x: flat[3], y: flat[4], z: flat[5] },
        { THREE, radius, color, opacity, renderOrder, radialSegments: o.radialSegments }
      );
    }

    if (typeof THREE.CatmullRomCurve3 === 'function' && typeof THREE.TubeGeometry === 'function') {
      const points = [];
      for (let i = 0; i < flat.length; i += 3) {
        points.push(new THREE.Vector3(flat[i], flat[i + 1], flat[i + 2]));
      }
      const curve = new THREE.CatmullRomCurve3(points);
      const maxTub = Math.max(24, Math.round(160 * q));
      const tubularSegments = Math.max(6, Math.min(maxTub, Math.round((nPts - 1) * 4 * q)));
      const radialSegments = o.radialSegments != null
        ? o.radialSegments
        : (q < 0.55 ? 3 : (q < 0.8 ? 4 : 5));
      const geo = new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, false);
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = renderOrder;
      if (o.userData) mesh.userData = o.userData;
      return mesh;
    }

    // Fallback: segmented cylinders (still cheaper than failed TubeGeometry path)
    const group = new THREE.Group();
    for (let i = 0; i < nPts - 1; i++) {
      const c = cylinderBetween(
        { x: flat[i * 3], y: flat[i * 3 + 1], z: flat[i * 3 + 2] },
        { x: flat[(i + 1) * 3], y: flat[(i + 1) * 3 + 1], z: flat[(i + 1) * 3 + 2] },
        { THREE, radius, color, opacity, renderOrder }
      );
      if (c) group.add(c);
    }
    return group.children.length ? group : null;
  }

  global.MeshPrimitives = {
    createNodeCompatibleMaterial,
    lineFromFlat,
    cylinderBetween,
    strokeAlongFlat,
    /** Documented cost order for callers / agents */
    COST: {
      LINE: 1,
      RIBBON_STRIP: 2,
      CYLINDER: 3,
      TUBE: 4
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
