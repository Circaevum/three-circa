/**
 * Context Sphere visual clip — Event Horizon fragment discard.
 *
 * Modes (per material via userData.contextSphereClipInvert):
 *   false (STE): discard outside sphere — short-term lives inside
 *   true  (LTE): discard inside sphere — long-term / time-frame lives outside
 */
(function (global) {
  const uniforms = {
    uClipSphereCenter: { value: null },
    uClipSphereRadius: { value: 0 },
    uClipSphereEnabled: { value: 0 }
  };

  function ensureUniforms(THREE) {
    if (!uniforms.uClipSphereCenter.value && THREE) {
      uniforms.uClipSphereCenter.value = new THREE.Vector3();
    }
    return uniforms;
  }

  function syncFromState(state, THREE) {
    ensureUniforms(THREE || global.THREE);
    if (state && typeof state.radius === 'number' && state.radius > 0 &&
        typeof state.x === 'number' && typeof state.y === 'number' && typeof state.z === 'number') {
      uniforms.uClipSphereCenter.value.set(state.x, state.y, state.z);
      // Slight inset so rim sits just inside the visible shell wire.
      uniforms.uClipSphereRadius.value = state.radius * 0.997;
      uniforms.uClipSphereEnabled.value = 1;
    } else {
      uniforms.uClipSphereEnabled.value = 0;
    }
  }

  function patchMaterial(material, invert) {
    if (!material || material.isShaderMaterial) return;
    if (!material.userData) material.userData = {};
    const wantInvert = !!invert;
    material.userData.contextSphereClipInvert = wantInvert;

    // Re-patch if mode changed (old compile lacked invert uniform).
    if (
      material.userData.contextSphereClipPatched &&
      material.userData.contextSphereClipInvertUniform
    ) {
      material.userData.contextSphereClipInvertUniform.value = wantInvert ? 1 : 0;
      return;
    }
    if (material.userData.contextSphereClipPatched) {
      material.userData.contextSphereClipPatched = false;
      material.onBeforeCompile = material.userData.contextSphereClipPrevOnBeforeCompile || null;
    }

    const prev = material.onBeforeCompile;
    material.userData.contextSphereClipPrevOnBeforeCompile = prev;
    material.userData.contextSphereClipPatched = true;

    const invertUniform = { value: wantInvert ? 1 : 0 };
    material.userData.contextSphereClipInvertUniform = invertUniform;

    material.onBeforeCompile = function (shader) {
      if (typeof prev === 'function') prev.call(this, shader);

      shader.uniforms.uClipSphereCenter = uniforms.uClipSphereCenter;
      shader.uniforms.uClipSphereRadius = uniforms.uClipSphereRadius;
      shader.uniforms.uClipSphereEnabled = uniforms.uClipSphereEnabled;
      shader.uniforms.uClipSphereInvert = invertUniform;

      if (shader.vertexShader.indexOf('vCtxSphereWorldPos') < 0) {
        shader.vertexShader = 'varying vec3 vCtxSphereWorldPos;\n' + shader.vertexShader;
        if (shader.vertexShader.indexOf('#include <project_vertex>') >= 0) {
          shader.vertexShader = shader.vertexShader.replace(
            '#include <project_vertex>',
            [
              '#include <project_vertex>',
              'vCtxSphereWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;'
            ].join('\n')
          );
        } else {
          shader.vertexShader = shader.vertexShader.replace(
            /void\s+main\s*\(\s*\)\s*\{/,
            'void main() {\nvCtxSphereWorldPos = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;'
          );
        }
      }

      if (shader.fragmentShader.indexOf('uClipSphereInvert') < 0) {
        shader.fragmentShader =
          'varying vec3 vCtxSphereWorldPos;\n' +
          'uniform vec3 uClipSphereCenter;\n' +
          'uniform float uClipSphereRadius;\n' +
          'uniform float uClipSphereEnabled;\n' +
          'uniform float uClipSphereInvert;\n' +
          shader.fragmentShader;

        const discardBlock = [
          'if (uClipSphereEnabled > 0.5 && uClipSphereRadius > 0.0) {',
          '  float _ctxOutside = distance(vCtxSphereWorldPos, uClipSphereCenter) > uClipSphereRadius ? 1.0 : 0.0;',
          '  if (uClipSphereInvert > 0.5) {',
          '    if (_ctxOutside < 0.5) discard;',
          '  } else {',
          '    if (_ctxOutside > 0.5) discard;',
          '  }',
          '}'
        ].join('\n');

        if (shader.fragmentShader.indexOf('#include <clipping_planes_fragment>') >= 0) {
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <clipping_planes_fragment>',
            '#include <clipping_planes_fragment>\n' + discardBlock
          );
        } else {
          shader.fragmentShader = shader.fragmentShader.replace(
            /void\s+main\s*\(\s*\)\s*\{/,
            'void main() {\n' + discardBlock
          );
        }
      }

      material.userData.contextSphereClipShader = shader;
    };
    material.needsUpdate = true;
  }

  function patchObject(root, invert) {
    if (!root) return;
    root.traverse(function (obj) {
      if (obj.userData && obj.userData.type === 'ContextSphere') return;
      let skip = false;
      let p = obj.parent;
      while (p) {
        if (p.userData && p.userData.type === 'ContextSphere') {
          skip = true;
          break;
        }
        p = p.parent;
      }
      if (skip) return;

      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach(function (m) {
            patchMaterial(m, invert);
          });
        } else {
          patchMaterial(obj.material, invert);
        }
      }
    });
  }

  /**
   * Push local geometry outward from sphere center by padWorld (STE overshoot).
   * Idempotent per geometry + pad key.
   */
  function stretchObjectPastClip(root, state, padWorld, THREE) {
    if (!root || !state || !(padWorld > 0) || !THREE) return;
    const cx = state.x;
    const cy = state.y;
    const cz = state.z;
    if (typeof cx !== 'number' || typeof cy !== 'number' || typeof cz !== 'number') return;
    const padKey = padWorld.toFixed(5);

    root.traverse(function (obj) {
      if (obj.userData && obj.userData.type === 'ContextSphere') return;
      let p = obj.parent;
      while (p) {
        if (p.userData && p.userData.type === 'ContextSphere') return;
        p = p.parent;
      }

      const geom = obj.geometry;
      const pos = geom && geom.attributes && geom.attributes.position;
      if (!pos || !pos.count) return;
      if (!geom.userData) geom.userData = {};
      if (geom.userData.ctxSphereStretchPad === padKey) return;

      if (!geom.userData.ctxSphereStretchOrig) {
        geom.userData.ctxSphereStretchOrig = new Float32Array(pos.array);
      }
      const orig = geom.userData.ctxSphereStretchOrig;
      pos.array.set(orig);

      obj.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert();
      const world = new THREE.Vector3();
      const local = new THREE.Vector3();

      for (let i = 0; i < pos.count; i++) {
        local.fromBufferAttribute(pos, i);
        world.copy(local).applyMatrix4(obj.matrixWorld);
        const dx = world.x - cx;
        const dy = world.y - cy;
        const dz = world.z - cz;
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (len < 1e-8) continue;
        const s = (len + padWorld) / len;
        world.set(cx + dx * s, cy + dy * s, cz + dz * s);
        local.copy(world).applyMatrix4(inv);
        pos.setXYZ(i, local.x, local.y, local.z);
      }
      pos.needsUpdate = true;
      if (geom.computeBoundingSphere) geom.computeBoundingSphere();
      if (geom.computeBoundingBox) geom.computeBoundingBox();
      geom.userData.ctxSphereStretchPad = padKey;
    });
  }

  /**
   * @param {object} opts
   * @param {object[]} [opts.steRoots] - keep inside Event Horizon
   * @param {object[]} [opts.lteRoots] - keep outside Event Horizon
   * @param {object[]} [opts.steObjects]
   * @param {object[]} [opts.lteObjects]
   * @param {object[]} [opts.roots] - legacy: treated as STE (keep inside)
   * @param {object[]} [opts.objects] - legacy: treated as LTE if stretch, else STE
   */
  function refresh(opts) {
    const THREE = (opts && opts.THREE) || global.THREE;
    ensureUniforms(THREE);
    syncFromState(opts && opts.state, THREE);

    const padWorld = opts && typeof opts.padWorld === 'number' ? opts.padWorld : 0;
    const state = opts && opts.state;

    const steRoots = (opts && opts.steRoots) || (opts && opts.roots) || [];
    const lteRoots = (opts && opts.lteRoots) || [];
    const steObjects = (opts && opts.steObjects) || [];
    const lteObjects = (opts && opts.lteObjects) || (opts && opts.objects) || [];

    for (let i = 0; i < steRoots.length; i++) {
      if (!steRoots[i]) continue;
      if (padWorld > 0 && opts && opts.stretchSte) {
        stretchObjectPastClip(steRoots[i], state, padWorld, THREE);
      }
      patchObject(steRoots[i], false);
    }
    for (let j = 0; j < steObjects.length; j++) {
      if (!steObjects[j]) continue;
      if (padWorld > 0 && opts && opts.stretchSte) {
        stretchObjectPastClip(steObjects[j], state, padWorld, THREE);
      }
      patchObject(steObjects[j], false);
    }
    for (let k = 0; k < lteRoots.length; k++) {
      if (lteRoots[k]) patchObject(lteRoots[k], true);
    }
    for (let m = 0; m < lteObjects.length; m++) {
      if (!lteObjects[m]) continue;
      // Legacy path: objects list was markers — LTE outside, optional stretch outward.
      if (padWorld > 0 && !(opts && opts.lteRoots)) {
        stretchObjectPastClip(lteObjects[m], state, padWorld, THREE);
      }
      patchObject(lteObjects[m], true);
    }
  }

  function setEnabled(on) {
    uniforms.uClipSphereEnabled.value = on ? 1 : 0;
  }

  global.ContextSphereClip = {
    uniforms,
    ensureUniforms,
    syncFromState,
    patchMaterial,
    patchObject,
    stretchObjectPastClip,
    refresh,
    setEnabled
  };
})(typeof window !== 'undefined' ? window : globalThis);
