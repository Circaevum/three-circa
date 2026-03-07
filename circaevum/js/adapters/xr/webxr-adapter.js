/**
 * WebXR Adapter
 * 
 * Handles WebXR session management and scene setup for VR/AR.
 * Part of the XR adapter system for multi-XR compatibility.
 * 
 * Reference: spec/api/api-contract.md (XR extensions)
 */

class WebXRAdapter {
  constructor(scene, camera, renderer, sceneContentGroup) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.sceneContentGroup = sceneContentGroup;

    this.session = null;
    this.referenceSpace = null;
    this.isActive = false;
    this.inputSources = [];

    /** When true, XR shows the 2D view on a floating window (render-to-texture). Disabled: AVP has no passthrough, so we use full immersive VR (scene around you) instead. */
    this.windowedMode = false;

    // Windowed mode: room scene, render target, window quad
    this._roomScene = null;
    this._renderTarget = null;
    this._windowQuad = null;
    this._windowWidth = 1920;
    this._windowHeight = 1080;

    // XR scene configuration (used only for immersive mode)
    // Viewer at origin. Place scene so we're at Earth orbit (50 * 0.012 = 0.6m from Sun), low above plane.
    this.config = {
      scaleFactor: 0.012,
      eyeLevel: 1.6,
      viewingDistance: -0.55,
      planeBelowViewer: -0.9,
      viewOffsetX: -0.24,
      minScale: 0.0005,
      maxScale: 0.02
    };
  }

  /**
   * Check if WebXR is supported
   * @returns {Promise<boolean>}
   */
  async isSupported() {
    if (!('xr' in navigator)) {
      console.warn('WebXR: navigator.xr not available');
      return false;
    }

    try {
      const vrSupported = await navigator.xr.isSessionSupported('immersive-vr');
      const arSupported = await navigator.xr.isSessionSupported('immersive-ar');
      return vrSupported || arSupported;
    } catch (error) {
      console.error('WebXR: Error checking support', error);
      return false;
    }
  }

  /**
   * Enter XR mode
   * @param {string} mode - 'immersive-vr' or 'immersive-ar'
   * @param {{ domOverlayRoot?: HTMLElement }} options - optional; domOverlayRoot = element to show as 2D UI in XR (WebXR DOM Overlay)
   * @returns {Promise<XRSession>}
   */
  async enterXR(mode = 'immersive-vr', options = {}) {
    if (!('xr' in navigator)) {
      throw new Error('WebXR not available');
    }

    const optionalFeatures = ['local-floor', 'bounded-floor', 'hand-tracking'];
    const sessionOptions = { optionalFeatures };
    if (options.domOverlayRoot && typeof options.domOverlayRoot === 'object') {
      sessionOptions.domOverlay = { root: options.domOverlayRoot };
      optionalFeatures.push('dom-overlay');
    }

    try {
      const session = await navigator.xr.requestSession(mode, sessionOptions);

      this.session = session;
      this.renderer.xr.setSession(session);
      this.isActive = true;

      if (session.domOverlayState) {
        console.log('WebXR: DOM overlay active, type:', session.domOverlayState.type);
      }

      // Get reference space
      try {
        this.referenceSpace = await session.requestReferenceSpace('local-floor');
        console.log('WebXR: Using local-floor reference space');
      } catch (error) {
        console.warn('WebXR: Falling back to local reference space', error);
        this.referenceSpace = await session.requestReferenceSpace('local');
      }

      // Setup for XR: windowed = floating window with 2D view; else immersive
      if (this.windowedMode) {
        this.setupWindowedMode();
        // On opaque VR (e.g. Apple Vision Pro), passthrough isn't available; use a dark room background instead of black.
        const THREE = typeof globalThis !== 'undefined' && globalThis.THREE ? globalThis.THREE : (typeof window !== 'undefined' && window.THREE);
        if (this._roomScene && session.environmentBlendMode === 'opaque' && THREE) {
          this._roomScene.background = new THREE.Color(0x0f0f14);
          console.log('WebXR: Opaque session (no passthrough); using dark room background.');
        }
      } else {
        this.setupScene();
      }

      // Listen for input sources
      session.addEventListener('inputsourceschange', (e) => {
        this.inputSources = Array.from(session.inputSources);
        console.log(`WebXR: Input sources changed. Count: ${this.inputSources.length}`);
      });

      // Handle session end
      session.addEventListener('end', () => {
        this.handleSessionEnd();
      });

      console.log('WebXR: Session started successfully');
      return session;
    } catch (error) {
      console.error('WebXR: Failed to start session', error);
      throw error;
    }
  }

  /**
   * Exit XR mode
   */
  async exitXR() {
    if (this.session) {
      try {
        await this.session.end();
      } catch (error) {
        console.error('WebXR: Error ending session', error);
      }
    }
    this.handleSessionEnd();
  }

  /**
   * Windowed mode: create room scene with a quad that will show the 2D view (render target).
   * Does not scale or move the main scene.
   */
  setupWindowedMode() {
    const THREE = typeof globalThis !== 'undefined' && globalThis.THREE ? globalThis.THREE : (typeof window !== 'undefined' && window.THREE);
    if (!THREE) {
      console.warn('WebXR: THREE not available for windowed mode');
      return;
    }
    const w = this._windowWidth;
    const h = this._windowHeight;
    this._renderTarget = new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      stencilBuffer: false,
      depthBuffer: true
    });
    this._roomScene = new THREE.Scene();
    this._roomScene.background = null;
    const aspect = w / h;
    const quadWidth = 1.6;
    const quadHeight = quadWidth / aspect;
    const geometry = new THREE.PlaneGeometry(quadWidth, quadHeight);
    const material = new THREE.MeshBasicMaterial({
      map: this._renderTarget.texture,
      side: THREE.DoubleSide,
      toneMapped: false
    });
    this._windowQuad = new THREE.Mesh(geometry, material);
    this._windowQuad.position.set(0, 1.6, -1.5);
    this._windowQuad.rotation.x = 0;
    this._roomScene.add(this._windowQuad);
    const frameThickness = 0.04;
    const frameDepth = 0.02;
    const fw = quadWidth + frameThickness * 2;
    const fh = quadHeight + frameThickness * 2;
    const frameGeom = new THREE.PlaneGeometry(fw, fh);
    const frameMat = new THREE.MeshBasicMaterial({
      color: 0x1e3a5f,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95
    });
    this._windowFrame = new THREE.Mesh(frameGeom, frameMat);
    this._windowFrame.position.set(0, 1.6, -1.5 - frameDepth * 0.5);
    this._windowFrame.rotation.x = 0;
    this._roomScene.add(this._windowFrame);
    this._windowQuad.renderOrder = 1;
    this._windowFrame.renderOrder = 0;
    console.log('WebXR: Windowed mode – floating window', quadWidth.toFixed(1) + 'm x ' + quadHeight.toFixed(1) + 'm at 1.5m');
  }

  /**
   * Cleanup windowed mode (dispose RT and room).
   */
  cleanupWindowedMode() {
    if (this._windowFrame) {
      if (this._windowFrame.geometry) this._windowFrame.geometry.dispose();
      if (this._windowFrame.material) this._windowFrame.material.dispose();
      this._windowFrame = null;
    }
    if (this._windowQuad && this._windowQuad.geometry) this._windowQuad.geometry.dispose();
    if (this._windowQuad && this._windowQuad.material) {
      if (this._windowQuad.material.map) this._windowQuad.material.map.dispose();
      this._windowQuad.material.dispose();
    }
    if (this._renderTarget) {
      this._renderTarget.dispose();
      this._renderTarget = null;
    }
    this._roomScene = null;
    this._windowQuad = null;
    console.log('WebXR: Windowed mode cleaned up');
  }

  /**
   * Get the room scene (for adding XR UI, etc.) when in windowed mode.
   * @returns {THREE.Scene|null}
   */
  getRoomScene() {
    return this._roomScene;
  }

  /**
   * Get the render target used for the window texture (for aspect ratio, etc.).
   * @returns {{ width: number, height: number }|null}
   */
  getWindowSize() {
    if (!this._renderTarget) return null;
    return { width: this._renderTarget.width, height: this._renderTarget.height };
  }

  /**
   * Render: content scene with contentCamera to texture, then room with viewer camera.
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Scene} contentScene - Main solar system scene
   * @param {THREE.PerspectiveCamera} contentCamera - Camera that views the content (2D logic)
   * @param {THREE.PerspectiveCamera} viewerCamera - XR viewer camera (do not modify)
   */
  renderWindowed(renderer, contentScene, contentCamera, viewerCamera) {
    if (!this._renderTarget || !this._roomScene || !this._windowQuad) return;
    const THREE = typeof globalThis !== 'undefined' && globalThis.THREE ? globalThis.THREE : (typeof window !== 'undefined' && window.THREE);
    const rt = this._renderTarget;
    contentCamera.aspect = rt.width / rt.height;
    contentCamera.updateProjectionMatrix();
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(contentScene, contentCamera);
    renderer.setRenderTarget(null);
    if (THREE && renderer.getClearColor && renderer.getClearAlpha) {
      const oldClear = new THREE.Color();
      const oldAlpha = renderer.getClearAlpha();
      renderer.getClearColor(oldClear);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(this._roomScene, viewerCamera);
      renderer.setClearColor(oldClear, oldAlpha);
    } else {
      renderer.render(this._roomScene, viewerCamera);
    }
  }

  /**
   * Setup scene for XR viewing (immersive mode)
   * Scales and positions the scene content group appropriately
   */
  setupScene() {
    if (!this.sceneContentGroup) {
      console.warn('WebXR: sceneContentGroup not available');
      return;
    }

    // Calculate current time height
    let currentTimeHeight = 0;
    if (typeof calculateCurrentDateHeight === 'function') {
      currentTimeHeight = calculateCurrentDateHeight();
    } else if (typeof getHeightForYear === 'function' && typeof currentYear !== 'undefined') {
      currentTimeHeight = getHeightForYear(currentYear, 1);
    } else {
      // Fallback: assume year 2025
      currentTimeHeight = 2500;
    }

    // Calculate appropriate scale
    // Scene units are large (2500+ for year 2025)
    // Scale to fit comfortably in VR space
    const scaleFactor = this.calculateOptimalScale(currentTimeHeight);
    this.sceneContentGroup.scale.set(scaleFactor, scaleFactor, scaleFactor);

    // Position scene: orbital plane slightly below viewer; offset X so we're at Mars orbit looking in
    const scaledCurrentHeight = currentTimeHeight * scaleFactor;
    const planeBelow = typeof this.config.planeBelowViewer === 'number' ? this.config.planeBelowViewer : 0.12;
    const heightOffset = -planeBelow - scaledCurrentHeight;
    const offsetX = typeof this.config.viewOffsetX === 'number' ? this.config.viewOffsetX : 0;

    this.sceneContentGroup.position.set(offsetX, heightOffset, this.config.viewingDistance);
    this._placement = { x: offsetX, y: heightOffset, z: this.config.viewingDistance, scale: scaleFactor };

    console.log('WebXR: Scene setup complete');
    console.log(`  Scale: ${scaleFactor.toFixed(4)}`);
    console.log(`  Position: (${offsetX.toFixed(2)}, ${heightOffset.toFixed(2)}, ${this.config.viewingDistance})`);
    console.log(`  Current time height (scaled): ${scaledCurrentHeight.toFixed(2)}m`);

    // Ensure all content is visible
    // Log what's in the scene content group
    const childrenCount = this.sceneContentGroup.children.length;
    console.log(`WebXR: Scene content group has ${childrenCount} children`);
    
    // Verify planets are present
    const planetMeshes = this.sceneContentGroup.children.filter(
      child => child.userData && child.userData.type === 'planet'
    );
    console.log(`WebXR: Found ${planetMeshes.length} planet meshes in scene`);
  }

  /**
   * Calculate optimal scale factor for the scene
   * @param {number} currentTimeHeight - Current time height in scene units
   * @returns {number} Scale factor
   */
  calculateOptimalScale(currentTimeHeight) {
    // Base scale factor
    let scale = this.config.scaleFactor;

    // Adjust based on scene size
    // For very large scenes, scale down more
    if (currentTimeHeight > 5000) {
      scale = this.config.minScale;
    } else if (currentTimeHeight < 1000) {
      scale = this.config.maxScale;
    }

    return scale;
  }

  /**
   * Re-apply cached scene placement (call each frame in XR so nothing overwrites it).
   */
  applyScenePlacement() {
    if (!this.sceneContentGroup || !this._placement) return;
    const p = this._placement;
    this.sceneContentGroup.position.set(p.x, p.y, p.z);
    this.sceneContentGroup.scale.setScalar(p.scale);
  }

  /**
   * Cleanup scene when exiting XR
   */
  cleanupScene() {
    this._placement = null;
    if (this.sceneContentGroup) {
      this.sceneContentGroup.position.set(0, 0, 0);
      this.sceneContentGroup.scale.set(1, 1, 1);
      this.sceneContentGroup.rotation.set(0, 0, 0);
      console.log('WebXR: Scene reset to default');
    }
  }

  /**
   * Handle session end
   */
  handleSessionEnd() {
    this.isActive = false;
    this.session = null;
    this.referenceSpace = null;
    this.inputSources = [];
    if (this.windowedMode) {
      this.cleanupWindowedMode();
    } else {
      this.cleanupScene();
    }
    console.log('WebXR: Session ended');
  }

  /**
   * Get current input sources (controllers/hands)
   * @returns {Array}
   */
  getInputSources() {
    if (!this.session) return [];
    return Array.from(this.session.inputSources || []);
  }

  /**
   * Get reference space
   * @returns {XRReferenceSpace|null}
   */
  getReferenceSpace() {
    return this.referenceSpace;
  }

  /**
   * Check if currently in XR mode
   * @returns {boolean}
   */
  isPresenting() {
    return this.renderer.xr.isPresenting && this.isActive;
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WebXRAdapter;
} else {
  window.WebXRAdapter = WebXRAdapter;
}
