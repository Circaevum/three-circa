# XR Restructure Proposal

## Current Issues

1. **XR Mode Problems:**
   - Only sun line visible, no planets/worldlines
   - No UI for zoom/time controls in VR
   - No interaction beyond movement
   - Scene scaling/positioning may be hiding content

2. **Architecture Issues:**
   - All code in `main.js` (2000+ lines)
   - XR code tightly coupled to desktop controls
   - No abstraction for different XR systems
   - Not aligned with spec structure

## Proposed Structure

```
js/
├── core/                          # Platform-agnostic core
│   ├── scene-core.js              # Scene initialization
│   ├── planet-renderer.js         # Planet rendering
│   ├── worldline-renderer.js      # Worldline rendering
│   ├── timemarker-renderer.js     # Time marker rendering
│   ├── event-renderer.js          # VEVENT-based event rendering
│   └── zoom-manager.js            # Zoom level management
│
├── adapters/                      # Platform-specific adapters
│   ├── xr/                        # XR system adapters
│   │   ├── webxr-adapter.js      # WebXR implementation
│   │   ├── openxr-adapter.js     # OpenXR (future)
│   │   └── xr-adapter-base.js    # Base class for XR adapters
│   │
│   └── input/                     # Input system adapters
│       ├── desktop-input.js       # Mouse/keyboard
│       ├── xr-input.js            # XR controller/hand tracking
│       └── input-adapter-base.js  # Base class
│
├── ui/                            # UI systems
│   ├── desktop-ui.js              # Desktop HUD
│   ├── xr-ui.js                   # VR UI (floating panels)
│   └── ui-base.js                 # Base UI class
│
├── utils/                         # Utilities
│   ├── vevent.js                  # VEVENT format (existing)
│   └── geometry-helpers.js        # Geometry calculations
│
├── config.js                      # Configuration (existing)
├── datetime.js                    # Date/time (existing)
├── scene-geometry.js              # Geometry (existing)
└── main.js                         # Thin initialization layer
```

## XR Adapter System

### Base XR Adapter (`xr-adapter-base.js`)

```javascript
/**
 * Base class for XR adapters
 * Allows support for multiple XR systems (WebXR, OpenXR, etc.)
 */
class XRAdapterBase {
  constructor(scene, camera, renderer) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.isActive = false;
  }

  /**
   * Check if this XR system is supported
   * @returns {Promise<boolean>}
   */
  async isSupported() {
    throw new Error('Must implement isSupported()');
  }

  /**
   * Enter XR mode
   * @returns {Promise<XRSession>}
   */
  async enterXR() {
    throw new Error('Must implement enterXR()');
  }

  /**
   * Exit XR mode
   */
  async exitXR() {
    throw new Error('Must implement exitXR()');
  }

  /**
   * Get input sources (controllers/hands)
   * @returns {Array}
   */
  getInputSources() {
    return [];
  }

  /**
   * Setup scene for XR (scaling, positioning)
   */
  setupScene(sceneContentGroup) {
    // Default: no transformation
    // Subclasses override for their specific needs
  }

  /**
   * Cleanup scene when exiting XR
   */
  cleanupScene(sceneContentGroup) {
    // Reset transformations
    if (sceneContentGroup) {
      sceneContentGroup.position.set(0, 0, 0);
      sceneContentGroup.scale.set(1, 1, 1);
      sceneContentGroup.rotation.set(0, 0, 0);
    }
  }
}
```

### WebXR Adapter (`webxr-adapter.js`)

