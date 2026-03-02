# Circaevum File Structure V2 - Function-Based Organization

## Overview

This document defines a **function-based** file structure that organizes code by **what it does** rather than by zoom level. Zoom-specific code (Z0/Z1/Z2 in Unity) is contained within functional modules, not as separate top-level directories.

## Design Principles

1. **Function-Based**: Organize by purpose (Renderers, Input, Pipeline) not zoom level
2. **Zoom-Specific Code**: Contained within functional modules (e.g., `Renderers/Events/Z2_DailyEventRenderer.cs`)
3. **Shared Logic**: Core algorithms and utilities in shared locations
4. **RFC 5545 VEVENT**: Standard event format (see `spec/schemas/vevent-rfc5545.md` - Git submodule)
5. **Parallel Development**: Matching structure enables independent work
6. **Shared Specification**: `spec/` directory as Git submodule from `Circaevum/circaevum-spec` repo

## Directory Structure

```
yang/
├── spec/                              # Shared specification (applies to both Unity and Web)
│   ├── schemas/
│   │   └── vevent-rfc5545.md         # RFC 5545 VEVENT format
│   ├── api/
│   │   ├── api-contract.md            # API definitions
│   │   └── zoom-levels.md            # Zoom level mapping
│   ├── algorithms/
│   │   ├── time-calculations.md      # Time calculation algorithms
│   │   └── event-positioning.md      # Event positioning logic
│   └── nakama/
│       └── storage-schema.md         # Nakama storage structure
│
├── web/                               # Web implementation (JavaScript)
│   └── circaevum/
│   ├── js/
│   │   ├── api/
│   │   │   └── circaevum-gl.js       # Public API
│   │   ├── core/
│   │   │   ├── scene-core.js         # Scene initialization
│   │   │   ├── camera-controls.js    # Camera/navigation
│   │   │   ├── time-system.js        # Time calculations
│   │   │   └── zoom-manager.js       # Zoom level management
│   │   ├── renderers/
│   │   │   ├── planet-renderer.js    # Planet rendering (all zoom levels)
│   │   │   ├── worldline-renderer.js # Worldlines (all zoom levels)
│   │   │   ├── timemarker-renderer.js # Time markers (all zoom levels)
│   │   │   └── event-renderer.js     # Event visualization (all zoom levels)
│   │   ├── layers/
│   │   │   ├── layer-manager.js      # Layer management
│   │   │   ├── layer-renderer.js     # Layer rendering
│   │   │   └── layer-filter.js       # Layer filtering
│   │   ├── input/
│   │   │   ├── mouse-controls.js     # Mouse input
│   │   │   ├── keyboard-controls.js  # Keyboard input
│   │   │   └── touch-controls.js     # Touch input
│   │   ├── pipeline/
│   │   │   ├── nakama-client.js      # Nakama connection
│   │   │   ├── event-fetcher.js      # Fetch events from Nakama
│   │   │   └── event-storage.js      # Save events to Nakama
│   │   ├── utils/
│   │   │   ├── vevent-adapter.js     # RFC 5545 VEVENT handling
│   │   │   ├── schema-validator.js   # Schema validation
│   │   │   └── geometry-utils.js     # Geometry calculations
│   │   ├── config.js                 # Configuration
│   │   ├── datetime.js               # Date/time utilities
│   │   └── main.js                   # Main application
│   ├── css/
│   │   └── styles.css
│   └── package.json
│
└── unity/                             # Unity implementation (C#)
    └── Assets/
        └── Circaevum/
            ├── API/
            │   └── CircaevumGL.cs    # Public API
            ├── Core/
            │   ├── SceneCore.cs       # Scene initialization
            │   ├── CameraControls.cs # Camera/navigation
            │   ├── TimeSystem.cs      # Time calculations
            │   └── ZX_TimeFrameManager.cs # Cross-zoom time manager
            ├── Renderers/
            │   ├── Planets/
            │   │   ├── PlanetRenderer.cs # Base planet renderer
            │   │   ├── Z0_PlanetCentury.cs # Z0-specific
            │   │   └── Z1_PlanetHelix.cs # Z1-specific
            │   ├── Worldlines/
            │   │   ├── WorldlineRenderer.cs # Base worldline renderer
            │   │   ├── Z0_CenturyHelix.cs # Z0-specific
            │   │   └── Z1_WorldlineRenderer.cs # Z1-specific
            │   ├── TimeMarkers/
            │   │   ├── TimeMarkerRenderer.cs # Base time marker renderer
            │   │   ├── Z1_YearLabelManager.cs # Z1-specific
            │   │   ├── Z1_MonthMarkers.cs # Z1-specific
            │   │   └── Z2_HourMapper.cs # Z2-specific
            │   └── Events/
            │       ├── EventRenderer.cs # Base event renderer
            │       ├── Z1_EventMapper.cs # Z1-specific
            │       ├── Z1_ChartGenerator.cs # Z1-specific
            │       └── Z2_DailyEventRenderer.cs # Z2-specific
            ├── Layers/
            │   ├── LayerManager.cs    # Layer management
            │   ├── LayerRenderer.cs  # Layer rendering
            │   ├── CalendarCollectionManager.cs # Calendar source management
            │   └── CalendarSourceHandler.cs
            ├── Input/
            │   ├── MouseInput.cs      # Mouse input
            │   ├── KeyboardInput.cs  # Keyboard input
            │   ├── TouchInput.cs      # Touch input
            │   └── VRInput.cs         # VR/XR input
            ├── Pipeline/
            │   ├── Nakama/
            │   │   ├── NakamaClient.cs # Nakama connection
            │   │   ├── NakamaStorageService.cs # Event storage
            │   │   └── NakamaUserManager.cs
            │   ├── OAuth/
            │   │   ├── GoogleOAuth.cs
            │   │   ├── RequestGoogle.cs # Google Calendar API
            │   │   └── GoogleEventManager.cs
            │   └── DataSources/
            │       ├── CSVHandler.cs
            │       ├── GarminHRManager.cs
            │       └── GarminSleepManager.cs
            ├── Models/
            │   ├── VEvent.cs          # RFC 5545 VEVENT model
            │   ├── VEventAdapter.cs   # Google Event → VEVENT
            │   └── EventWrapper.cs
            ├── Utils/
            │   ├── SchemaValidator.cs # Schema validation
            │   └── GeometryUtils.cs   # Geometry calculations
            └── UI/
                ├── AVP_UI/            # Apple Vision Pro UI
                └── Old UI/             # Legacy UI (to be migrated)
```

