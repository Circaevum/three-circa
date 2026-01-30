# Web Structure Implementation Guide

## Directory Structure

```
web/
├── js/
│   ├── api/
│   │   └── circaevum-gl.js          # Public API (matches Unity)
│   ├── core/
│   │   ├── scene-core.js             # Scene initialization
│   │   ├── camera-controls.js        # Camera/navigation
│   │   ├── time-system.js            # Time calculations
│   │   └── zoom-manager.js           # Zoom level management
│   ├── zoom/
│   │   ├── zoom-level-1.js           # Century (Z0 equivalent)
│   │   ├── zoom-level-3.js           # Year (Z1 equivalent)
│   │   ├── zoom-level-8.js          # Day (Z2 equivalent)
│   │   └── zoom-level-9.js          # Clock (extends Z2)
│   ├── layers/
│   │   ├── layer-manager.js          # Layer management
│   │   ├── layer-renderer.js        # Layer rendering
│   │   └── layer-filter.js          # Layer filtering
│   ├── renderers/
│   │   ├── planet-renderer.js       # Planet rendering
│   │   ├── worldline-renderer.js    # Worldlines
│   │   ├── timemarker-renderer.js   # Time markers
│   │   └── event-renderer.js        # Event visualization
│   ├── pipeline/
│   │   ├── nakama-client.js         # Nakama connection
│   │   ├── event-fetcher.js        # Fetch from Nakama
│   │   └── event-storage.js        # Save to Nakama
│   ├── utils/
│   │   ├── schema-validator.js      # Schema validation
│   │   └── google-event-adapter.js  # Google Event handling
│   ├── config.js                    # Configuration
│   ├── datetime.js                  # Date/time utilities
│   └── scene-geometry.js            # Geometry calculations
├── css/
│   └── styles.css
└── package.json
```

## Key Files

### Public API

**js/api/circaevum-gl.js:**
```javascript
/**
 * Circaevum GL - Public API
 * Matches Unity CircaevumGL API
 */

import { SceneCore } from '../core/scene-core.js';
import { EventRenderer } from '../renderers/event-renderer.js';
import { LayerManager } from '../layers/layer-manager.js';
import { ZoomManager } from '../core/zoom-manager.js';
import { validateGoogleEvent } from '../utils/google-event-adapter.js';

class CircaevumGL {
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      zoomLevel: options.zoomLevel || 2,
      lightMode: options.lightMode || false,
      ...options
    };

    // Initialize scene
    const sceneData = SceneCore.initScene({
      backgroundColor: options.backgroundColor || 0x000814
    });
    
    this.scene = sceneData.scene;
    this.camera = sceneData.camera;
    this.renderer = sceneData.renderer;
    this.sceneContentGroup = sceneData.sceneContentGroup;

    // Initialize managers
    this.layerManager = new LayerManager(this.sceneContentGroup);
    this.zoomManager = new ZoomManager(this, this.options.zoomLevel);
    this.eventRenderer = new EventRenderer(this.sceneContentGroup);
  }

  // Layer Management
  addLayer(layerId, config = {}) {
    this.layerManager.addLayer(layerId, config);
  }

  removeLayer(layerId) {
    this.layerManager.removeLayer(layerId);
  }

  setLayerVisibility(layerId, visible) {
    this.layerManager.setVisibility(layerId, visible);
  }

  updateLayerStyle(layerId, style) {
    this.layerManager.updateStyle(layerId, style);
  }

  // Event Management (Google Event format)
  addEvents(layerId, events) {
    // Validate events are Google Calendar Event format
    const validatedEvents = events.map(event => {
      if (!validateGoogleEvent(event)) {
        console.warn('Invalid Google Event format:', event);
        return null;
      }
      return event;
    }).filter(e => e !== null);

    this.layerManager.addEvents(layerId, validatedEvents);
    this.eventRenderer.renderEvents(layerId, validatedEvents, this.layerManager.getLayer(layerId));
  }

  removeEvents(layerId, eventIds) {
    this.layerManager.removeEvents(layerId, eventIds);
    this.eventRenderer.removeEvents(layerId, eventIds);
  }

  updateEvents(layerId, events) {
    this.layerManager.updateEvents(layerId, events);
    this.eventRenderer.updateEvents(layerId, events, this.layerManager.getLayer(layerId));
  }

  // Navigation
  setZoomLevel(level) {
    this.options.zoomLevel = level;
    this.zoomManager.setZoomLevel(level);
  }

  navigateToTime(date) {
    this.zoomManager.navigateToTime(date);
  }

  fitToLayer(layerId) {
    const events = this.layerManager.getEvents(layerId);
    if (events.length === 0) return;
    
    // Calculate time range
    const times = events
      .map(e => e.start?.dateTime || e.start?.date)
      .filter(d => d)
      .map(d => new Date(d))
      .sort((a, b) => a - b);
    
    if (times.length === 0) return;
    
    // Determine appropriate zoom level
    const duration = times[times.length - 1] - times[0];
    const days = duration / (1000 * 60 * 60 * 24);
    
    let zoomLevel = 2;
    if (days <= 1) zoomLevel = 9;
    else if (days <= 7) zoomLevel = 8;
    else if (days <= 30) zoomLevel = 7;
    else if (days <= 90) zoomLevel = 5;
    else if (days <= 365) zoomLevel = 4;
    else if (days <= 365 * 10) zoomLevel = 3;
    else zoomLevel = 2;
    
    this.setZoomLevel(zoomLevel);
    this.navigateToTime(times[0]);
  }
}

export default CircaevumGL;
```