```javascript
/**
 * WebXR adapter implementation
 */
class WebXRAdapter extends XRAdapterBase {
  constructor(scene, camera, renderer) {
    super(scene, camera, renderer);
    this.session = null;
    this.referenceSpace = null;
    this.inputSources = [];
  }

  async isSupported() {
    if (!('xr' in navigator)) return false;
    try {
      return await navigator.xr.isSessionSupported('immersive-vr') ||
             await navigator.xr.isSessionSupported('immersive-ar');
    } catch {
      return false;
    }
  }

  async enterXR() {
    if (!('xr' in navigator)) {
      throw new Error('WebXR not available');
    }

    const session = await navigator.xr.requestSession('immersive-vr', {
      optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking']
    });

    this.session = session;
    this.renderer.xr.setSession(session);

    // Get reference space
    try {
      this.referenceSpace = await session.requestReferenceSpace('local-floor');
    } catch {
      this.referenceSpace = await session.requestReferenceSpace('local');
    }

    // Setup scene for VR
    this.setupScene(this.sceneContentGroup);

    // Listen for input sources
    session.addEventListener('inputsourceschange', (e) => {
      this.inputSources = Array.from(session.inputSources);
    });

    return session;
  }

  async exitXR() {
    if (this.session) {
      await this.session.end();
      this.session = null;
      this.referenceSpace = null;
      this.inputSources = [];
      this.cleanupScene(this.sceneContentGroup);
    }
  }

  setupScene(sceneContentGroup) {
    if (!sceneContentGroup) return;

    // Calculate appropriate scale for VR
    // Scene units are large (2500+ for year 2025)
    // Scale to fit comfortably in VR space
    const scaleFactor = 0.002; // Slightly larger than before
    sceneContentGroup.scale.set(scaleFactor, scaleFactor, scaleFactor);

    // Position scene for comfortable viewing
    const currentTimeHeight = calculateCurrentDateHeight();
    const eyeLevel = 1.6; // meters
    const viewingDistance = -6.0; // meters
    const scaledHeight = currentTimeHeight * scaleFactor;
    const heightOffset = eyeLevel - scaledHeight;

    sceneContentGroup.position.set(0, heightOffset, viewingDistance);

    // Ensure all scene content is visible
    // Planets, worldlines, etc. should already be in sceneContentGroup
    console.log('WebXR: Scene scaled and positioned for VR');
  }

  getInputSources() {
    return this.inputSources || [];
  }
}
```

## XR Input System

### XR Input Adapter (`xr-input.js`)

```javascript
/**
 * XR input handling (controllers, hand tracking)
 */
class XRInputAdapter {
  constructor(xrAdapter, sceneCore) {
    this.xrAdapter = xrAdapter;
    this.sceneCore = sceneCore;
    this.controllers = [];
    this.handTracking = null;
  }

  /**
   * Initialize XR input
   */
  init(session) {
    // Setup controllers
    this.setupControllers(session);
    
    // Setup hand tracking if available
    if (session.enabledFeatures.includes('hand-tracking')) {
      this.setupHandTracking(session);
    }
  }

  /**
   * Setup controller input
   */
  setupControllers(session) {
    // Left controller
    const controller1 = this.renderer.xr.getController(0);
    controller1.addEventListener('connected', (e) => {
      this.controllers.push({
        index: 0,
        inputSource: e.data,
        gamepad: e.data.gamepad
      });
      this.setupControllerUI(controller1, 0);
    });

    // Right controller
    const controller2 = this.renderer.xr.getController(1);
    controller2.addEventListener('connected', (e) => {
      this.controllers.push({
        index: 1,
        inputSource: e.data,
        gamepad: e.data.gamepad
      });
      this.setupControllerUI(controller2, 1);
    });
  }

  /**
   * Handle controller input per frame
   */
  handleInput(frame) {
    const inputSources = this.xrAdapter.getInputSources();
    
    for (const inputSource of inputSources) {
      if (inputSource.gamepad) {
        this.handleGamepadInput(inputSource.gamepad, frame);
      }
      
      // Handle button presses for UI interaction
      this.handleButtonInput(inputSource, frame);
    }
  }

  /**
   * Handle gamepad input (thumbsticks, triggers)
   */
  handleGamepadInput(gamepad, frame) {
    // Movement (left thumbstick)
    const moveX = gamepad.axes[2] || 0; // Left thumbstick X
    const moveZ = gamepad.axes[3] || 0; // Left thumbstick Y
    
    // Rotation (right thumbstick)
    const rotateY = gamepad.axes[0] || 0; // Right thumbstick X
    
    // Zoom (triggers)
    const zoomIn = gamepad.buttons[6]?.pressed || false; // Left trigger
    const zoomOut = gamepad.buttons[7]?.pressed || false; // Right trigger
    
    // Apply movement/rotation
    // ... (existing movement logic)
    
    // Handle zoom
    if (zoomIn) {
      this.sceneCore.setZoomLevel(this.sceneCore.currentZoom + 1);
    }
    if (zoomOut) {
      this.sceneCore.setZoomLevel(this.sceneCore.currentZoom - 1);
    }
  }

  /**
   * Handle button presses for UI interaction
   */
  handleButtonInput(inputSource, frame) {
    // A/X button: Open time selector
    // B/Y button: Open layer panel
    // Menu button: Toggle UI visibility
    // ... (UI interaction logic)
  }
}
```