## Key Differences from V1

### 1. No Separate Zoom Directories

**V1 (Wrong):**
```
Zoom/
├── Z0/
├── Z1/
└── Z2/
```

**V2 (Correct):**
```
Renderers/
├── Planets/
│   ├── Z0_PlanetCentury.cs  # Zoom-specific within functional module
│   └── Z1_PlanetHelix.cs
└── Events/
    ├── Z1_EventMapper.cs
    └── Z2_DailyEventRenderer.cs
```

### 2. Function-Based Organization

Code is organized by **what it does**:
- **Renderers/**: All rendering code
- **Input/**: All input handling
- **Pipeline/**: All data fetching/storage
- **Layers/**: All layer management

### 3. Zoom-Specific Code Within Modules

Zoom-specific implementations (Z0/Z1/Z2) are **contained within** functional modules, not as top-level directories.

## Naming Conventions

### Unity (C#)

**Zoom-Specific Classes:**
- `Z0_ComponentName.cs` - Z0-specific component
- `Z1_ComponentName.cs` - Z1-specific component
- `Z2_ComponentName.cs` - Z2-specific component
- `ZX_ComponentName.cs` - Cross-zoom component

**General Classes:**
- `ComponentName.cs` - General component (no zoom prefix)

**Directory Structure:**
- PascalCase for directories (C# convention)
- PascalCase for classes

### Web (JavaScript)

**File Naming:**
- `component-name.js` - kebab-case
- `circaevum-gl.js` - Public API

**Directory Structure:**
- kebab-case for directories
- camelCase for functions/variables

## Example: Event Rendering

### Unity Structure

```
Renderers/
└── Events/
    ├── EventRenderer.cs              # Base class (all zoom levels)
    ├── Z1_EventMapper.cs             # Z1-specific event mapping
    ├── Z1_ChartGenerator.cs         # Z1-specific chart generation
    └── Z2_DailyEventRenderer.cs     # Z2-specific daily rendering
```

**EventRenderer.cs (Base):**
```csharp
public abstract class EventRenderer : MonoBehaviour {
    public abstract void RenderEvents(List<VEvent> events, LayerConfig layer);
}
```

**Z2_DailyEventRenderer.cs:**
```csharp
public class Z2_DailyEventRenderer : EventRenderer {
    public override void RenderEvents(List<VEvent> events, LayerConfig layer) {
        // Z2-specific rendering logic
    }
}
```

### Web Structure

```
renderers/
└── event-renderer.js                 # Handles all zoom levels
```

**event-renderer.js:**
```javascript
class EventRenderer {
  renderEvents(events, layerConfig, zoomLevel) {
    switch(zoomLevel) {
      case 1: // Century (Z0)
        return this.renderCenturyEvents(events, layerConfig);
      case 3: // Year (Z1)
        return this.renderYearEvents(events, layerConfig);
      case 8: // Day (Z2)
        return this.renderDayEvents(events, layerConfig);
      default:
        return this.renderDefaultEvents(events, layerConfig);
    }
  }
  
  renderDayEvents(events, layerConfig) {
    // Z2-equivalent rendering
  }
}
```

## Migration from Current Structure

### Unity Migration

**Current:**
```
Renderers/Backbone/Z0_PlanetCentury.cs
Renderers/Backbone/Z1_TimeFrame.cs
Renderers/Backbone/Z2_DayRenderer.cs
```

**New:**
```
Renderers/Planets/Z0_PlanetCentury.cs
Renderers/TimeMarkers/Z1_TimeFrame.cs
Renderers/TimeMarkers/Z2_DayRenderer.cs
```

### Web Migration

**Current:**
```
js/main.js (everything in one file)
```

**New:**
```
js/core/scene-core.js
js/renderers/planet-renderer.js
js/renderers/event-renderer.js
js/input/mouse-controls.js
```

## Benefits

1. **Clear Organization**: Easy to find code by function
2. **Zoom-Specific Code**: Contained within functional modules
3. **Shared Logic**: Core algorithms in shared locations
4. **Maintainability**: Clear structure for new developers
5. **Scalability**: Easy to add new renderers, input methods, etc.

## Next Steps

1. ✅ Create `spec/` directory with RFC 5545 VEVENT format
2. ⏭️ Reorganize Unity code into function-based structure
3. ⏭️ Refactor Web code into function-based modules
4. ⏭️ Implement VEVENT adapter for both platforms
5. ⏭️ Test cross-platform compatibility