### Google Event Adapter

**js/utils/google-event-adapter.js:**
```javascript
/**
 * Google Event Format Adapter
 * Validates and adapts Google Calendar Event format
 * Matches Unity's Google.Apis.Calendar.v3.Data.Event usage
 */

/**
 * Validate Google Calendar Event format
 * @param {Object} event - Event object
 * @returns {boolean}
 */
export function validateGoogleEvent(event) {
  if (!event || typeof event !== 'object') return false;
  
  // Required fields (minimal)
  if (!event.id || !event.start) return false;
  
  // Start must have dateTime or date
  if (!event.start.dateTime && !event.start.date) return false;
  
  return true;
}

/**
 * Convert Google Event to internal format
 * @param {Object} googleEvent - Google Calendar Event
 * @returns {Object} Internal event format
 */
export function adaptGoogleEvent(googleEvent) {
  return {
    id: googleEvent.id,
    title: googleEvent.summary || 'No Title',
    startTime: googleEvent.start?.dateTime 
      ? new Date(googleEvent.start.dateTime)
      : new Date(googleEvent.start.date),
    endTime: googleEvent.end?.dateTime
      ? new Date(googleEvent.end.dateTime)
      : (googleEvent.end?.date ? new Date(googleEvent.end.date) : null),
    description: googleEvent.description || '',
    location: googleEvent.location || '',
    colorId: googleEvent.colorId || '0',
    layerId: googleEvent.layerId || 'default',
    metadata: {
      status: googleEvent.status,
      created: googleEvent.created,
      updated: googleEvent.updated,
      iCalUID: googleEvent.iCalUID
    }
  };
}

/**
 * Convert internal format back to Google Event format
 * @param {Object} event - Internal event format
 * @returns {Object} Google Calendar Event format
 */
export function toGoogleEventFormat(event) {
  return {
    id: event.id,
    summary: event.title,
    description: event.description,
    location: event.location,
    colorId: event.colorId,
    start: {
      dateTime: event.startTime?.toISOString() || null,
      date: event.startTime ? event.startTime.toISOString().split('T')[0] : null
    },
    end: event.endTime ? {
      dateTime: event.endTime.toISOString() || null,
      date: event.endTime.toISOString().split('T')[0] || null
    } : null,
    status: event.metadata?.status || 'confirmed'
  };
}
```

