/**
 * Shared ribbon strip geometry — inner/outer edge flats → triangulated BufferGeometry.
 * Used by event ribbons, planet worldline strokes, Artemis overlays.
 *
 * Cost note: a ribbon Mesh (2 verts per sample) is cheaper than TubeGeometry outlines
 * (Frenet frames × radial segments). Prefer ribbon fill + Line edges when possible.
 */
(function (global) {
  function resolveTHREE(explicit) {
    if (explicit) return explicit;
    if (typeof global !== 'undefined' && global.THREE) return global.THREE;
    if (typeof window !== 'undefined' && window.THREE) return window.THREE;
    return null;
  }

  /**
   * @param {Float32Array|number[]} innerFlat - [x,y,z,...] along inner edge
   * @param {Float32Array|number[]} outerFlat - same length as inner
   * @param {object} [opts]
   * @param {object} [opts.THREE]
   * @param {boolean} [opts.ribbonEdgeAttr=true] - set ribbonEdge 0|1 for fill shaders
   * @param {boolean} [opts.computeNormals=true]
   * @returns {THREE.BufferGeometry|null}
   */
  function fromInnerOuter(innerFlat, outerFlat, opts) {
    const THREE = resolveTHREE(opts && opts.THREE);
    if (!THREE || !innerFlat || !outerFlat) return null;
    const n = innerFlat.length / 3;
    if (n < 2 || innerFlat.length !== outerFlat.length) return null;

    const pos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      pos[i * 6] = innerFlat[i * 3];
      pos[i * 6 + 1] = innerFlat[i * 3 + 1];
      pos[i * 6 + 2] = innerFlat[i * 3 + 2];
      pos[i * 6 + 3] = outerFlat[i * 3];
      pos[i * 6 + 4] = outerFlat[i * 3 + 1];
      pos[i * 6 + 5] = outerFlat[i * 3 + 2];
    }
    const idx = [];
    for (let i = 0; i < n - 1; i++) {
      const a = 2 * i;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      idx.push(a, b, c, b, d, c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setIndex(idx);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

    const wantEdge = !(opts && opts.ribbonEdgeAttr === false);
    if (wantEdge) {
      const ribbonEdge = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) {
        ribbonEdge[i * 2] = 0;
        ribbonEdge[i * 2 + 1] = 1;
      }
      geo.setAttribute('ribbonEdge', new THREE.BufferAttribute(ribbonEdge, 1));
    }

    if (!(opts && opts.computeNormals === false)) {
      geo.computeVertexNormals();
    }
    return geo;
  }

  /**
   * Offset a centerline in the tangent×up plane into inner/outer edges.
   * @returns {{ innerFlat: Float32Array, outerFlat: Float32Array }|null}
   */
  function innerOuterFromCenterline(centerFlat, halfWidth, opts) {
    const THREE = resolveTHREE(opts && opts.THREE);
    if (!THREE || !centerFlat || !(halfWidth > 0)) return null;
    const n = centerFlat.length / 3;
    if (n < 2) return null;

    const innerFlat = new Float32Array(centerFlat.length);
    const outerFlat = new Float32Array(centerFlat.length);
    const up = new THREE.Vector3(0, 1, 0);
    const tan = new THREE.Vector3();
    const side = new THREE.Vector3();

    for (let i = 0; i < n; i++) {
      const ix = i * 3;
      const x0 = centerFlat[ix];
      const y0 = centerFlat[ix + 1];
      const z0 = centerFlat[ix + 2];
      const iPrev = Math.max(0, i - 1) * 3;
      const iNext = Math.min(n - 1, i + 1) * 3;
      tan.set(
        centerFlat[iNext] - centerFlat[iPrev],
        centerFlat[iNext + 1] - centerFlat[iPrev + 1],
        centerFlat[iNext + 2] - centerFlat[iPrev + 2]
      );
      if (tan.lengthSq() < 1e-12) tan.set(0, 1, 0);
      else tan.normalize();
      side.crossVectors(tan, up);
      if (side.lengthSq() < 1e-10) {
        side.set(1, 0, 0).cross(tan);
      }
      side.normalize().multiplyScalar(halfWidth);
      innerFlat[ix] = x0 + side.x;
      innerFlat[ix + 1] = y0 + side.y;
      innerFlat[ix + 2] = z0 + side.z;
      outerFlat[ix] = x0 - side.x;
      outerFlat[ix + 1] = y0 - side.y;
      outerFlat[ix + 2] = z0 - side.z;
    }
    return { innerFlat, outerFlat };
  }

  /**
   * Centerline + halfWidth → ribbon strip (worldline-style thick stroke without TubeGeometry).
   */
  function fromCenterline(centerFlat, halfWidth, opts) {
    const edges = innerOuterFromCenterline(centerFlat, halfWidth, opts);
    if (!edges) return null;
    return fromInnerOuter(edges.innerFlat, edges.outerFlat, Object.assign({ ribbonEdgeAttr: false }, opts || {}));
  }

  global.RibbonGeometry = {
    fromInnerOuter,
    fromCenterline,
    innerOuterFromCenterline
  };
})(typeof window !== 'undefined' ? window : globalThis);
