# Unity Code Reorganization V2 - Function-Based Structure

## Overview

This guide reorganizes Unity code into a **function-based structure** where code is organized by **what it does** (Renderers, Input, Pipeline) rather than by zoom level. Zoom-specific code (Z0/Z1/Z2) is contained within functional modules.

**Note**: The shared specification is located at `@yang/spec/` (applies to both Unity and Web implementations).

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
│   │   └── Z2_HourMapper.cs
│   ├── Events/
│   │   ├── Z2_DailyEventRenderer.cs
│   │   └── Z1_ChartGenerator.cs
│   └── CalendarCollectionManager.cs
├── Pipeline/
│   ├── NakamaStorageService.cs
│   ├── RequestGoogle.cs
│   └── GoogleEventManager.cs
└── Core/
    └── ZX_TimeFrameManager.cs
```

### Proposed Structure (After)

```
Assets/Circaevum/
├── API/
│   └── CircaevumGL.cs              # NEW: Public API
├── Core/
│   ├── SceneCore.cs                 # NEW: Scene initialization
│   ├── CameraControls.cs            # NEW: Camera management
│   ├── TimeSystem.cs                # NEW: Time calculations
│   ├── ZX_TimeFrameManager.cs      # KEEP: Cross-zoom manager
│   └── Sundial.cs                   # KEEP: Real-time reference
├── Renderers/
│   ├── Planets/
│   │   ├── PlanetRenderer.cs        # NEW: Base planet renderer
│   │   ├── Z0_PlanetCentury.cs     # MOVE from Renderers/Backbone/
│   │   └── Z1_PlanetHelix.cs       # MOVE from Renderers/Backbone/
│   ├── Worldlines/
│   │   ├── WorldlineRenderer.cs    # NEW: Base worldline renderer
│   │   ├── Z0_CenturyHelix.cs      # MOVE from Renderers/Backbone/
│   │   └── Z1_WorldlineRenderer.cs  # NEW: Z1 worldlines
│   ├── TimeMarkers/
│   │   ├── TimeMarkerRenderer.cs    # NEW: Base time marker renderer
│   │   ├── Z1_TimeFrame.cs         # MOVE from Renderers/Backbone/
│   │   ├── Z1_YearLabelManager.cs  # MOVE from Renderers/Backbone/
│   │   ├── Z1_MonthMarkers.cs     # MOVE from Renderers/Backbone/
│   │   ├── Z1_MonthLineCreator.cs  # MOVE from Renderers/Backbone/
│   │   ├── Z1_MonthLabelCreator.cs # MOVE from Renderers/Backbone/
│   │   ├── Z1_SunLine.cs           # MOVE from Renderers/Backbone/
│   │   ├── Z1_DayLineCoordinator.cs # MOVE from Renderers/Backbone/
│   │   └── Z2_HourMapper.cs        # MOVE from Renderers/Backbone/
│   └── Events/
│       ├── EventRenderer.cs         # NEW: Base event renderer
│       ├── Z1_EventMapper.cs       # MOVE from Renderers/Backbone/
│       ├── Z1_ChartGenerator.cs    # MOVE from Renderers/Events/
│       └── Z2_DailyEventRenderer.cs # MOVE from Renderers/Events/
├── Layers/
│   ├── LayerManager.cs             # NEW: Layer management
│   ├── LayerRenderer.cs            # NEW: Layer rendering
│   ├── CalendarCollectionManager.cs # MOVE from Renderers/
│   └── CalendarSourceHandler.cs    # MOVE from IntegrationControl/
├── Input/
│   ├── MouseInput.cs                # NEW: Mouse input
│   ├── KeyboardInput.cs            # NEW: Keyboard input
│   ├── TouchInput.cs                # NEW: Touch input
│   └── VRInput.cs                   # NEW: VR/XR input
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
│       ├── GarminHRManager.cs      # MOVE from Pipeline/
│       └── GarminSleepManager.cs   # MOVE from Pipeline/
├── Models/
│   ├── VEvent.cs                    # NEW: RFC 5545 VEVENT model
│   ├── VEventAdapter.cs            # NEW: Google Event → VEVENT
│   └── EventWrapper.cs             # MOVE from Pipeline/
└── Utils/
    ├── SchemaValidator.cs          # NEW: Schema validation
    └── GeometryUtils.cs             # NEW: Geometry calculations
