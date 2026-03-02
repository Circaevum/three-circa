# Migration Guide: Refactoring to Circaevum GL

This guide shows how to refactor the existing Circaevum code into a clean graphics library architecture.

## Current Structure

```
circaevum/
├── js/
│   ├── main.js          # Everything in one file (2000+ lines)
│   ├── config.js
│   ├── datetime.js
│   ├── scene-geometry.js
│   ├── timemarkers.js
│   └── worldlines.js
└── css/
    └── styles.css
```

## Target Structure

```
circaevum/
├── js/
│   ├── api/
│   │   └── circaevum-gl.js      # Public API (NEW)
│   ├── core/
│   │   ├── scene-core.js         # Scene initialization (EXTRACT from main.js)
│   │   ├── camera-controls.js    # Camera/navigation (EXTRACT from main.js)
│   │   └── time-system.js        # Time calculations (EXTRACT from main.js)
│   ├── layers/
│   │   ├── event-layer.js        # Layer management (NEW)
│   │   └── layer-renderer.js     # Layer rendering (NEW)
│   ├── renderers/
│   │   ├── planet-renderer.js    # Planet rendering (EXTRACT from main.js)
│   │   ├── worldline-renderer.js # Worldlines (REFACTOR from worldlines.js)
│   │   ├── timemarker-renderer.js # Time markers (REFACTOR from timemarkers.js)
│   │   └── event-renderer.js     # Event visualization (NEW)
│   ├── config.js                 # Keep as-is
│   ├── datetime.js                # Keep as-is
│   └── scene-geometry.js         # Keep as-is
└── css/
    └── styles.css                 # Keep as-is
```

## Step-by-Step Migration

### Phase 1: Extract Core Scene Logic

**Goal**: Separate scene initialization from the rest of the code.

#### 1.1 Create `js/core/scene-core.js`

```javascript
/**
 * Scene Core - Scene initialization and management
 * Extracted from main.js
 */

let scene, camera, renderer, sceneContentGroup;

function initScene(options = {}) {
  // Move scene initialization code from main.js here
  scene = new THREE.Scene();
  scene.background = new THREE.Color(options.backgroundColor || SCENE_CONFIG.backgroundColor);
  
  sceneContentGroup = new THREE.Group();
  scene.add(sceneContentGroup);
  
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 20000);
  // ... rest of initialization
  
  return { scene, camera, renderer, sceneContentGroup };
}

function getScene() {
  return { scene, camera, renderer, sceneContentGroup };
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { initScene, getScene };
} else {
  window.SceneCore = { initScene, getScene };
}
```

#### 1.2 Update `main.js`

```javascript
// At the top, import or use SceneCore
// Remove scene initialization code, replace with:
const { scene, camera, renderer, sceneContentGroup } = SceneCore.initScene({
  backgroundColor: SCENE_CONFIG.backgroundColor
});
```

### Phase 2: Extract Camera Controls

#### 2.1 Create `js/core/camera-controls.js`

```javascript
/**
 * Camera Controls - Camera and navigation management
 * Extracted from main.js
 */

class CameraControls {
  constructor(camera, renderer, sceneContentGroup) {
    this.camera = camera;
    this.renderer = renderer;
    this.sceneContentGroup = sceneContentGroup;
    
    this.currentZoom = 2;
    this.cameraRotation = { x: Math.PI / 6, y: 0 };
    this.focusPoint = new THREE.Vector3(0, 0, 0);
    this.targetFocusPoint = new THREE.Vector3(0, 0, 0);
    // ... other camera state
  }

  setZoomLevel(level) {
    this.currentZoom = level;
    // Move setZoomLevel logic here
  }

  navigateToTime(date) {
    // Move navigation logic here
  }

  // ... other camera methods
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CameraControls;
} else {
  window.CameraControls = CameraControls;
}
```

### Phase 3: Create Event Renderer

#### 3.1 Create `js/renderers/event-renderer.js`

