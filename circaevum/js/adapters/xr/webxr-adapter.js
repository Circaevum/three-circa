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
    
    // XR scene configuration
    this.config = {
      scaleFactor: 0.002,        // Scale scene to fit VR (slightly larger than before)
      eyeLevel: 1.6,              // Comfortable eye level in meters
      viewingDistance: -6.0,      // Distance from scene in meters
      minScale: 0.0005,           // Minimum scale for very large scenes
      maxScale: 0.01              // Maximum scale for very small scenes
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
   * @returns {Promise<XRSession>}
   */
  async enterXR(mode = 'immersive-vr') {
    if (!('xr' in navigator)) {
      throw new Error('WebXR not available');
    }

    try {
      const session = await navigator.xr.requestSession(mode, {
        optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking']
      });

      this.session = session;
      this.renderer.xr.setSession(session);
      this.isActive = true;

      // Get reference space
      try {
        this.referenceSpace = await session.requestReferenceSpace('local-floor');
        console.log('WebXR: Using local-floor reference space');
      } catch (error) {
        console.warn('WebXR: Falling back to local reference space', error);
        this.referenceSpace = await session.requestReferenceSpace('local');
      }

      // Setup scene for XR
      this.setupScene();

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
   * Setup scene for XR viewing
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

    // Position scene for comfortable viewing
    const scaledCurrentHeight = currentTimeHeight * scaleFactor;
    const heightOffset = this.config.eyeLevel - scaledCurrentHeight;

    this.sceneContentGroup.position.set(0, heightOffset, this.config.viewingDistance);

    console.log('WebXR: Scene setup complete');
    console.log(`  Scale: ${scaleFactor.toFixed(4)}`);
    console.log(`  Position: (0, ${heightOffset.toFixed(2)}, ${this.config.viewingDistance})`);
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
   * Cleanup scene when exiting XR
   */
  cleanupScene() {
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
    this.cleanupScene();
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