```

## File Movement Map

### Planet Renderers

| Current Location | New Location | Action |
|------------------|--------------|--------|
| `Renderers/Backbone/Z0_PlanetCentury.cs` | `Renderers/Planets/Z0_PlanetCentury.cs` | Move |
| `Renderers/Backbone/Z1_PlanetHelix.cs` | `Renderers/Planets/Z1_PlanetHelix.cs` | Move |

### Worldline Renderers

| Current Location | New Location | Action |
|------------------|--------------|--------|
| `Renderers/Backbone/Z0_CenturyHelix.cs` | `Renderers/Worldlines/Z0_CenturyHelix.cs` | Move |

### Time Marker Renderers

| Current Location | New Location | Action |
|------------------|--------------|--------|
| `Renderers/Backbone/Z1_TimeFrame.cs` | `Renderers/TimeMarkers/Z1_TimeFrame.cs` | Move |
| `Renderers/Backbone/Z1_YearLabelManager.cs` | `Renderers/TimeMarkers/Z1_YearLabelManager.cs` | Move |
| `Renderers/Backbone/Z1_MonthMarkers.cs` | `Renderers/TimeMarkers/Z1_MonthMarkers.cs` | Move |
| `Renderers/Backbone/Z1_MonthLineCreator.cs` | `Renderers/TimeMarkers/Z1_MonthLineCreator.cs` | Move |
| `Renderers/Backbone/Z1_MonthLabelCreator.cs` | `Renderers/TimeMarkers/Z1_MonthLabelCreator.cs` | Move |
| `Renderers/Backbone/Z1_SunLine.cs` | `Renderers/TimeMarkers/Z1_SunLine.cs` | Move |
| `Renderers/Backbone/Z1_DayLineCoordinator.cs` | `Renderers/TimeMarkers/Z1_DayLineCoordinator.cs` | Move |
| `Renderers/Backbone/Z2_HourMapper.cs` | `Renderers/TimeMarkers/Z2_HourMapper.cs` | Move |

### Event Renderers

| Current Location | New Location | Action |
|------------------|--------------|--------|
| `Renderers/Backbone/Z1_EventMapper.cs` | `Renderers/Events/Z1_EventMapper.cs` | Move |
| `Renderers/Events/Z1_ChartGenerator.cs` | `Renderers/Events/Z1_ChartGenerator.cs` | Keep (already in Events/) |
| `Renderers/Events/Z2_DailyEventRenderer.cs` | `Renderers/Events/Z2_DailyEventRenderer.cs` | Keep (already in Events/) |

### Day Renderers

| Current Location | New Location | Action |
|------------------|--------------|--------|
| `Renderers/Backbone/Z2_DayRenderer.cs` | `Renderers/TimeMarkers/Z2_DayRenderer.cs` | Move (day markers are time markers) |
| `Renderers/Z2_DayMapper.cs` | `Renderers/TimeMarkers/Z2_DayMapper.cs` | Move |

### Layer Management

| Current Location | New Location | Action |
|------------------|--------------|--------|
| `Renderers/CalendarCollectionManager.cs` | `Layers/CalendarCollectionManager.cs` | Move |
| `IntegrationControl/CalendarSourceHandler.cs` | `Layers/CalendarSourceHandler.cs` | Move |

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

### Models

| Current Location | New Location | Action |
|------------------|--------------|--------|
| `Pipeline/RequestGoogle.cs` (EventWrapper) | `Models/EventWrapper.cs` | Extract class |
| `Models/CalendarEvent.cs` | `Models/VEvent.cs` | Rename/refactor to RFC 5545 |

## Step-by-Step Migration

### Step 1: Create New Directory Structure

```bash
cd Assets/Circaevum