```javascript
/**
 * Event Renderer - Renders events in the 3D scene
 * NEW: Integrates with existing scene geometry system
 */

const EventRenderer = (function() {
  let scene, sceneContentGroup, calculateDateHeight, getAngle, SceneGeometry;

  function init(dependencies) {
    scene = dependencies.scene;
    sceneContentGroup = dependencies.sceneContentGroup;
    calculateDateHeight = dependencies.calculateDateHeight;
    getAngle = dependencies.getAngle;
    SceneGeometry = dependencies.SceneGeometry;
  }

  /**
   * Create event marker (for point events)
   */
  function createEventMarker(event, layerConfig) {
    const eventDate = event.startTime || event.start || event.date;
    const date = eventDate instanceof Date ? eventDate : new Date(eventDate);
    
    // Use existing height calculation system
    const height = calculateDateHeight(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      date.getHours()
    );

    // Use existing angle system
    const currentDateHeight = calculateCurrentDateHeight();
    const angle = SceneGeometry.getAngle(height, currentDateHeight);
    
    // Create sprite or mesh
    const geometry = new THREE.SphereGeometry(0.5, 16, 16);
    const material = new THREE.MeshStandardMaterial({
      color: layerConfig.color || event.color || '#ffffff',
      emissive: layerConfig.color || event.color || '#ffffff',
      emissiveIntensity: 0.5,
    });
    
    const marker = new THREE.Mesh(geometry, material);
    
    // Position using existing geometry system
    const position = SceneGeometry.getPosition3D(height, angle, 50); // 50 = Earth distance
    marker.position.set(position.x, position.y, position.z);
    
    // Store event data
    marker.userData = {
      event: event,
      layerId: layerConfig.id,
      type: 'event-marker'
    };
    
    return marker;
  }

  /**
   * Create event worldline (for duration-based events)
   */
  function createEventWorldline(event, layerConfig) {
    const startDate = event.startTime || event.start || event.date;
    const endDate = event.endTime || event.end;
    
    if (!endDate) {
      // No end time, just create a marker
      return createEventMarker(event, layerConfig);
    }

    const start = startDate instanceof Date ? startDate : new Date(startDate);
    const end = endDate instanceof Date ? endDate : new Date(endDate);
    
    const startHeight = calculateDateHeight(
      start.getFullYear(), start.getMonth(), start.getDate(), start.getHours()
    );
    const endHeight = calculateDateHeight(
      end.getFullYear(), end.getMonth(), end.getDate(), end.getHours()
    );
    
    const currentDateHeight = calculateCurrentDateHeight();
    const radius = 50; // Earth distance
    
    // Use existing helical curve system
    const points = SceneGeometry.createEarthHelicalCurve(
      startHeight,
      endHeight,
      radius,
      currentDateHeight,
      64
    );
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    
    const material = new THREE.LineBasicMaterial({
      color: layerConfig.color || event.color || '#ffffff',
      transparent: true,
      opacity: layerConfig.opacity || 0.6,
      linewidth: 2
    });
    
    const worldline = new THREE.Line(geometry, material);
    worldline.userData = {
      event: event,
      layerId: layerConfig.id,
      type: 'event-worldline'
    };
    
    return worldline;
  }

  /**
   * Create event objects for a layer
   */
  function createEventObjects(events, layerConfig, sceneContentGroup, scene) {
    const objects = [];
    
    events.forEach(event => {
      let obj;
      
      if (event.endTime || event.end) {
        // Duration-based event - create worldline
        obj = createEventWorldline(event, layerConfig);
      } else {
        // Point event - create marker
        obj = createEventMarker(event, layerConfig);
      }
      
      if (obj) {
        sceneContentGroup.add(obj);
        objects.push(obj);
      }
    });
    
    return objects;
  }

  return {
    init,
    createEventMarker,
    createEventWorldline,
    createEventObjects
  };
})();

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = EventRenderer;
} else {
  window.EventRenderer = EventRenderer;
}
```

### Phase 4: Update Circaevum GL API

Update `js/api/circaevum-gl.js` to use the extracted modules:

```javascript
// At the top of circaevum-gl.js

// Import or use the extracted modules
const { initScene, getScene } = SceneCore;
const CameraControls = window.CameraControls;

class CircaevumGL {
  constructor(container, options = {}) {
    // ... existing code ...
    
    // Initialize using extracted modules
    const sceneData = initScene({
      backgroundColor: options.backgroundColor || SCENE_CONFIG.backgroundColor
    });
    
    this.scene = sceneData.scene;
    this.camera = sceneData.camera;
    this.renderer = sceneData.renderer;
    this.sceneContentGroup = sceneData.sceneContentGroup;
    
    // Initialize camera controls
    this.cameraControls = new CameraControls(
      this.camera,
      this.renderer,
      this.sceneContentGroup
    );
    
    // Initialize event renderer
    if (typeof EventRenderer !== 'undefined') {
      EventRenderer.init({
        scene: this.scene,
        sceneContentGroup: this.sceneContentGroup,
        calculateDateHeight: calculateDateHeight,
        getAngle: (height, currentHeight) => {
          return SceneGeometry.getAngle(height, currentHeight);
        },
        SceneGeometry: SceneGeometry
      });
    }
  }

  // ... rest of the API ...
  
  _renderLayer(layerId) {
    // ... existing code ...
    
    // Use EventRenderer
    if (typeof EventRenderer !== 'undefined' && EventRenderer.createEventObjects) {
      const objects = EventRenderer.createEventObjects(
        filteredEvents,
        layer,
        this.sceneContentGroup,
        this.scene
      );
      
      if (!this._layerObjects) {
        this._layerObjects = new Map();
      }
      this._layerObjects.set(layerId, objects);
    }
  }
}
```

### Phase 5: Update HTML to Load New Structure

Update `index.html` or your script loading:

```html
<!-- Load in dependency order -->
<script src="circaevum/js/three.min.js"></script>
<script src="circaevum/js/config.js"></script>
<script src="circaevum/js/datetime.js"></script>
<script src="circaevum/js/scene-geometry.js"></script>

<!-- Core modules -->
<script src="circaevum/js/core/scene-core.js"></script>
<script src="circaevum/js/core/camera-controls.js"></script>

<!-- Renderers -->
<script src="circaevum/js/worldlines.js"></script>
<script src="circaevum/js/timemarkers.js"></script>
<script src="circaevum/js/renderers/event-renderer.js"></script>

<!-- API -->
<script src="circaevum/js/api/circaevum-gl.js"></script>
```

## Migration Checklist

- [ ] Extract scene initialization to `scene-core.js`
- [ ] Extract camera controls to `camera-controls.js`
- [ ] Create `event-renderer.js` using existing geometry system
- [ ] Update `circaevum-gl.js` to use extracted modules
- [ ] Test that existing functionality still works
- [ ] Create React wrapper component
- [ ] Build layer management UI
- [ ] Integrate with account management

## Testing Strategy

1. **Backward Compatibility**: Ensure existing standalone usage still works
2. **API Testing**: Test all CircaevumGL API methods
3. **Layer Testing**: Test adding/removing/updating layers
4. **Event Testing**: Test event rendering and interaction
5. **React Integration**: Test React wrapper component

## Rollback Plan

If issues arise:
1. Keep old `main.js` as backup
2. Use feature flags to switch between old/new code
3. Gradually migrate features one at a time

## Next Steps After Migration

1. Add event interaction (click, hover)
2. Implement layer filtering
3. Add auto-zoom features
4. Build sharing system
5. Optimize performance for many events
