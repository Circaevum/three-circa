# Unity Code Reorganization Guide

## Current vs. Proposed Structure

### Current Structure (Before)

```
Assets/Circaevum/
├── Renderers/
│   ├── Backbone/
│   │   ├── Z0_PlanetCentury.cs
│   │   ├── Z0_CenturyHelix.cs
│   │   ├── Z1_TimeFrame.cs
│   │   ├── Z1_PlanetHelix.cs
│   │   ├── Z1_YearLabelManager.cs
│   │   ├── Z1_MonthMarkers.cs
│   │   ├── Z2_DayRenderer.cs
│   │   ├── Z2_HourMapper.cs
│   │   └── ... (many more)
│   ├── Events/
│   │   ├── Z2_DailyEventRenderer.cs
│   │   └── Z1_ChartGenerator.cs
│   ├── CalendarCollectionManager.cs
│   └── CalendarManager.cs
├── Pipeline/
│   ├── NakamaStorageService.cs
│   ├── RequestGoogle.cs
│   ├── GoogleEventManager.cs
│   └── ... (many more)
├── Core/
│   ├── ZX_TimeFrameManager.cs
│   └── Sundial.cs
└── Models/
    └── CalendarEvent.cs
```

### Proposed Structure (After)

```
Assets/Circaevum/
├── API/
│   └── CircaevumGL.cs              # NEW: Public API matching Web
├── Core/
│   ├── SceneCore.cs                 # NEW: Scene initialization
│   ├── CameraControls.cs            # NEW: Camera management
│   ├── TimeSystem.cs                # NEW: Time calculations
│   ├── ZX_TimeFrameManager.cs      # KEEP: Cross-zoom manager
│   └── Sundial.cs                   # KEEP: Real-time reference
├── Zoom/
│   ├── Z0/                          # NEW: Century level
│   │   ├── Z0_PlanetCentury.cs     # MOVE from Renderers/Backbone/
│   │   ├── Z0_CenturyHelix.cs      # MOVE from Renderers/Backbone/
│   │   └── Z0_Renderer.cs           # NEW: Unified Z0 renderer
│   ├── Z1/                          # NEW: Year level
│   │   ├── Z1_TimeFrame.cs         # MOVE from Renderers/Backbone/
│   │   ├── Z1_PlanetHelix.cs       # MOVE from Renderers/Backbone/
│   │   ├── Z1_YearLabelManager.cs  # MOVE from Renderers/Backbone/
│   │   ├── Z1_MonthMarkers.cs     # MOVE from Renderers/Backbone/
│   │   ├── Z1_MonthLineCreator.cs  # MOVE from Renderers/Backbone/
│   │   ├── Z1_MonthLabelCreator.cs # MOVE from Renderers/Backbone/
│   │   ├── Z1_OrbitPositioner.cs   # MOVE from Renderers/Backbone/
│   │   ├── Z1_SunLine.cs           # MOVE from Renderers/Backbone/
│   │   ├── Z1_DayLineCoordinator.cs # MOVE from Renderers/Backbone/
│   │   ├── Z1_TripManager.cs       # MOVE from Renderers/Backbone/
│   │   └── Z1_Renderer.cs          # NEW: Unified Z1 renderer
│   └── Z2/                          # NEW: Day level
│       ├── Z2_DayRenderer.cs      # MOVE from Renderers/Backbone/
│       ├── Z2_DayMapper.cs         # MOVE from Renderers/
│       └── Z2_HourMapper.cs        # MOVE from Renderers/Backbone/
├── Layers/
│   ├── LayerManager.cs             # NEW: Layer management
│   ├── LayerRenderer.cs            # NEW: Layer rendering
│   ├── CalendarCollectionManager.cs # MOVE from Renderers/
│   └── CalendarSourceHandler.cs    # MOVE from IntegrationControl/
├── Renderers/
│   ├── Events/
│   │   ├── EventRenderer.cs        # NEW: Base event renderer
│   │   ├── Z0/
│   │   │   └── Z0_EventRenderer.cs # NEW: Events at century level
│   │   ├── Z1/
│   │   │   ├── Z1_EventRenderer.cs # NEW: Events at year level
│   │   │   └── Z1_ChartGenerator.cs # MOVE from Renderers/Events/
│   │   └── Z2/
│   │       └── Z2_DailyEventRenderer.cs # MOVE from Renderers/Events/
│   ├── Planets/
│   │   └── PlanetRenderer.cs       # NEW: Planet rendering
│   └── Worldlines/
│       └── WorldlineRenderer.cs     # NEW: Worldline rendering
├── Pipeline/
│   ├── Nakama/
│   │   ├── NakamaClient.cs         # MOVE from quest/Assets/
│   │   ├── NakamaStorageService.cs # MOVE from Pipeline/
│   │   └── NakamaUserManager.cs    # MOVE from Pipeline/
│   ├── OAuth/
│   │   ├── GoogleOAuth.cs          # NEW: OAuth handler
│   │   ├── RequestGoogle.cs       # MOVE from Pipeline/
│   │   └── GoogleEventManager.cs  # MOVE from Pipeline/
│   └── DataSources/
│       ├── CSVHandler.cs           # MOVE from Pipeline/
│       ├── GarminHRManager.cs     # MOVE from Pipeline/
│       └── GarminSleepManager.cs   # MOVE from Pipeline/
├── Models/
│   ├── GoogleEventAdapter.cs       # NEW: Google Event wrapper
│   ├── CalendarEvent.cs            # KEEP
│   └── EventWrapper.cs            # MOVE from Pipeline/
└── Utils/
    ├── SchemaValidator.cs          # NEW: Schema validation
    └── GeometryUtils.cs            # NEW: Geometry calculations
```

