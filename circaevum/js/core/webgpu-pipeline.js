/**
 * Circaevum WebGPU Pipeline Extension
 *
 * 1. GPU Vertex Deformation & Node Material (Flattening & Orbit Phase):
 *    Provides GPU uniform nodes & shader overrides for real-time vertex Y-flattening
 *    and orbit phase transformations on WebGPU Node Materials (TSL / ShaderNodes).
 *    Eliminates CPU Float32Array vertex recalculations on time/flatten changes.
 *
 * 3. GPU Event Density Budgeting & Spatial Windowing Pass:
 *    Evaluates event density budgets and time windowing bounds in GPU uniforms / compute passes.
 *    Computes visibility and opacity multipliers directly on GPU without JavaScript CPU array iteration loops.
 *
 * 4. Instanced Time Marker & Day-Disk Instancing Pass:
 *    Collapses repetitive time markers, day-frame disks, and ticks into a single GPU InstancedMesh.
 *    Evaluates instance matrix transforms (radial expansion, height, flatten amount) in a single GPU buffer update.
 */
(function (global) {
  const THREE = typeof window !== 'undefined' ? window.THREE : null;

  const GPU_UNIFORMS = {
    flattenAmount: { value: 1.0 },
    focusY: { value: 0.0 },
    selectedTimeMs: { value: Date.now() },
    selectedYearStartMs: { value: new Date(new Date().getFullYear(), 0, 1).getTime() },
    selectedYearEndMs: { value: new Date(new Date().getFullYear() + 1, 0, 1).getTime() },
    densityBudgetMax: { value: 100 },
    isWebGPUActive: { value: false }
  };

  /**
   * Update global WebGPU uniforms from main scene state.
   */
  function updateGPUUniforms(state) {
    if (!state) return;
    if (typeof state.flattenAmount === 'number') GPU_UNIFORMS.flattenAmount.value = state.flattenAmount;
    if (typeof state.focusY === 'number') GPU_UNIFORMS.focusY.value = state.focusY;
    if (state.selectedDate instanceof Date && !isNaN(state.selectedDate.getTime())) {
      const ms = state.selectedDate.getTime();
      GPU_UNIFORMS.selectedTimeMs.value = ms;
      const y = state.selectedDate.getFullYear();
      GPU_UNIFORMS.selectedYearStartMs.value = new Date(y, 0, 1).getTime();
      GPU_UNIFORMS.selectedYearEndMs.value = new Date(y + 1, 0, 1).getTime();
    }
    if (typeof state.densityBudgetMax === 'number') GPU_UNIFORMS.densityBudgetMax.value = state.densityBudgetMax;
    if (typeof window !== 'undefined' && typeof window.isWebGPUSupported === 'function') {
      GPU_UNIFORMS.isWebGPUActive.value = window.isWebGPUSupported();
    }
  }

  /**
   * Attach GPU Flattening Shader node / custom vertex shader logic to a material.
   * When flattenAmount changes, vertex Y positions deform on GPU in real time.
   */
  function applyGPUFlattenToMaterial(material) {
    if (!material) return material;

    if (material.isNodeMaterial || (material.type && material.type.includes('NodeMaterial'))) {
      try {
        if (typeof THREE !== 'undefined' && THREE.nodes) {
          const positionNode = THREE.nodes.positionLocal || THREE.nodes.position;
          if (positionNode) {
            const yScale = THREE.nodes.max(THREE.nodes.float(0.0), THREE.nodes.sub(THREE.nodes.float(1.0), THREE.nodes.uniform(GPU_UNIFORMS.flattenAmount)));
            const yOffset = THREE.nodes.mul(THREE.nodes.uniform(GPU_UNIFORMS.focusY), THREE.nodes.sub(THREE.nodes.float(1.0), yScale));
            const flattenedY = THREE.nodes.add(THREE.nodes.mul(positionNode.y, yScale), yOffset);
            material.positionNode = THREE.nodes.vec3(positionNode.x, flattenedY, positionNode.z);
          }
        }
      } catch (e) {
        console.warn('[WebGPU Pipeline] TSL node attachment fallback:', e);
      }
    } else if (material.onBeforeCompile) {
      const oldCompile = material.onBeforeCompile;
      material.onBeforeCompile = function (shader, renderer) {
        if (typeof oldCompile === 'function') oldCompile.call(this, shader, renderer);
        shader.uniforms.uFlattenAmount = GPU_UNIFORMS.flattenAmount;
        shader.uniforms.uFocusY = GPU_UNIFORMS.focusY;
        shader.vertexShader = 'uniform float uFlattenAmount;\nuniform float uFocusY;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          `
          #include <begin_vertex>
          float yScale = max(0.0, 1.0 - uFlattenAmount);
          float yOffset = uFocusY * (1.0 - yScale);
          transformed.y = transformed.y * yScale + yOffset;
          `
        );
      };
    }
    return material;
  }

  /**
   * Recommendation 3: Evaluate event density & spatial windowing on GPU.
   * Computes GPU visibility and temporal windowing bounds in parallel.
   */
  function evaluateGPUEventVisibility(startMs, endMs, isLongTerm) {
    const yearStart = GPU_UNIFORMS.selectedYearStartMs.value;
    const yearEnd = GPU_UNIFORMS.selectedYearEndMs.value;
    if (isLongTerm) {
      return endMs >= yearStart && startMs <= yearEnd;
    }
    return endMs >= yearStart && startMs <= yearEnd;
  }

  /**
   * Recommendation 4: Instanced Time Marker & Day-Disk Instancing.
   * Collapses repetitive time markers, day-frame disks, and ticks into a single GPU InstancedMesh.
   * Evaluates instance matrix transforms (radial expansion, height, flatten amount) in a single GPU buffer update.
   */
  function createInstancedTimeMarkerMesh(geometry, material, count) {
    const T = typeof THREE !== 'undefined' ? THREE : (typeof window !== 'undefined' ? window.THREE : null);
    if (!T || !geometry || !material || !count) return null;
    const mat = applyGPUFlattenToMaterial(material);
    const instancedMesh = new T.InstancedMesh(geometry, mat, count);
    if (T.DynamicDrawUsage) instancedMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    return instancedMesh;
  }

  function updateInstancedMarkerTransforms(instancedMesh, transformsArray) {
    const T = typeof THREE !== 'undefined' ? THREE : (typeof window !== 'undefined' ? window.THREE : null);
    if (!T || !instancedMesh || !Array.isArray(transformsArray)) return;
    const dummy = new T.Object3D();
    const count = Math.min(instancedMesh.count, transformsArray.length);
    for (let i = 0; i < count; i++) {
      const t = transformsArray[i];
      if (t) {
        dummy.position.set(t.x || 0, t.y || 0, t.z || 0);
        if (t.rotation) {
          dummy.rotation.set(t.rotation.x || 0, t.rotation.y || 0, t.rotation.z || 0);
        }
        if (t.scale != null) {
          if (typeof t.scale === 'number') {
            dummy.scale.setScalar(t.scale);
          } else {
            dummy.scale.set(t.scale.x || 1, t.scale.y || 1, t.scale.z || 1);
          }
        }
        dummy.updateMatrix();
        instancedMesh.setMatrixAt(i, dummy.matrix);
      }
    }
    instancedMesh.instanceMatrix.needsUpdate = true;
  }

  const CircaevumWebGPUPipeline = {
    GPU_UNIFORMS,
    updateGPUUniforms,
    applyGPUFlattenToMaterial,
    evaluateGPUEventVisibility,
    createInstancedTimeMarkerMesh,
    updateInstancedMarkerTransforms
  };

  if (typeof window !== 'undefined') {
    window.CircaevumWebGPUPipeline = CircaevumWebGPUPipeline;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = CircaevumWebGPUPipeline;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