## XR UI System

### XR UI (`xr-ui.js`)

```javascript
/**
 * VR UI system (floating panels, laser pointers)
 */
class XRUI {
  constructor(scene, camera, renderer) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.panels = new Map();
    this.laserPointers = [];
  }

  /**
   * Create floating UI panel
   */
  createPanel(panelId, options = {}) {
    const panel = {
      id: panelId,
      group: new THREE.Group(),
      visible: true,
      position: options.position || new THREE.Vector3(0, 1.6, -1),
      size: options.size || { width: 0.8, height: 0.6 }
    };

    // Create panel mesh (flat plane with HTML texture or 3D elements)
    const geometry = new THREE.PlaneGeometry(panel.size.width, panel.size.height);
    const material = new THREE.MeshBasicMaterial({ 
      color: 0x000000,
      transparent: true,
      opacity: 0.9
    });
    const mesh = new THREE.Mesh(geometry, material);
    panel.group.add(mesh);

    // Add panel to scene
    this.scene.add(panel.group);
    this.panels.set(panelId, panel);

    return panel;
  }

  /**
   * Create zoom level selector panel
   */
  createZoomPanel() {
    const panel = this.createPanel('zoom-panel', {
      position: new THREE.Vector3(-0.5, 1.6, -1),
      size: { width: 0.4, height: 0.6 }
    });

    // Add zoom level buttons (3D buttons or HTML overlay)
    // ... (button creation logic)

    return panel;
  }

  /**
   * Create time selector panel
   */
  createTimePanel() {
    const panel = this.createPanel('time-panel', {
      position: new THREE.Vector3(0.5, 1.6, -1),
      size: { width: 0.4, height: 0.6 }
    });

    // Add time controls (date picker, time slider)
    // ... (time control creation)

    return panel;
  }

  /**
   * Create layer panel
   */
  createLayerPanel() {
    const panel = this.createPanel('layer-panel', {
      position: new THREE.Vector3(0, 1.2, -1),
      size: { width: 0.6, height: 0.4 }
    });

    // Add layer toggles
    // ... (layer UI creation)

    return panel;
  }

  /**
   * Show/hide panel
   */
  setPanelVisible(panelId, visible) {
    const panel = this.panels.get(panelId);
    if (panel) {
      panel.group.visible = visible;
    }
  }

  /**
   * Handle laser pointer interaction
   */
  handleLaserPointer(controller, frame) {
    // Cast ray from controller
    const ray = new THREE.Raycaster();
    ray.setFromXRController(controller, frame);

    // Check intersection with UI panels
    const intersections = ray.intersectObjects(
      Array.from(this.panels.values()).map(p => p.group),
      true
    );

    if (intersections.length > 0) {
      // Highlight button, handle click
      // ... (interaction logic)
    }
  }
}
```

## Migration Plan

### Phase 1: Extract Core Graphics
1. Create `core/scene-core.js` - Scene initialization
2. Create `core/planet-renderer.js` - Planet rendering
3. Create `core/worldline-renderer.js` - Worldline rendering
4. Create `core/timemarker-renderer.js` - Time marker rendering
5. Create `core/event-renderer.js` - VEVENT event rendering
6. Create `core/zoom-manager.js` - Zoom level management

### Phase 2: Create XR Adapter System
1. Create `adapters/xr/xr-adapter-base.js`
2. Create `adapters/xr/webxr-adapter.js`
3. Update `main.js` to use XR adapter

### Phase 3: Create XR Input System
1. Create `adapters/input/xr-input.js`
2. Implement controller/hand tracking input
3. Add zoom/time controls for VR

### Phase 4: Create XR UI System
1. Create `ui/xr-ui.js`
2. Implement floating panels for VR
3. Add laser pointer interaction

### Phase 5: Fix XR Rendering Issues
1. Ensure planets/worldlines render in XR
2. Fix scene scaling/positioning
3. Test with multiple XR headsets

## Benefits

1. **Multi-XR Support**: Easy to add OpenXR, Unity XR, etc.
2. **Separation of Concerns**: Core graphics independent of input/XR
3. **Spec Alignment**: Matches spec structure (core/, adapters/)
4. **Maintainability**: Smaller, focused modules
5. **Testability**: Each module can be tested independently
6. **XR Functionality**: Full UI and controls in VR mode