## File Movement Map

### Z0 Files (Century Level)

| Current Location | New Location | Action |
|------------------|--------------|--------|
| `Renderers/Backbone/Z0_PlanetCentury.cs` | `Zoom/Z0/Z0_PlanetCentury.cs` | Move |
| `Renderers/Backbone/Z0_CenturyHelix.cs` | `Zoom/Z0/Z0_CenturyHelix.cs` | Move |

### Z1 Files (Year Level)

| Current Location | New Location | Action |
|------------------|--------------|--------|
| `Renderers/Backbone/Z1_TimeFrame.cs` | `Zoom/Z1/Z1_TimeFrame.cs` | Move |
| `Renderers/Backbone/Z1_PlanetHelix.cs` | `Zoom/Z1/Z1_PlanetHelix.cs` | Move |
| `Renderers/Backbone/Z1_YearLabelManager.cs` | `Zoom/Z1/Z1_YearLabelManager.cs` | Move |
| `Renderers/Backbone/Z1_MonthMarkers.cs` | `Zoom/Z1/Z1_MonthMarkers.cs` | Move |
| `Renderers/Backbone/Z1_MonthLineCreator.cs` | `Zoom/Z1/Z1_MonthLineCreator.cs` | Move |
| `Renderers/Backbone/Z1_MonthLabelCreator.cs` | `Zoom/Z1/Z1_MonthLabelCreator.cs` | Move |
| `Renderers/Backbone/Z1_MonthLinePositioner.cs` | `Zoom/Z1/Z1_MonthLinePositioner.cs` | Move |
| `Renderers/Backbone/Z1_OrbitPositioner.cs` | `Zoom/Z1/Z1_OrbitPositioner.cs` | Move |
| `Renderers/Backbone/Z1_SunLine.cs` | `Zoom/Z1/Z1_SunLine.cs` | Move |
| `Renderers/Backbone/Z1_DayLineCoordinator.cs` | `Zoom/Z1/Z1_DayLineCoordinator.cs` | Move |
| `Renderers/Backbone/Z1_TripManager.cs` | `Zoom/Z1/Z1_TripManager.cs` | Move |
| `Renderers/Backbone/Z1_EventMapper.cs` | `Zoom/Z1/Z1_EventMapper.cs` | Move |

### Z2 Files (Day Level)

