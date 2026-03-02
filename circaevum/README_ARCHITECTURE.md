# Circaevum GL Architecture Summary

## Overview

This document summarizes the architectural refactoring plan to separate **Circaevum GL** (graphics library) from the **React management layer** (account management, layers, OAuth).

## The Vision

Similar to **Mapbox GL** and **Kepler.gl**:
- **Circaevum GL** = Standalone 3D graphics library (framework-agnostic)
- **Circaevum Studio** = React app that manages data and controls GL

## Key Documents

1. **[ARCHITECTURE_PLAN.md](./ARCHITECTURE_PLAN.md)** - Complete architecture design
2. **[MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md)** - Step-by-step refactoring guide
3. **[REACT_INTEGRATION.md](./REACT_INTEGRATION.md)** - React wrapper and components
4. **[js/api/circaevum-gl.js](./js/api/circaevum-gl.js)** - Public API implementation

## Quick Start

### For Graphics Library (Circaevum GL)

```javascript
// Standalone usage (no React needed)
const gl = new CircaevumGL(containerElement, {
  zoomLevel: 2,
  lightMode: false
});

// Add a layer
gl.addLayer('my-calendar', {
  color: '#ff0000',
  visible: true
});

// Add events
gl.addEvents('my-calendar', [
  { id: '1', startTime: new Date('2025-01-15'), title: 'Meeting' },
  { id: '2', startTime: new Date('2025-01-16'), title: 'Lunch' }
]);

// Auto-zoom to layer
gl.fitToLayer('my-calendar');
```

### For React Integration

```typescript
// In your React app
import { CircaevumView } from '@/components/CircaevumView';
import { LayersProvider } from '@/contexts/layers-context';

function App() {
  return (
    <LayersProvider>
      <CircaevumView />
    </LayersProvider>
  );
}
```

## Architecture Layers

```
┌─────────────────────────────────────┐
│   React Management Layer            │
│   - Account management              │
│   - OAuth configuration             │
│   - Layer panel UI                  │
│   - Event fetching                  │
└──────────────┬──────────────────────┘
               │
               │ API Calls
               │
┌──────────────▼──────────────────────┐
│   Circaevum GL API                   │
│   - addLayer()                        │
│   - addEvents()                       │
│   - setLayerVisibility()              │
│   - fitToLayer()                      │
└──────────────┬──────────────────────┘
               │
               │ Uses
               │
┌──────────────▼──────────────────────┐
│   Core Graphics Engine               │
│   - Scene rendering                  │
│   - Event visualization              │
│   - Camera controls                  │
│   - Time system                      │
└──────────────────────────────────────┘
```

## Key Features

### Layer Management
- ✅ Add/remove layers
- ✅ Toggle visibility
- ✅ Change colors and styling
- ✅ Apply filters (date range, event types)
- ✅ Auto-zoom to layers

### Event Visualization
- ✅ Point events (markers)
- ✅ Duration events (worldlines)
- ✅ Integration with existing scene geometry
- ✅ Uses `calculateDateHeight()` for positioning

### React Integration
- ✅ React wrapper component
- ✅ Layer context for state management
- ✅ Layer panel UI components
- ✅ Event handlers (click, hover)

## Migration Path

### Phase 1: Extract Core (Week 1)
- Extract scene initialization
- Extract camera controls
- Create modular structure

### Phase 2: Event System (Week 2)
- Create event renderer
- Integrate with scene geometry
- Test event visualization

### Phase 3: API Layer (Week 3)
- Complete CircaevumGL API
- Layer management system
- Event handlers

### Phase 4: React Integration (Week 4)
- React wrapper component
- Layer context
- UI components

### Phase 5: Account Integration (Week 5)
- Connect to Nakama
- OAuth token management
- Event fetching services

## File Structure

```
circaevum/                          # Graphics Library
├── js/
│   ├── api/
│   │   └── circaevum-gl.js         # Public API
│   ├── core/                        # Core modules
│   ├── layers/                      # Layer management
│   └── renderers/                   # Rendering modules
│
vercel-dash/
└── circa-studio/                    # React App (NEW)
    ├── src/
    │   ├── components/
    │   │   └── CircaevumView.tsx    # React wrapper
    │   ├── contexts/
    │   │   └── layers-context.tsx   # Layer state
    │   └── services/
    │       └── event-service.ts     # Event fetching
```

## Design Principles

1. **Separation of Concerns**
   - GL handles rendering only
   - React handles state and UI
   - Clear API boundary

2. **Framework Agnostic**
   - GL works standalone
   - React wrapper is optional

3. **Event-Driven**
   - GL emits events
   - React subscribes and responds

4. **Layer-Based**
   - Similar to GIS layers
   - Independent, toggleable, stylable

5. **Performance**
   - GL optimizes rendering
   - React handles data/caching

## Integration Points

### Existing Code Reuse
- ✅ `calculateDateHeight()` - Used for event positioning
- ✅ `SceneGeometry` - Used for event geometry
- ✅ `sceneContentGroup` - Events added here
- ✅ Time marker system - Events positioned similarly

### New Components
- ⏭️ Event renderer module
- ⏭️ Layer management system
- ⏭️ React wrapper
- ⏭️ Layer context

## Next Steps

1. **Review the architecture plan** - [ARCHITECTURE_PLAN.md](./ARCHITECTURE_PLAN.md)
2. **Start migration** - [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md)
3. **Build React components** - [REACT_INTEGRATION.md](./REACT_INTEGRATION.md)
4. **Integrate with account management** - Use existing React account mgmt code

## Questions?

- How to add events? → Use `gl.addEvents(layerId, events)`
- How to toggle layers? → Use `gl.setLayerVisibility(layerId, visible)`
- How to style layers? → Use `gl.updateLayerStyle(layerId, { color, opacity })`
- How to auto-zoom? → Use `gl.fitToLayer(layerId)`

## Status

- ✅ Architecture designed
- ✅ API defined
- ✅ Migration plan created
- ✅ React integration guide written
- ⏭️ Code refactoring (next step)
- ⏭️ Event renderer implementation
- ⏭️ React wrapper creation
