# Circaevum File Structure Proposal

## Overview

This document proposes a unified file structure that works for both **Web (JavaScript)** and **Unity (C#)** implementations, maintaining the Z0/Z1/Z2 zoom level system for Unity while enabling parallel development.

## Design Principles

1. **Shared Specification**: Common data formats and API contracts
2. **Parallel Implementation**: Separate but matching structures
3. **Clear Naming**: Consistent prefixes and organization
4. **Zoom Level Preservation**: Unity Z0/Z1/Z2 maintained
5. **Google Event Format**: Use Google Calendar Event as base format

## Directory Structure

```
circaevum/
├── spec/                              # Shared specification (language-agnostic)
│   ├── schemas/
│   │   ├── google-event.schema.json  # Google Calendar Event format (reference)
│   │   ├── layer.schema.json          # Layer configuration
│   │   └── scene-config.schema.json  # Scene configuration
│   ├── api/
│   │   ├── api-contract.md            # API definitions (both platforms)
│   │   └── zoom-levels.md              # Zoom level mapping (Z0/Z1/Z2 ↔ Web 1-9)
│   ├── algorithms/
│   │   ├── time-calculations.md      # Time calculation algorithms
│   │   └── event-positioning.md      # Event positioning logic
│   └── nakama/
│       ├── storage-schema.md         # Nakama storage structure
│       └── collections.md             # Collection names and keys
│
├── web/                               # Web implementation (JavaScript)
│   ├── js/
│   │   ├── api/
│   │   │   └── circaevum-gl.js       # Public API (matches Unity API)
│   │   ├── core/
│   │   │   ├── scene-core.js         # Scene initialization
│   │   │   ├── camera-controls.js    # Camera/navigation
│   │   │   ├── time-system.js        # Time calculations
│   │   │   └── zoom-manager.js       # Zoom level management (1-9)
│   │   ├── zoom/
│   │   │   ├── zoom-level-1.js       # Century (maps to Unity Z0)
│   │   │   ├── zoom-level-3.js       # Year (maps to Unity Z1)
│   │   │   ├── zoom-level-8.js       # Day (maps to Unity Z2)
│   │   │   └── zoom-level-9.js       # Clock (extends Unity Z2)
│   │   ├── layers/
│   │   │   ├── layer-manager.js      # Layer management
│   │   │   ├── layer-renderer.js     # Layer rendering
│   │   │   └── layer-filter.js       # Layer filtering
│   │   ├── renderers/
│   │   │   ├── planet-renderer.js    # Planet rendering
│   │   │   ├── worldline-renderer.js # Worldlines
│   │   │   ├── timemarker-renderer.js # Time markers
│   │   │   └── event-renderer.js     # Event visualization
│   │   ├── pipeline/
│   │   │   ├── nakama-client.js       # Nakama connection
│   │   │   ├── event-fetcher.js      # Fetch events from Nakama
│   │   │   └── event-storage.js      # Save events to Nakama
│   │   ├── utils/
│   │   │   ├── schema-validator.js   # Schema validation
│   │   │   └── google-event-adapter.js # Google Event format handling
│   │   ├── config.js                 # Configuration
│   │   ├── datetime.js                # Date/time utilities
│   │   └── scene-geometry.js         # Geometry calculations
│   ├── css/
│   │   └── styles.css
│   └── package.json
│
└── unity/                             # Unity implementation (C#)
    └── Assets/
        └── Circaevum/
            ├── API/
            │   └── CircaevumGL.cs    # Public API (matches Web API)
            ├── Core/
            │   ├── SceneCore.cs       # Scene initialization
            │   ├── CameraControls.cs  # Camera/navigation
            │   ├── TimeSystem.cs      # Time calculations
            │   └── ZX_TimeFrameManager.cs # Cross-zoom time manager
            ├── Zoom/
            │   ├── Z0/                # Century level (maps to Web zoom 1)
            │   │   ├── Z0_PlanetCentury.cs
            │   │   ├── Z0_CenturyHelix.cs
            │   │   └── Z0_Renderer.cs
            │   ├── Z1/                # Year level (maps to Web zoom 3)
            │   │   ├── Z1_TimeFrame.cs
            │   │   ├── Z1_PlanetHelix.cs
            │   │   ├── Z1_YearLabelManager.cs
            │   │   ├── Z1_MonthMarkers.cs
            │   │   └── Z1_Renderer.cs
            │   └── Z2/                # Day level (maps to Web zoom 8)
            │       ├── Z2_DayRenderer.cs
            │       ├── Z2_DayMapper.cs
            │       ├── Z2_HourMapper.cs
            │       └── Z2_Renderer.cs
            ├── Layers/
            │   ├── LayerManager.cs    # Layer management
            │   ├── LayerRenderer.cs  # Layer rendering
            │   ├── CalendarCollectionManager.cs # Calendar source management
            │   └── CalendarSourceHandler.cs
            ├── Renderers/
            │   ├── Events/
            │   │   ├── EventRenderer.cs # Base event renderer
            │   │   ├── Z0_EventRenderer.cs # Events at century level
            │   │   ├── Z1_EventRenderer.cs # Events at year level
            │   │   └── Z2_DailyEventRenderer.cs # Events at day level
            │   ├── Planets/
            │   │   └── PlanetRenderer.cs
            │   └── Worldlines/
            │       └── WorldlineRenderer.cs
            ├── Pipeline/
            │   ├── Nakama/
            │   │   ├── NakamaClient.cs # Nakama connection
            │   │   ├── NakamaStorageService.cs # Event storage
            │   │   └── NakamaUserManager.cs
            │   ├── OAuth/
            │   │   ├── GoogleOAuth.cs
            │   │   ├── RequestGoogle.cs # Google Calendar API
            │   │   └── GoogleEventManager.cs
            │   ├── DataSources/
            │   │   ├── CSVHandler.cs
            │   │   ├── GarminHRManager.cs
            │   │   └── GarminSleepManager.cs
            │   └── Synchronizer.cs
            ├── Models/
            │   ├── GoogleEventAdapter.cs # Google Event format wrapper
            │   ├── CalendarEvent.cs
            │   └── EventWrapper.cs
            ├── Utils/
            │   ├── SchemaValidator.cs # Schema validation
            │   └── GeometryUtils.cs
            └── UI/
                ├── AVP_UI/            # Apple Vision Pro UI
                └── Old UI/             # Legacy UI (to be migrated)
```

## Naming Conventions

### Prefixes

| Prefix | Meaning | Usage |
|--------|---------|-------|
| `Z0_` | Century/Planet zoom level | Unity only |
| `Z1_` | Year/Month zoom level | Unity only |
| `Z2_` | Day/Hour zoom level | Unity only |
| `ZX_` | Cross-zoom (shared) | Unity only |
| `zoom-level-` | Web zoom level (1-9) | Web only |
| `circaevum-` | Public API classes | Both platforms |

### File Naming Patterns

**Unity (C#):**
- `Z0_ComponentName.cs` - Century level component
- `Z1_ComponentName.cs` - Year level component
- `Z2_ComponentName.cs` - Day level component
- `ZX_ComponentName.cs` - Cross-zoom component
- `ComponentName.cs` - General component (no zoom prefix)

**Web (JavaScript):**
- `zoom-level-N.js` - Zoom level N implementation
- `component-name.js` - General component (kebab-case)
- `circaevum-gl.js` - Public API

### Directory Naming

- **PascalCase** for Unity (C# convention)
- **kebab-case** for Web (JavaScript convention)
- **lowercase** for shared spec files

## Zoom Level Mapping

### Unity → Web

| Unity | Web | Description |
|-------|-----|-------------|
| Z0 | Zoom 1 | Century view (100 years, planetary orbits) |
| Z1 | Zoom 3 | Year view (months, quarters, trips) |
| Z2 | Zoom 8 | Day view (daily events, hours) |
| - | Zoom 2 | Decade view (Web only) |
| - | Zoom 4-7 | Quarter/Month/Week/Lunar (Web only) |
| - | Zoom 9 | Clock view (Web only, extends Z2) |

### Implementation Strategy

**Unity:**
- Maintain Z0, Z1, Z2 as separate systems
- ZX_ components coordinate across zoom levels
- Each zoom level has its own renderer

**Web:**
- Implement all 9 zoom levels
- Z0/Z1/Z2 equivalent zoom levels use similar algorithms
- Can reference Unity algorithms in spec docs

## Google Event Format

Both platforms use **Google Calendar Event format** as the base:

```typescript
// Web: Use Google Calendar Event type
import { Event } from 'googleapis';

// Unity: Use Google.Apis.Calendar.v3.Data.Event
using Google.Apis.Calendar.v3.Data;
```

**Storage in Nakama:**
- Collection: `"events"`
- Key: `"gcal_{hash}"` or `event.Id`
- Value: JSON serialized Google Event (minimal fields)

## API Alignment

### Web API (JavaScript)

```javascript
class CircaevumGL {
  constructor(container, options) {
    // Initialize scene
  }
  
  // Layer Management
  addLayer(layerId, config)
  removeLayer(layerId)
  setLayerVisibility(layerId, visible)
  updateLayerStyle(layerId, style)
  
  // Event Management (Google Event format)
  addEvents(layerId, events) // events: Google.Apis.Calendar.v3.Data.Event[]
  removeEvents(layerId, eventIds)
  updateEvents(layerId, events)
  
  // Navigation
  setZoomLevel(level) // 1-9
  navigateToTime(date)
  fitToLayer(layerId)
}
```

### Unity API (C#)

```csharp
public class CircaevumGL {
  public CircaevumGL(GameObject container, Options options) {
    // Initialize scene
  }
  
  // Layer Management
  public void AddLayer(string layerId, LayerConfig config)
  public void RemoveLayer(string layerId)
  public void SetLayerVisibility(string layerId, bool visible)
  public void UpdateLayerStyle(string layerId, LayerStyle style)
  
  // Event Management (Google Event format)
  public void AddEvents(string layerId, Event[] events) // Event = Google.Apis.Calendar.v3.Data.Event
  public void RemoveEvents(string layerId, string[] eventIds)
  public void UpdateEvents(string layerId, Event[] events)
  
  // Navigation
  public void SetZoomLevel(int level) // Maps: 1→Z0, 3→Z1, 8→Z2
  public void NavigateToTime(DateTime date)
  public void FitToLayer(string layerId)
}
```

## File Organization by Function

### Core Systems

**Both Platforms:**
- Scene initialization
- Camera controls
- Time calculations
- Zoom level management

**Unity-Specific:**
- ZX_TimeFrameManager (cross-zoom coordination)
- Sundial (real-time reference)

### Zoom Level Implementations

**Unity:**
```
Zoom/
├── Z0/          # Century level
├── Z1/          # Year level
└── Z2/          # Day level
```

**Web:**
```
zoom/
├── zoom-level-1.js  # Century (Z0 equivalent)
├── zoom-level-3.js  # Year (Z1 equivalent)
└── zoom-level-8.js  # Day (Z2 equivalent)
```

### Event Rendering

**Unity:**
```
Renderers/
└── Events/
    ├── EventRenderer.cs          # Base
    ├── Z0_EventRenderer.cs      # Century events
    ├── Z1_EventRenderer.cs      # Year events
    └── Z2_DailyEventRenderer.cs  # Day events
```

**Web:**
```
renderers/
└── event-renderer.js  # Handles all zoom levels
```

### Data Pipeline

**Unity:**
```
Pipeline/
├── Nakama/           # Nakama integration
├── OAuth/            # OAuth flows
└── DataSources/      # Data source handlers
```

**Web:**
```
pipeline/
├── nakama-client.js
├── event-fetcher.js
└── event-storage.js
```

## Migration Path

### Phase 1: Create Shared Specification

1. Create `spec/` directory
2. Document Google Event format usage
3. Define API contract
4. Document zoom level mapping
5. Define Nakama storage schema

### Phase 2: Reorganize Unity Code

1. Move Z0 files to `Zoom/Z0/`
2. Move Z1 files to `Zoom/Z1/`
3. Move Z2 files to `Zoom/Z2/`
4. Organize renderers by zoom level
5. Consolidate pipeline code

### Phase 3: Create Web Structure

1. Create `web/js/` structure
2. Implement zoom level modules
3. Create event renderer
4. Implement Nakama integration
5. Build public API

### Phase 4: Align APIs

1. Ensure method signatures match
2. Test cross-platform compatibility
3. Document differences
4. Create migration guide

## Key Files to Create/Reorganize

### Unity Reorganization

**Move:**
- `Renderers/Backbone/Z0_*.cs` → `Zoom/Z0/`
- `Renderers/Backbone/Z1_*.cs` → `Zoom/Z1/`
- `Renderers/Backbone/Z2_*.cs` → `Zoom/Z2/`
- `Renderers/Events/Z2_DailyEventRenderer.cs` → `Renderers/Events/Z2/`
- `Pipeline/NakamaStorageService.cs` → `Pipeline/Nakama/`
- `Pipeline/RequestGoogle.cs` → `Pipeline/OAuth/`

**Keep:**
- `Core/ZX_TimeFrameManager.cs` (cross-zoom)
- `Models/CalendarEvent.cs` (data models)
- `Pipeline/GoogleEventManager.cs` (event processing)

### Web Structure

**Create:**
- `web/js/api/circaevum-gl.js`
- `web/js/zoom/zoom-level-*.js`
- `web/js/renderers/event-renderer.js`
- `web/js/pipeline/nakama-client.js`
- `web/js/utils/google-event-adapter.js`

## Benefits

1. **Clear Organization**: Easy to find zoom-level specific code
2. **Parallel Development**: Web and Unity teams can work independently
3. **Shared Understanding**: Spec documents ensure alignment
4. **Maintainability**: Clear naming makes code self-documenting
5. **Scalability**: Easy to add new zoom levels or platforms

## Next Steps

1. ✅ Review this proposal
2. ⏭️ Create `spec/` directory structure
3. ⏭️ Document Google Event format usage
4. ⏭️ Begin Unity reorganization (move files)
5. ⏭️ Create Web structure
6. ⏭️ Implement APIs in parallel
