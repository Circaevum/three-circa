# Structure Alignment Plan: Web ↔ Unity 1:1

## Current Unity Structure (Reference)

```
Circaevum/
├── API/                    # Public API (CircaevumGL.cs)
├── Core/                   # Core logic (Sundial, TimeFrameManager, Interfaces)
├── Renderers/              # Rendering (NOT in Core)
│   ├── Planets/
│   ├── Worldlines/
│   ├── TimeMarkers/
│   └── Events/
├── Layers/                  # Layer management
├── Pipeline/                # Data fetching/storage
│   ├── Nakama/
│   ├── OAuth/
│   └── DataSources/
├── Input/                   # Input handling (currently empty, but exists)
├── Models/                  # Data models (VEvent, etc.)
├── Utils/                   # Utilities
└── UI/                      # UI systems
```

## Key Insight: Renderers are NOT in Core

**Unity Structure:**
- `Renderers/` is a **top-level directory** (separate from `Core/`)
- `Core/` contains: Sundial, TimeFrameManager, Interfaces
- `Renderers/` contains: Planets, Worldlines, TimeMarkers, Events

**Therefore, Web should match:**
- `js/renderers/` (top-level, NOT in `js/core/`)
- `js/core/` for core logic only
- `js/adapters/` for XR/input adapters (new, but logical)

## Proposed Web Structure (1:1 with Unity)

```
js/
├── api/                     # Public API (matches Unity API/)
│   └── circaevum-gl.js
│
├── core/                    # Core logic (matches Unity Core/)
│   ├── scene-core.js        # Scene initialization
│   ├── time-system.js       # Time calculations (like Sundial)
│   ├── zoom-manager.js      # Zoom level management
│   └── camera-controls.js   # Camera/navigation
│
├── renderers/               # Rendering (matches Unity Renderers/)
│   ├── planet-renderer.js   # Planets (matches Renderers/Planets/)
│   ├── worldline-renderer.js # Worldlines (matches Renderers/Worldlines/)
│   ├── timemarker-renderer.js # Time markers (matches Renderers/TimeMarkers/)
│   └── event-renderer.js    # Events (matches Renderers/Events/)
│
├── layers/                  # Layer management (matches Unity Layers/)
│   ├── layer-manager.js
│   └── calendar-manager.js
│
├── pipeline/                # Data fetching/storage (matches Unity Pipeline/)
│   ├── nakama/
│   │   ├── nakama-client.js
│   │   └── nakama-storage.js
│   ├── oauth/
│   │   └── google-oauth.js
│   └── data-sources/
│       └── csv-handler.js
│
├── input/                   # Input handling (matches Unity Input/)
│   ├── mouse-controls.js
│   ├── keyboard-controls.js
│   └── touch-controls.js
│
├── adapters/                 # Platform adapters (NEW - for XR, etc.)
│   ├── xr/
│   │   └── webxr-adapter.js
│   └── input/
│       └── xr-input.js
│
├── models/                  # Data models (matches Unity Models/)
│   └── vevent.js            # Move from utils/vevent.js
│
├── utils/                   # Utilities (matches Unity Utils/)
│   └── geometry-helpers.js
│
├── config.js                # Configuration
├── datetime.js              # Date/time utilities
├── scene-geometry.js        # Geometry calculations
└── main.js                  # Main application (thin initialization)
```

## Directory Mapping: Unity ↔ Web

| Unity | Web | Notes |
|-------|-----|-------|
| `API/` | `js/api/` | Public API |
| `Core/` | `js/core/` | Core logic (NOT renderers) |
| `Renderers/` | `js/renderers/` | **Top-level, separate from core** |
| `Renderers/Planets/` | `js/renderers/planet-renderer.js` | Single file (web doesn't need Z0/Z1 split) |
| `Renderers/Worldlines/` | `js/renderers/worldline-renderer.js` | Single file |
| `Renderers/TimeMarkers/` | `js/renderers/timemarker-renderer.js` | Single file |
| `Renderers/Events/` | `js/renderers/event-renderer.js` | Single file |
| `Layers/` | `js/layers/` | Layer management |
| `Pipeline/` | `js/pipeline/` | Data fetching/storage |
| `Pipeline/Nakama/` | `js/pipeline/nakama/` | Nakama integration |
| `Pipeline/OAuth/` | `js/pipeline/oauth/` | OAuth integration |
| `Pipeline/DataSources/` | `js/pipeline/data-sources/` | Data sources |
| `Input/` | `js/input/` | Input handling |
| `Models/` | `js/models/` | Data models |
| `Utils/` | `js/utils/` | Utilities |
| `UI/` | `js/ui/` (future) | UI systems |

## Migration Steps

### Phase 1: Create Directory Structure
1. ✅ Create `js/adapters/xr/` (already done)
2. ✅ Create `js/adapters/input/` (already done)
3. Create `js/renderers/` (top-level, NOT in core)
4. Create `js/core/` (for core logic only)
5. Create `js/layers/`
6. Create `js/pipeline/nakama/`
7. Create `js/pipeline/oauth/`
8. Create `js/pipeline/data-sources/`
9. Create `js/input/`
10. Create `js/models/`

### Phase 2: Move Files
1. Move `js/utils/vevent.js` → `js/models/vevent.js`
2. Extract planet rendering from `main.js` → `js/renderers/planet-renderer.js`
3. Extract worldline rendering from `main.js` → `js/renderers/worldline-renderer.js`
4. Extract time marker rendering from `main.js` → `js/renderers/timemarker-renderer.js`
5. Extract event rendering → `js/renderers/event-renderer.js`
6. Extract scene initialization → `js/core/scene-core.js`
7. Extract time calculations → `js/core/time-system.js`
8. Extract zoom management → `js/core/zoom-manager.js`
9. Extract camera controls → `js/core/camera-controls.js`
10. Extract input handling → `js/input/mouse-controls.js`, etc.

### Phase 3: Update Imports
1. Update `index.html` to load modules in correct order
2. Update `main.js` to import from new locations
3. Update `circaevum-gl.js` to use new structure

## Integration with XR Adapters

The XR adapters we created fit into this structure:

```
js/
├── adapters/                # Platform adapters
│   ├── xr/
│   │   └── webxr-adapter.js  ✅ Already created
│   └── input/
│       └── xr-input.js       ✅ Already created
```

These are **adapters** (platform-specific), not core logic, so they belong in `adapters/` not `core/`.

## Consistency Rules

1. **Renderers are separate from Core**: `js/renderers/` is top-level, not `js/core/renderers/`
2. **Core is for logic only**: Scene init, time system, zoom manager, camera controls
3. **Pipeline matches Unity**: Same subdirectories (Nakama, OAuth, DataSources)
4. **Input matches Unity**: Separate `js/input/` directory
5. **Models match Unity**: `js/models/` for data models
6. **Adapters are new**: For XR/input adapters (makes sense for web)

## Benefits of 1:1 Alignment

1. **Easy cross-reference**: Unity devs can find equivalent web code instantly
2. **Consistent mental model**: Same structure = easier to understand
3. **Parallel development**: Teams can work on same feature across platforms
4. **Documentation**: Can reference same structure in both platforms
5. **Maintenance**: Changes in one platform inform changes in the other

## Next Steps

1. **Integrate XR adapters** into `main.js` (using current structure)
2. **Create migration plan** for Phase 1-3 above
3. **Execute migration** gradually (one module at a time)
4. **Test after each phase** to ensure nothing breaks