| Current Location | New Location | Action |
|------------------|--------------|--------|
| `Renderers/Backbone/Z2_DayRenderer.cs` | `Zoom/Z2/Z2_DayRenderer.cs` | Move |
| `Renderers/Z2_DayMapper.cs` | `Zoom/Z2/Z2_DayMapper.cs` | Move |
| `Renderers/Backbone/Z2_HourMapper.cs` | `Zoom/Z2/Z2_HourMapper.cs` | Move |

### Event Renderers

| Current Location | New Location | Action |
|------------------|--------------|--------|
| `Renderers/Events/Z2_DailyEventRenderer.cs` | `Renderers/Events/Z2/Z2_DailyEventRenderer.cs` | Move |
| `Renderers/Events/Z1_ChartGenerator.cs` | `Renderers/Events/Z1/Z1_ChartGenerator.cs` | Move |

### Pipeline Files

| Current Location | New Location | Action |
|------------------|--------------|--------|
| `Pipeline/NakamaStorageService.cs` | `Pipeline/Nakama/NakamaStorageService.cs` | Move |
| `Pipeline/NakamaUserManager.cs` | `Pipeline/Nakama/NakamaUserManager.cs` | Move |
| `Pipeline/RequestGoogle.cs` | `Pipeline/OAuth/RequestGoogle.cs` | Move |
| `Pipeline/GoogleEventManager.cs` | `Pipeline/OAuth/GoogleEventManager.cs` | Move |
| `Pipeline/CSVHandler.cs` | `Pipeline/DataSources/CSVHandler.cs` | Move |
| `Pipeline/GarminHRManager.cs` | `Pipeline/DataSources/GarminHRManager.cs` | Move |
| `Pipeline/GarminSleepManager.cs` | `Pipeline/DataSources/GarminSleepManager.cs` | Move |

### Layer Management

| Current Location | New Location | Action |
|------------------|--------------|--------|
| `Renderers/CalendarCollectionManager.cs` | `Layers/CalendarCollectionManager.cs` | Move |
| `IntegrationControl/CalendarSourceHandler.cs` | `Layers/CalendarSourceHandler.cs` | Move |

### Models

| Current Location | New Location | Action |
|------------------|--------------|--------|
| `Pipeline/RequestGoogle.cs` (EventWrapper) | `Models/EventWrapper.cs` | Extract class |

## Namespace Organization

### Proposed Namespaces

```csharp
// Core systems
namespace Circaevum.Core
{
    public class ZX_TimeFrameManager { }
    public class SceneCore { }
    public class TimeSystem { }
}

// Zoom levels
namespace Circaevum.Zoom.Z0
{
    public class Z0_PlanetCentury { }
    public class Z0_CenturyHelix { }
}

namespace Circaevum.Zoom.Z1
{
    public class Z1_TimeFrame { }
    public class Z1_PlanetHelix { }
}

namespace Circaevum.Zoom.Z2
{
    public class Z2_DayRenderer { }
    public class Z2_DayMapper { }
}

// Layers
namespace Circaevum.Layers
{
    public class LayerManager { }
    public class CalendarCollectionManager { }
}

// Renderers
namespace Circaevum.Renderers.Events
{
    public class EventRenderer { }
}

namespace Circaevum.Renderers.Events.Z0
{
    public class Z0_EventRenderer { }
}

// Pipeline
namespace Circaevum.Pipeline.Nakama
{
    public class NakamaStorageService { }
}

namespace Circaevum.Pipeline.OAuth
{
    public class RequestGoogle { }
    public class GoogleEventManager { }
}

// Models
namespace Circaevum.Models
{
    public class GoogleEventAdapter { }
    public class EventWrapper { }
}

// API
namespace Circaevum
{
    public class CircaevumGL { }
}
```

## Step-by-Step Migration

### Step 1: Create New Directory Structure

```bash
# In Unity project
cd Assets/Circaevum

# Create new directories
mkdir -p API
mkdir -p Zoom/Z0
mkdir -p Zoom/Z1
mkdir -p Zoom/Z2
mkdir -p Layers
mkdir -p Renderers/Events/Z0
mkdir -p Renderers/Events/Z1
mkdir -p Renderers/Events/Z2
mkdir -p Renderers/Planets
mkdir -p Renderers/Worldlines
mkdir -p Pipeline/Nakama
mkdir -p Pipeline/OAuth
mkdir -p Pipeline/DataSources
mkdir -p Models
mkdir -p Utils
```

