# Circaevum GL Architecture Plan

## Vision: Separate Graphics Library from Management Layer

Similar to how **Mapbox GL** and **Kepler.gl** work:
- **Mapbox GL JS** = Core graphics library (standalone)
- **Mapbox Studio** = Management UI (React) that controls Mapbox GL

We want:
- **Circaevum GL** = Core 3D graphics library (standalone, framework-agnostic)
- **Circaevum Studio** = React management layer (account mgmt, layers, OAuth)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Circaevum Studio (React)                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Account Mgmt │  │ Layer Panel  │  │ OAuth Config  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│           │                │                  │              │
│           └────────────────┼──────────────────┘              │
│                            │                                 │
│                    ┌───────▼───────┐                        │
│                    │ CircaevumView │ (React Wrapper)        │
│                    └───────┬───────┘                        │
└────────────────────────────┼─────────────────────────────────┘
                             │
                             │ API Calls
                             │
┌────────────────────────────▼─────────────────────────────────┐
│              Circaevum GL (Standalone Library)                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   main.js    │  │  EventLayer  │  │  SceneCore    │      │
│  │  (refactored)│  │  Manager     │  │  (planets,   │      │
│  └──────────────┘  └──────────────┘  │   worldlines)│      │
│  ┌──────────────┐  ┌──────────────┐  └──────────────┘      │
│  │  TimeMarkers │  │  Worldlines  │  ┌──────────────┐      │
│  └──────────────┘  └──────────────┘  │  EventRenderer│      │
│                                       └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
yang/web/
├── circaevum/                    # Circaevum GL (Graphics Library)
│   ├── js/
│   │   ├── core/
│   │   │   ├── scene-core.js     # Core scene initialization
│   │   │   ├── camera-controls.js # Camera/navigation
│   │   │   └── time-system.js    # Time calculations
│   │   ├── layers/
│   │   │   ├── event-layer.js    # Event layer management
│   │   │   └── layer-renderer.js # Layer rendering
│   │   ├── renderers/
│   │   │   ├── planet-renderer.js
│   │   │   ├── worldline-renderer.js
│   │   │   ├── timemarker-renderer.js
│   │   │   └── event-renderer.js # NEW: Event visualization
│   │   ├── api/
│   │   │   └── circaevum-gl.js   # Public API (like Mapbox GL)
│   │   ├── config.js
│   │   ├── datetime.js
│   │   └── scene-geometry.js
│   ├── css/
│   │   └── styles.css
│   └── README.md
│
└── vercel-dash/
    └── circa-studio/              # React Management App (NEW)
        ├── src/
        │   ├── components/
        │   │   ├── CircaevumView.tsx    # React wrapper for GL
        │   │   ├── LayerPanel.tsx       # Layer management UI
        │   │   ├── AccountPanel.tsx     # Account management
        │   │   └── OAuthPanel.tsx      # OAuth configuration
        │   ├── contexts/
        │   │   ├── layers-context.tsx   # Layer state management
        │   │   └── circaevum-context.tsx # GL instance context
        │   ├── services/
        │   │   ├── nakama-service.ts     # Nakama client
        │   │   ├── oauth-service.ts     # OAuth management
        │   │   └── event-service.ts     # Event fetching
        │   └── App.tsx
        └── package.json
```

---

## Circaevum GL API Design

### Core API (Similar to Mapbox GL)

```javascript
// Public API: js/api/circaevum-gl.js

class CircaevumGL {
  constructor(container, options) {
    // Initialize scene, camera, renderer
    // Similar to: new mapboxgl.Map({ container, ... })
  }

  // Layer Management
  addLayer(layerId, layerConfig) {
    // Add event layer with configuration
  }

  removeLayer(layerId) {
    // Remove layer from scene
  }

  setLayerVisibility(layerId, visible) {
    // Toggle layer visibility
  }

  updateLayerStyle(layerId, style) {
    // Update color, opacity, etc.
  }

  // Event Management
  addEvents(layerId, events) {
    // Add events to a layer
  }

  removeEvents(layerId, eventIds) {
    // Remove specific events
  }

  updateEvents(layerId, events) {
    // Update events in a layer
  }

  // Camera/Navigation
  setZoomLevel(level) {
    // Change zoom level (1-9)
  }

  navigateToTime(date) {
    // Navigate to specific time
  }

  fitToLayer(layerId) {
    // Auto-zoom to show all events in layer
  }

  fitToLayers(layerIds) {
    // Auto-zoom to show multiple layers
  }

  // Filtering
  setLayerFilter(layerId, filter) {
    // Apply filter to layer (date range, event type, etc.)
  }

  // Event Handlers
  on(event, callback) {
    // Subscribe to events (e.g., 'eventClick', 'timeChange')
  }

  off(event, callback) {
    // Unsubscribe from events
  }

  // Cleanup
  destroy() {
    // Clean up resources
  }
}

// Export for use
window.CircaevumGL = CircaevumGL;
```

---

## React Wrapper Component

```typescript
// src/components/CircaevumView.tsx

import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { useLayers } from '@/contexts/layers-context';

interface CircaevumViewProps {
  className?: string;
  onEventClick?: (event: Event) => void;
  onTimeChange?: (date: Date) => void;
}