# Create new directories
mkdir -p API
mkdir -p Core
mkdir -p Renderers/Planets
mkdir -p Renderers/Worldlines
mkdir -p Renderers/TimeMarkers
mkdir -p Renderers/Events
mkdir -p Layers
mkdir -p Input
mkdir -p Pipeline/Nakama
mkdir -p Pipeline/OAuth
mkdir -p Pipeline/DataSources
mkdir -p Models
mkdir -p Utils
```

### Step 2: Move Planet Renderers

```bash
mv Renderers/Backbone/Z0_PlanetCentury.cs Renderers/Planets/
mv Renderers/Backbone/Z1_PlanetHelix.cs Renderers/Planets/
```

### Step 3: Move Worldline Renderers

```bash
mv Renderers/Backbone/Z0_CenturyHelix.cs Renderers/Worldlines/
```

### Step 4: Move Time Marker Renderers

```bash
mv Renderers/Backbone/Z1_TimeFrame.cs Renderers/TimeMarkers/
mv Renderers/Backbone/Z1_YearLabelManager.cs Renderers/TimeMarkers/
mv Renderers/Backbone/Z1_MonthMarkers.cs Renderers/TimeMarkers/
mv Renderers/Backbone/Z1_MonthLineCreator.cs Renderers/TimeMarkers/
mv Renderers/Backbone/Z1_MonthLabelCreator.cs Renderers/TimeMarkers/
mv Renderers/Backbone/Z1_SunLine.cs Renderers/TimeMarkers/
mv Renderers/Backbone/Z1_DayLineCoordinator.cs Renderers/TimeMarkers/
mv Renderers/Backbone/Z2_HourMapper.cs Renderers/TimeMarkers/
mv Renderers/Backbone/Z2_DayRenderer.cs Renderers/TimeMarkers/
mv Renderers/Z2_DayMapper.cs Renderers/TimeMarkers/
```

### Step 5: Move Event Renderers

```bash
mv Renderers/Backbone/Z1_EventMapper.cs Renderers/Events/
# Z1_ChartGenerator.cs and Z2_DailyEventRenderer.cs already in Events/
```

### Step 6: Move Layer Management

```bash
mv Renderers/CalendarCollectionManager.cs Layers/
# Find and move CalendarSourceHandler.cs
```

### Step 7: Reorganize Pipeline

```bash
# Create subdirectories
mkdir -p Pipeline/Nakama
mkdir -p Pipeline/OAuth
mkdir -p Pipeline/DataSources

# Move files
mv Pipeline/NakamaStorageService.cs Pipeline/Nakama/
mv Pipeline/NakamaUserManager.cs Pipeline/Nakama/
mv Pipeline/RequestGoogle.cs Pipeline/OAuth/
mv Pipeline/GoogleEventManager.cs Pipeline/OAuth/
mv Pipeline/CSVHandler.cs Pipeline/DataSources/
mv Pipeline/GarminHRManager.cs Pipeline/DataSources/
mv Pipeline/GarminSleepManager.cs Pipeline/DataSources/
```

### Step 8: Update Namespaces

For each moved file, update namespace:

```csharp
// Before
// (no namespace or old namespace)

// After
namespace Circaevum.Renderers.Planets
{
    public class Z0_PlanetCentury : MonoBehaviour
    {
        // ... existing code ...
    }
}
```

### Step 9: Create Base Classes

Create base renderer classes:

**Renderers/Planets/PlanetRenderer.cs:**
```csharp
namespace Circaevum.Renderers.Planets
{
    public abstract class PlanetRenderer : MonoBehaviour
    {
        public abstract void RenderPlanet(int planetIndex, float currentHeight);
    }
}
```

**Renderers/Events/EventRenderer.cs:**
```csharp
namespace Circaevum.Renderers.Events
{
    using Circaevum.Models;
    
