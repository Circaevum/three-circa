/**
 * XR Input Adapter
 * 
 * Handles input from XR controllers and hand tracking.
 * Provides zoom level and time selection controls for VR.
 * 
 * Reference: spec/api/api-contract.md (Navigation API)
 */

class XRInputAdapter {
  constructor(xrAdapter, sceneCore) {
    this.xrAdapter = xrAdapter;
    this.sceneCore = sceneCore;
    this.controllers = [];
    this.handTracking = null;
    
    // Input state
    this.lastFrameTime = 0;
    this.buttonStates = new Map();
    
    // Movement configuration
    this.config = {
      moveSpeed: 2.0,           // meters per second
      rotationSpeed: 1.0,       // radians per second
      zoomSpeed: 0.1,           // zoom change per frame
      deadZone: 0.1            // thumbstick dead zone
    };
  }

  /**
   * Initialize XR input system
   * @param {XRSession} session - XR session
   */
  init(session) {
    this.setupControllers(session);
    
    // Setup hand tracking if available
    if (session.enabledFeatures && session.enabledFeatures.includes('hand-tracking')) {
      this.setupHandTracking(session);
    }
  }

  /**
   * Setup controller input
   */
  setupControllers(session) {
    const renderer = this.xrAdapter.renderer;
    
    // Left controller
    const controller1 = renderer.xr.getController(0);
    controller1.addEventListener('connected', (e) => {
      const controller = {
        index: 0,
        inputSource: e.data,
        gamepad: e.data.gamepad,
        mesh: this.createControllerMesh()
      };
      this.controllers.push(controller);
      controller1.add(controller.mesh);
      console.log('XR Input: Left controller connected');
    });
    controller1.addEventListener('disconnected', () => {
      this.controllers = this.controllers.filter(c => c.index !== 0);
      console.log('XR Input: Left controller disconnected');
    });

    // Right controller
    const controller2 = renderer.xr.getController(1);
    controller2.addEventListener('connected', (e) => {
      const controller = {
        index: 1,
        inputSource: e.data,
        gamepad: e.data.gamepad,
        mesh: this.createControllerMesh()
      };
      this.controllers.push(controller);
      controller2.add(controller.mesh);
      console.log('XR Input: Right controller connected');
    });
    controller2.addEventListener('disconnected', () => {
      this.controllers = this.controllers.filter(c => c.index !== 1);
      console.log('XR Input: Right controller disconnected');
    });
  }

  /**
   * Create controller mesh for visualization
   */
  createControllerMesh() {
    const geometry = new THREE.BoxGeometry(0.05, 0.05, 0.15);
    const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    return new THREE.Mesh(geometry, material);
  }

  /**
   * Setup hand tracking
   */
  setupHandTracking(session) {
    // Hand tracking implementation would go here
    // For now, just log that it's available
    console.log('XR Input: Hand tracking available');
  }

  /**
   * Handle input per frame
   * @param {XRFrame} frame - Current XR frame
   */
  handleInput(frame) {
    if (!this.xrAdapter.isPresenting()) return;

    const inputSources = this.xrAdapter.getInputSources();
    const deltaTime = frame ? (frame.elapsedTime - this.lastFrameTime) : 0.016;
    this.lastFrameTime = frame ? frame.elapsedTime : 0;

    for (const inputSource of inputSources) {
      if (inputSource.gamepad) {
        this.handleGamepadInput(inputSource.gamepad, deltaTime);
      }
      
      // Handle button presses for UI interaction
      this.handleButtonInput(inputSource, frame);
    }
  }