export const CircaevumView = forwardRef<CircaevumGL, CircaevumViewProps>(
  ({ className, onEventClick, onTimeChange }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const glRef = useRef<CircaevumGL | null>(null);
    const { layers } = useLayers();

    // Initialize Circaevum GL
    useEffect(() => {
      if (!containerRef.current) return;

      glRef.current = new CircaevumGL(containerRef.current, {
        // Configuration options
      });

      // Set up event handlers
      if (onEventClick) {
        glRef.current.on('eventClick', onEventClick);
      }
      if (onTimeChange) {
        glRef.current.on('timeChange', onTimeChange);
      }

      return () => {
        glRef.current?.destroy();
      };
    }, []);

    // Sync layers with GL
    useEffect(() => {
      if (!glRef.current) return;

      layers.forEach((layer) => {
        if (!glRef.current?.hasLayer(layer.id)) {
          glRef.current.addLayer(layer.id, {
            color: layer.color,
            visible: layer.visible,
            opacity: layer.opacity,
          });
        }

        glRef.current.setLayerVisibility(layer.id, layer.visible);
        glRef.current.updateLayerStyle(layer.id, {
          color: layer.color,
          opacity: layer.opacity,
        });

        // Add events to layer
        if (layer.events) {
          glRef.current.addEvents(layer.id, layer.events);
        }
      });
    }, [layers]);

    // Expose GL instance via ref
    useImperativeHandle(ref, () => glRef.current!);

    return <div ref={containerRef} className={className} />;
  }
);
```

---

## Layer Management System

### Layer Context (React)

```typescript
// src/contexts/layers-context.tsx

interface Layer {
  id: string;
  name: string;
  source: 'google' | 'outlook' | 'garmin' | 'chase' | 'manual';
  color: string;
  visible: boolean;
  opacity: number;
  events: Event[];
  filter?: {
    dateRange?: { start: Date; end: Date };
    eventTypes?: string[];
  };
}

interface LayersContextValue {
  layers: Layer[];
  addLayer: (layer: Layer) => void;
  removeLayer: (id: string) => void;
  updateLayer: (id: string, updates: Partial<Layer>) => void;
  toggleLayerVisibility: (id: string) => void;
  setLayerColor: (id: string, color: string) => void;
  setLayerFilter: (id: string, filter: Layer['filter']) => void;
  fitToLayer: (id: string) => void;
  fitToLayers: (ids: string[]) => void;
}
```

### Layer Panel Component

```typescript
// src/components/LayerPanel.tsx

export function LayerPanel() {
  const { layers, toggleLayerVisibility, updateLayer, fitToLayer } = useLayers();
  const circaevumRef = useRef<CircaevumGL>(null);

  return (
    <div className="layer-panel">
      {layers.map((layer) => (
        <LayerCard key={layer.id} layer={layer}>
          <Switch
            checked={layer.visible}
            onCheckedChange={() => toggleLayerVisibility(layer.id)}
          />
          <ColorPicker
            color={layer.color}
            onChange={(color) => updateLayer(layer.id, { color })}
          />
          <Button onClick={() => fitToLayer(layer.id)}>
            Fit to Layer
          </Button>
        </LayerCard>
      ))}
    </div>
  );
}
```

---

## Integration with Account Management

### Event Service

```typescript
// src/services/event-service.ts

export class EventService {
  constructor(private nakamaClient: NakamaClient) {}

  async fetchGoogleCalendarEvents(calendarId: string): Promise<Event[]> {
    // Fetch from Google Calendar API using stored OAuth tokens
    // Transform to unified Event format
  }

  async fetchGarminData(startDate: Date, endDate: Date): Promise<Event[]> {
    // Fetch from Garmin API
  }

  async fetchChaseTransactions(startDate: Date, endDate: Date): Promise<Event[]> {
    // Fetch from Chase API
  }
}
```

### Main App Integration

```typescript
// src/App.tsx

export default function App() {
  const { layers, addLayer } = useLayers();
  const eventService = useEventService();

  // Fetch events when layer is added
  useEffect(() => {
    layers.forEach(async (layer) => {
      if (layer.events.length === 0 && layer.source !== 'manual') {
        const events = await eventService.fetchEventsForLayer(layer);
        addLayer({ ...layer, events });
      }
    });
  }, [layers]);

  return (
    <div className="app">
      <Sidebar>
        <AccountPanel />
        <OAuthPanel />
        <LayerPanel />
      </Sidebar>
      <MainContent>
        <CircaevumView />
      </MainContent>
    </div>
  );
}
```

---

## Migration Strategy

### Phase 1: Refactor Current Code
1. Extract core scene logic into `scene-core.js`
2. Create `circaevum-gl.js` API wrapper
3. Keep existing functionality working

### Phase 2: Add Event System
1. Create `event-layer.js` and `event-renderer.js`
2. Integrate with existing scene geometry system
3. Use `calculateDateHeight()` for positioning

### Phase 3: React Integration
1. Create React wrapper component
2. Build layer management UI
3. Connect to account management

### Phase 4: Advanced Features
1. Layer filtering
2. Auto-zoom to layers
3. Sharing system

---

## Key Design Principles

1. **Separation of Concerns**
   - GL handles rendering only
   - React handles state management and UI
   - Clear API boundary between them

2. **Framework Agnostic**
   - GL can work standalone (vanilla JS)
   - React wrapper is optional convenience layer

3. **Event-Driven**
   - GL emits events (eventClick, timeChange, etc.)
   - React subscribes and responds

4. **Layer-Based Architecture**
   - Similar to GIS layers
   - Each layer is independent
   - Can be toggled, styled, filtered separately

5. **Performance**
   - GL handles rendering optimization
   - React handles data fetching/caching
   - Minimal re-renders

---

## Next Steps

1. ✅ Create architecture plan (this document)
2. ⏭️ Refactor `main.js` into modular structure
3. ⏭️ Create `circaevum-gl.js` API
4. ⏭️ Build event layer system
5. ⏭️ Create React wrapper
6. ⏭️ Build layer management UI
7. ⏭️ Integrate with account management