    public abstract class EventRenderer : MonoBehaviour
    {
        public abstract void RenderEvents(List<VEvent> events, LayerConfig layer);
    }
}
```

### Step 10: Update Using Statements

Update files that reference moved classes:

```csharp
// Before
using UnityEngine;

// After
using UnityEngine;
using Circaevum.Renderers.Planets;
using Circaevum.Renderers.Events;
using Circaevum.Renderers.TimeMarkers;
```

## Create VEVENT Model

**Models/VEvent.cs:**
```csharp
using System;
using System.Collections.Generic;

namespace Circaevum.Models
{
    /// <summary>
    /// RFC 5545 VEVENT format model
    /// </summary>
    [Serializable]
    public class VEvent
    {
        public string Uid { get; set; }
        public DateTime? DtStart { get; set; }
        public DateTime? DtEnd { get; set; }
        public string Summary { get; set; }
        public string Description { get; set; }
        public string Location { get; set; }
        public EventStatus Status { get; set; }
        public DateTime? Created { get; set; }
        public DateTime? LastModified { get; set; }
        public string Color { get; set; }
        public string LayerId { get; set; }
    }

    public enum EventStatus
    {
        Confirmed,
        Tentative,
        Cancelled
    }
}
```

**Models/VEventAdapter.cs:**
```csharp
using Google.Apis.Calendar.v3.Data;

namespace Circaevum.Models
{
    /// <summary>
    /// Converts between Google Calendar Event and RFC 5545 VEVENT format
    /// </summary>
    public static class VEventAdapter
    {
        public static VEvent FromGoogleEvent(Event googleEvent)
        {
            return new VEvent
            {
                Uid = googleEvent.Id,
                DtStart = googleEvent.Start?.DateTime ?? 
                         (googleEvent.Start?.Date != null ? 
                          DateTime.Parse(googleEvent.Start.Date) : null),
                DtEnd = googleEvent.End?.DateTime ?? 
                       (googleEvent.End?.Date != null ? 
                        DateTime.Parse(googleEvent.End.Date) : null),
                Summary = googleEvent.Summary,
                Description = googleEvent.Description,
                Location = googleEvent.Location,
                Status = MapStatus(googleEvent.Status),
                Created = googleEvent.Created,
                LastModified = googleEvent.Updated,
                Color = MapColorId(googleEvent.ColorId)
            };
        }

        private static EventStatus MapStatus(string status)
        {
            return status?.ToUpper() switch
            {
                "CONFIRMED" => EventStatus.Confirmed,
                "TENTATIVE" => EventStatus.Tentative,
                "CANCELLED" => EventStatus.Cancelled,
                _ => EventStatus.Confirmed
            };
        }

        private static string MapColorId(string colorId)
        {
            // Map Google color IDs to hex colors
            // Implementation depends on your color mapping
            return colorId ?? "0";
        }
    }
}
```

## Testing After Migration

### Checklist

- [ ] All planet renderers work (Z0, Z1)
- [ ] All worldline renderers work (Z0, Z1)
- [ ] All time marker renderers work (Z1, Z2)
- [ ] All event renderers work (Z1, Z2)
- [ ] Layer management works
- [ ] Nakama integration works
- [ ] OAuth flows work
- [ ] VEVENT adapter works
- [ ] No broken references in scenes
- [ ] No broken references in prefabs
- [ ] All namespaces compile correctly

## Benefits

1. **Function-Based Organization**: Easy to find code by purpose
2. **Zoom-Specific Code Contained**: Z0/Z1/Z2 code within functional modules
3. **Clear Structure**: Logical organization for new developers
4. **Maintainability**: Related code grouped together
5. **Scalability**: Easy to add new renderers, input methods, etc.