### Step 2: Move Z0 Files

```bash
# Move Z0 files
mv Renderers/Backbone/Z0_PlanetCentury.cs Zoom/Z0/
mv Renderers/Backbone/Z0_CenturyHelix.cs Zoom/Z0/
```

### Step 3: Move Z1 Files

```bash
# Move Z1 files
mv Renderers/Backbone/Z1_*.cs Zoom/Z1/
```

### Step 4: Move Z2 Files

```bash
# Move Z2 files
mv Renderers/Backbone/Z2_DayRenderer.cs Zoom/Z2/
mv Renderers/Backbone/Z2_HourMapper.cs Zoom/Z2/
mv Renderers/Z2_DayMapper.cs Zoom/Z2/
```

### Step 5: Reorganize Event Renderers

```bash
# Move event renderers
mv Renderers/Events/Z2_DailyEventRenderer.cs Renderers/Events/Z2/
mv Renderers/Events/Z1_ChartGenerator.cs Renderers/Events/Z1/
```

### Step 6: Reorganize Pipeline

```bash
# Move Nakama files
mv Pipeline/NakamaStorageService.cs Pipeline/Nakama/
mv Pipeline/NakamaUserManager.cs Pipeline/Nakama/

# Move OAuth files
mv Pipeline/RequestGoogle.cs Pipeline/OAuth/
mv Pipeline/GoogleEventManager.cs Pipeline/OAuth/

# Move data source files
mv Pipeline/CSVHandler.cs Pipeline/DataSources/
mv Pipeline/GarminHRManager.cs Pipeline/DataSources/
mv Pipeline/GarminSleepManager.cs Pipeline/DataSources/
```

### Step 7: Move Layer Management

```bash
# Move layer files
mv Renderers/CalendarCollectionManager.cs Layers/
# CalendarSourceHandler.cs location may vary - find and move
```

### Step 8: Update Namespaces

For each moved file, update namespace:

```csharp
// Before
// (no namespace or old namespace)

// After
namespace Circaevum.Zoom.Z0
{
    public class Z0_PlanetCentury : MonoBehaviour
    {
        // ... existing code ...
    }
}
```

### Step 9: Update Using Statements

Update files that reference moved classes:

```csharp
// Before
using UnityEngine;

// After
using UnityEngine;
using Circaevum.Zoom.Z0;
using Circaevum.Zoom.Z1;
using Circaevum.Zoom.Z2;
```

### Step 10: Update GameObject References

If GameObjects reference scripts by path, update:
- Inspector references (will need manual update)
- `GameObject.Find()` calls (may need path updates)
- Prefab references (update in Unity Editor)

## Unity-Specific Considerations

### Prefab Updates

After moving files:
1. Open each prefab that uses moved scripts
2. Reassign script references if needed
3. Save prefabs

### Scene Updates

1. Open each scene
2. Check for broken script references
3. Reassign if needed
4. Save scenes

### Assembly Definitions

If using `.asmdef` files:
1. Update assembly references
2. Ensure new namespaces are included
3. Rebuild assemblies

## Testing After Migration

### Checklist

- [ ] All Z0 components work
- [ ] All Z1 components work
- [ ] All Z2 components work
- [ ] Event rendering works at all zoom levels
- [ ] Nakama integration works
- [ ] OAuth flows work
- [ ] Layer management works
- [ ] No broken references in scenes
- [ ] No broken references in prefabs
- [ ] All namespaces compile correctly

## Rollback Plan

1. Keep original files in `_Backup/` directory
2. Use version control (Git) for safety
3. Test incrementally (move one zoom level at a time)
4. Document any breaking changes

## Benefits After Reorganization

1. **Clear Zoom Level Separation**: Easy to find Z0/Z1/Z2 code
2. **Better Organization**: Related files grouped together
3. **Easier Maintenance**: Clear structure for new developers
4. **Parallel Development**: Web team can mirror structure
5. **Scalability**: Easy to add new zoom levels or features