### Zoom Level Manager

**js/core/zoom-manager.js:**
```javascript
/**
 * Zoom Manager
 * Maps Web zoom levels (1-9) to Unity zoom levels (Z0, Z1, Z2)
 */

import { ZoomLevel1 } from '../zoom/zoom-level-1.js';  // Z0 equivalent
import { ZoomLevel3 } from '../zoom/zoom-level-3.js';  // Z1 equivalent
import { ZoomLevel8 } from '../zoom/zoom-level-8.js';  // Z2 equivalent

class ZoomManager {
  constructor(glInstance, initialZoom) {
    this.gl = glInstance;
    this.currentZoom = initialZoom;
    this.zoomHandlers = {
      1: new ZoomLevel1(glInstance),  // Century (Z0)
      3: new ZoomLevel3(glInstance),  // Year (Z1)
      8: new ZoomLevel8(glInstance)   // Day (Z2)
    };
  }

  setZoomLevel(level) {
    if (level < 1 || level > 9) {
      console.warn(`Invalid zoom level: ${level}. Must be 1-9.`);
      return;
    }

    this.currentZoom = level;
    
    // Use existing setZoomLevel if available (from main.js)
    if (typeof setZoomLevel === 'function') {
      setZoomLevel(level);
    }
    
    // Notify zoom handler if exists
    const handler = this.zoomHandlers[level];
    if (handler && handler.onZoomChanged) {
      handler.onZoomChanged(level);
    }
  }

  navigateToTime(date) {
    // Use existing navigation system
    if (typeof applySelectedDateToZoomLevel === 'function') {
      applySelectedDateToZoomLevel(date, this.currentZoom);
      if (typeof createPlanets === 'function') {
        createPlanets(this.currentZoom);
      }
    }
  }
}

export { ZoomManager };
```

### Event Renderer

**js/renderers/event-renderer.js:**
```javascript
/**
 * Event Renderer
 * Renders Google Calendar Events in 3D scene
 * Uses existing calculateDateHeight() system
 */

import { adaptGoogleEvent } from '../utils/google-event-adapter.js';

const EventRenderer = (function() {
  let sceneContentGroup, calculateDateHeight, SceneGeometry;

  function init(dependencies) {
    sceneContentGroup = dependencies.sceneContentGroup;
    calculateDateHeight = dependencies.calculateDateHeight;
    SceneGeometry = dependencies.SceneGeometry;
  }

  /**
   * Render events for a layer
   * @param {string} layerId - Layer identifier
   * @param {Array} events - Google Calendar Events
   * @param {Object} layerConfig - Layer configuration
   */
  function renderEvents(layerId, events, layerConfig) {
    if (!layerConfig || !layerConfig.visible) return;

    const objects = [];
    
    events.forEach(googleEvent => {
      const event = adaptGoogleEvent(googleEvent);
      
      // Use existing height calculation system
      const height = calculateDateHeight(
        event.startTime.getFullYear(),
        event.startTime.getMonth(),
        event.startTime.getDate(),
        event.startTime.getHours()
      );

      // Use existing angle system
      const currentDateHeight = calculateCurrentDateHeight();
      const angle = SceneGeometry.getAngle(height, currentDateHeight);
      
      // Create event marker or worldline
      let obj;
      if (event.endTime && event.endTime > event.startTime) {
        // Duration event - create worldline
        obj = createEventWorldline(event, layerConfig, height, angle);
      } else {
        // Point event - create marker
        obj = createEventMarker(event, layerConfig, height, angle);
      }
      
      if (obj) {
        sceneContentGroup.add(obj);
        objects.push(obj);
      }
    });

    return objects;
  }

  function createEventMarker(event, layerConfig, height, angle) {
    const geometry = new THREE.SphereGeometry(0.5, 16, 16);
    const material = new THREE.MeshStandardMaterial({
      color: layerConfig.color || event.colorId || '#ffffff',
      emissive: layerConfig.color || '#ffffff',
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

  function createEventWorldline(event, layerConfig, startHeight, startAngle) {
    const endHeight = calculateDateHeight(
      event.endTime.getFullYear(),
      event.endTime.getMonth(),
      event.endTime.getDate(),
      event.endTime.getHours()
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
      color: layerConfig.color || '#ffffff',
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

  return {
    init,
    renderEvents,
    createEventMarker,
    createEventWorldline
  };
})();

export { EventRenderer };
```