  /**
   * Handle gamepad input (thumbsticks, triggers)
   * @param {Gamepad} gamepad - Gamepad object
   * @param {number} deltaTime - Time since last frame
   */
  handleGamepadInput(gamepad, deltaTime) {
    // Movement (left thumbstick - axes 2, 3)
    const leftStickX = gamepad.axes[2] || 0;
    const leftStickY = gamepad.axes[3] || 0;
    
    // Apply dead zone
    const moveX = Math.abs(leftStickX) > this.config.deadZone ? leftStickX : 0;
    const moveZ = Math.abs(leftStickY) > this.config.deadZone ? leftStickY : 0;
    
    // Rotation (right thumbstick - axes 0, 1)
    const rightStickX = gamepad.axes[0] || 0;
    const rotateY = Math.abs(rightStickX) > this.config.deadZone ? rightStickX : 0;
    
    // Zoom (triggers)
    const leftTrigger = gamepad.buttons[6]?.value || 0;
    const rightTrigger = gamepad.buttons[7]?.value || 0;
    
    // Apply movement/rotation (if sceneCore has movement methods)
    if (this.sceneCore && typeof this.sceneCore.move === 'function') {
      this.sceneCore.move(moveX * this.config.moveSpeed * deltaTime, 
                          moveZ * this.config.moveSpeed * deltaTime);
    }
    
    if (this.sceneCore && typeof this.sceneCore.rotate === 'function') {
      this.sceneCore.rotate(rotateY * this.config.rotationSpeed * deltaTime);
    }
    
    // Handle zoom
    if (leftTrigger > 0.5) {
      // Zoom in
      this.handleZoomChange(-1);
    }
    if (rightTrigger > 0.5) {
      // Zoom out
      this.handleZoomChange(1);
    }
  }

  /**
   * Handle zoom level change
   * @param {number} direction - -1 for zoom in, 1 for zoom out
   */
  handleZoomChange(direction) {
    if (!this.sceneCore) return;
    
    const currentZoom = this.sceneCore.currentZoom || 2;
    const minZoom = 1;
    const maxZoom = 9;
    
    const newZoom = Math.max(minZoom, Math.min(maxZoom, currentZoom + direction));
    
    if (newZoom !== currentZoom && typeof this.sceneCore.setZoomLevel === 'function') {
      this.sceneCore.setZoomLevel(newZoom);
      console.log(`XR Input: Zoom changed to level ${newZoom}`);
    }
  }

  /**
   * Handle button presses for UI interaction
   * @param {XRInputSource} inputSource - Input source
   * @param {XRFrame} frame - Current frame
   */
  handleButtonInput(inputSource, frame) {
    // Button mapping:
    // - A/X button (button 0): Open time selector
    // - B/Y button (button 1): Open layer panel
    // - Menu button (button 2): Toggle UI visibility
    // - Grip button (button 4/5): Grab/select
    
    if (!inputSource.gamepad) return;
    
    const buttons = inputSource.gamepad.buttons;
    
    // Check for button presses
    for (let i = 0; i < buttons.length; i++) {
      const button = buttons[i];
      const buttonKey = `${inputSource.handedness || 'unknown'}-${i}`;
      
      if (button.pressed && !this.buttonStates.get(buttonKey)) {
        // Button just pressed
        this.buttonStates.set(buttonKey, true);
        this.onButtonPress(i, inputSource);
      } else if (!button.pressed && this.buttonStates.get(buttonKey)) {
        // Button just released
        this.buttonStates.set(buttonKey, false);
        this.onButtonRelease(i, inputSource);
      }
    }
  }

  /**
   * Handle button press
   * @param {number} buttonIndex - Button index
   * @param {XRInputSource} inputSource - Input source
   */
  onButtonPress(buttonIndex, inputSource) {
    console.log(`XR Input: Button ${buttonIndex} pressed on ${inputSource.handedness || 'unknown'} controller`);
    
    // Emit events for UI system to handle
    if (typeof window.dispatchEvent === 'function') {
      const event = new CustomEvent('xr-button-press', {
        detail: { buttonIndex, inputSource }
      });
      window.dispatchEvent(event);
    }
  }

  /**
   * Handle button release
   * @param {number} buttonIndex - Button index
   * @param {XRInputSource} inputSource - Input source
   */
  onButtonRelease(buttonIndex, inputSource) {
    // Handle button release if needed
  }

  /**
   * Cleanup
   */
  cleanup() {
    this.controllers = [];
    this.buttonStates.clear();
    this.lastFrameTime = 0;
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = XRInputAdapter;
} else {
  window.XRInputAdapter = XRInputAdapter;
}