### Nakama Client

**js/pipeline/nakama-client.js:**
```javascript
/**
 * Nakama Client
 * Connects to Nakama server (matches Unity NakamaClient.cs)
 */

import { Client, Session } from '@heroiclabs/nakama-js';

// Configuration (from Unity NakamaClient.cs)
const NAKAMA_CONFIG = {
  scheme: 'http',
  host: '142.93.251.136',
  port: 7350,
  serverKey: 'defaultkey'
};

class NakamaClient {
  constructor() {
    this.client = new Client(
      NAKAMA_CONFIG.serverKey,
      NAKAMA_CONFIG.host,
      NAKAMA_CONFIG.port,
      NAKAMA_CONFIG.scheme === 'https'
    );
    this.session = null;
  }

  /**
   * Authenticate with device ID (matches Unity DeviceSession)
   */
  async authenticateDevice(deviceId) {
    this.session = await this.client.authenticateDevice(deviceId);
    return this.session;
  }

  /**
   * Authenticate with email/password (matches Unity UserSession)
   */
  async authenticateEmail(email, password, username) {
    this.session = await this.client.authenticateEmail(email, password, username);
    return this.session;
  }

  /**
   * Load events from Nakama (matches Unity LoadEvents)
   */
  async loadEvents(collection = 'events') {
    if (!this.session) {
      throw new Error('Not authenticated');
    }

    const result = await this.client.readStorageObjects(this.session, {
      collection: collection
    });

    // Parse Google Events from storage
    const events = result.objects.map(obj => {
      try {
        return JSON.parse(obj.value);
      } catch (e) {
        console.error('Failed to parse event:', e);
        return null;
      }
    }).filter(e => e !== null);

    return events;
  }

  /**
   * Save events to Nakama (matches Unity SaveEventsBatch)
   */
  async saveEvents(events, collection = 'events') {
    if (!this.session) {
      throw new Error('Not authenticated');
    }

    const writeObjects = events.map(event => ({
      collection: collection,
      key: event.id || `gcal_${Date.now()}_${Math.random()}`,
      value: JSON.stringify(event),
      permissionRead: 2, // Owner read
      permissionWrite: 0 // No write access
    }));

    await this.client.writeStorageObjects(this.session, writeObjects);
  }
}

export { NakamaClient };
```

## Integration with Existing Code

### Preserve Existing Functionality

The new structure should:
1. **Use existing functions**: `calculateDateHeight()`, `SceneGeometry`, etc.
2. **Maintain compatibility**: Work with existing `main.js` code
3. **Gradual migration**: Can be adopted incrementally

### Example: Using Existing Code

```javascript
// js/renderers/event-renderer.js
// Uses existing calculateDateHeight from datetime.js
import { calculateDateHeight, calculateCurrentDateHeight } from '../datetime.js';
import { SceneGeometry } from '../scene-geometry.js';

// Uses existing scene geometry system
const height = calculateDateHeight(
  event.startTime.getFullYear(),
  event.startTime.getMonth(),
  event.startTime.getDate(),
  event.startTime.getHours()
);

const angle = SceneGeometry.getAngle(height, calculateCurrentDateHeight());
const position = SceneGeometry.getPosition3D(height, angle, 50);
```

## Next Steps

1. Create `web/js/` directory structure
2. Implement core modules (scene-core, time-system)
3. Create event renderer using existing geometry
4. Implement Nakama client
5. Build public API
6. Test with real Google Calendar events
