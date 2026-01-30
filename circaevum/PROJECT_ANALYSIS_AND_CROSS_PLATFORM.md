# Project Analysis & Cross-Platform Architecture Strategy

## Executive Summary

After analyzing all projects in `vercel-dash/`, I've identified the **working patterns** and **best approaches** for building Circaevum GL as a cross-platform graphics library that works across Web (JavaScript) and Unity (C#).

## Key Findings from vercel-dash Projects

### ✅ Projects That Actually Work

#### 1. **react-account-mgmt/nakama-integration** (MOST MATURE)
**What Works:**
- ✅ Full Nakama authentication (email/password, session management)
- ✅ OAuth token storage in Nakama (Google Calendar tokens)
- ✅ React context pattern for auth state
- ✅ Server-side API routes for secure token handling
- ✅ Unity-compatible client patterns (`nakama-unity-compat.ts`)

**Key Files:**
- `lib/nakama.ts` - Client creation, session management
- `contexts/auth-context.tsx` - React auth state management
- `contexts/calendar-context.tsx` - Calendar integration state
- `app/api/save-tokens/route.ts` - Secure token storage
- `lib/nakama-unity-compat.ts` - Unity compatibility layer

**Pattern:** Server-side API routes handle sensitive operations, React manages UI state

#### 2. **v0-toggle-timelines** (BEST 3D VISUALIZATION)
**What Works:**
- ✅ React Three Fiber for 3D rendering
- ✅ Event positioning on orbital system
- ✅ Layer-based event management
- ✅ Multiple zoom levels (day/week/month/year)
- ✅ Calendar color mapping
- ✅ Event filtering by calendar source

**Key Files:**
- `components/cycle-viewer.tsx` - Orbital system with events
- `components/hybrid-viewer.tsx` - Advanced event positioning
- `components/timeline-viewer.tsx` - Timeline-based visualization

**Pattern:** React components wrap Three.js, events positioned using time calculations

#### 3. **v0-temporal-uploads** (BEST LAYER MANAGEMENT)
**What Works:**
- ✅ Complete layer management system
- ✅ Layer visibility toggling
- ✅ Color customization
- ✅ Event counting and display
- ✅ File upload and parsing
- ✅ Context-based state management

**Key Files:**
- `context/layers-context.tsx` - Layer state management
- `components/layers-list.tsx` - Layer UI with toggles/colors
- `components/timeline-visualization.tsx` - 3D event rendering

**Pattern:** Context API for state, components for UI, Three.js for rendering

#### 4. **circaevum-landing 2** (BEST AUTHENTICATION FLOW)
**What Works:**
- ✅ Vanilla JS Nakama integration
- ✅ Clean separation of concerns
- ✅ Environment variable configuration
- ✅ Production-ready structure

**Pattern:** Simple, framework-agnostic approach

### ❌ Projects That Don't Work Well

- **circa-3d** - Basic React setup, no real functionality
- **circa-account-dashboard** - Incomplete
- **circa-turbo** - Just Turborepo boilerplate
- **circa-web** - Empty/minimal

## Working Architecture Patterns

### Pattern 1: React + Three.js (v0-toggle-timelines)

```typescript
// React component wraps Three.js scene
<Canvas>
  <UnifiedOrbitalSystem 
    zoomLevel={zoomLevel}
    events={enrichedEvents}
    bgColor={bgColor}
  />
</Canvas>

// Events positioned using time calculations
const eventDate = new Date(event.start)
const angle = calculateAngleFromDate(eventDate)
const position = calculateOrbitalPosition(angle, distance)
```

**Pros:**
- React manages state
- Three.js handles rendering
- Clean separation

**Cons:**
- Tightly coupled to React
- Hard to reuse in Unity

### Pattern 2: Context-Based State (v0-temporal-uploads)

```typescript
// Layer state in context
const { layers, toggleLayerVisibility, updateLayer } = useLayers()

// Components consume context
<LayersList layers={layers} />
<TimelineVisualization layers={layers} />
```

**Pros:**
- Centralized state
- Easy to share across components
- Type-safe

**Cons:**
- React-specific
- Can't use in Unity

### Pattern 3: Server API Routes (react-account-mgmt)

```typescript
// Secure server-side operations
POST /api/save-tokens
POST /api/nakama-auth

// Client-side consumption
const response = await fetch('/api/save-tokens', {
  method: 'POST',
  body: JSON.stringify({ provider, code, sessionData })
})
```

**Pros:**
- Secure (tokens never exposed to client)
- Works from any client (web, Unity, etc.)
- Centralized logic

**Cons:**
- Requires server
- Network latency

## Cross-Platform Architecture Research

### Cesium Architecture

**How Cesium Works:**
- **Core Engine**: C++ compiled to WebAssembly
- **JavaScript API**: Wraps WASM core
- **Unity Plugin**: C# wrapper that calls JavaScript API via bridge
- **Shared Data Format**: 3D Tiles (glTF-based)

**Key Insight:** Cesium uses **WebAssembly core** with **language-specific wrappers**

### Google Earth (Alpha)

**Architecture:**
- **Core**: C++ rendering engine
- **Web**: JavaScript API + WebGL
- **Mobile**: Native SDKs (iOS/Android)
- **Shared Protocol**: Protocol Buffers for data

**Key Insight:** **Shared core** with **platform-specific APIs**

### NVIDIA Earth 2

**Architecture:**
- **Core**: CUDA-based simulation engine
- **Web**: JavaScript visualization layer
- **Unity**: C# plugin that communicates via WebSocket/API
- **Shared Data**: JSON/Protocol Buffers

**Key Insight:** **Service-based architecture** - core runs as service, clients connect

## Recommended Cross-Platform Architecture for Circaevum GL

### Option 1: Separate-but-Parallel (RECOMMENDED for Web + Unity)

**Architecture:**
```
┌─────────────────────────────────────────┐
│      Shared Specification Layer         │
│  - Event schema (JSON Schema)           │
│  - Scene configuration format            │
│  - API contract definition               │
│  - Time calculation algorithms (docs)   │
└──────────────┬──────────────────────────┘
               │
       ┌───────┴────────┐
       │                │
┌──────▼──────┐  ┌──────▼──────┐
│ Circaevum   │  │ Circaevum   │
│ GL (Web)    │  │ GL (Unity)   │
│ JavaScript  │  │ C#           │
└─────────────┘  └──────────────┘
```

**Implementation:**
- **Shared**: JSON schemas, API contracts, documentation
- **Web**: JavaScript implementation using Three.js
- **Unity**: C# implementation using Unity's rendering
- **Communication**: Nakama for data sync, REST API for commands

**Pros:**
- ✅ Each platform optimized for its ecosystem
- ✅ No performance overhead from bridges
- ✅ Can evolve independently
- ✅ Easier to maintain (familiar patterns per platform)

**Cons:**
- ❌ Feature parity requires discipline
- ❌ Bug fixes need to be applied twice
- ❌ More code to maintain

### Option 2: WebAssembly Core (Advanced)

**Architecture:**
```
┌─────────────────────────────────────────┐
│      WebAssembly Core                    │
│  - Time calculations                     │
│  - Event positioning logic               │
│  - Scene geometry math                   │
└──────────────┬──────────────────────────┘
               │
       ┌───────┴────────┐
       │                │
┌──────▼──────┐  ┌──────▼──────┐
│ JS Wrapper  │  │ C# Wrapper   │
│ (Three.js)  │  │ (Unity)      │
└─────────────┘  └──────────────┘
```

**Implementation:**
- **Core**: Rust/C++ compiled to WASM
- **Web**: JavaScript calls WASM, uses Three.js for rendering
- **Unity**: C# calls WASM via P/Invoke or WASM runtime

**Pros:**
- ✅ Shared logic (time calculations, positioning)
- ✅ Single source of truth for algorithms
- ✅ Performance (WASM is fast)

**Cons:**
- ❌ Complex build system
- ❌ WASM in Unity is challenging
- ❌ Overkill for current needs

### Option 3: Service-Based (For Future)

**Architecture:**
```
┌─────────────────────────────────────────┐
│      Circaevum Service (Nakama/API)     │
│  - Scene state management               │
│  - Event calculations                   │
│  - Real-time sync                       │
└──────────────┬──────────────────────────┘
               │
       ┌───────┴────────┐
       │                │
┌──────▼──────┐  ┌──────▼──────┐
│ Web Client  │  │ Unity Client │
│ (Three.js)  │  │ (C#)         │
└─────────────┘  └──────────────┘
```

**Pros:**
- ✅ True real-time sync
- ✅ Centralized logic
- ✅ Works across all platforms

**Cons:**
- ❌ Requires always-on connection
- ❌ Latency issues
- ❌ More complex

## Recommended Approach: Separate-but-Parallel

Based on your existing codebase and the working patterns I found, I recommend **Option 1: Separate-but-Parallel**.

### Why This Works Best

1. **Your Unity code already exists** - You have working C# implementations
2. **Your web code is mature** - Three.js-based, well-structured
3. **Nakama provides sync** - Data layer already handles cross-platform
4. **Familiar patterns** - Each platform uses its native ecosystem

### Implementation Structure

```
circaevum/
├── spec/                          # Shared specification
│   ├── event-schema.json          # Event data format
│   ├── layer-schema.json          # Layer configuration
│   ├── api-contract.md            # API definitions
│   └── time-calculations.md       # Algorithm documentation
│
├── web/                           # Web implementation
│   ├── js/
│   │   ├── api/
│   │   │   └── circaevum-gl.js   # Public API
│   │   ├── core/                  # Core modules
│   │   ├── layers/                # Layer management
│   │   └── renderers/              # Three.js renderers
│   └── package.json
│
└── unity/                         # Unity implementation
    ├── Assets/
    │   └── Circaevum/
    │       ├── Core/              # Core C# classes
    │       ├── Layers/             # Layer management
    │       ├── Renderers/          # Unity renderers
    │       └── API/                # Public API (C#)
    └── package.json
```

### Shared Specification

**event-schema.json:**
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "id": { "type": "string" },
    "title": { "type": "string" },
    "startTime": { "type": "string", "format": "date-time" },
    "endTime": { "type": "string", "format": "date-time" },
    "color": { "type": "string", "pattern": "^#[0-9A-Fa-f]{6}$" },
    "layerId": { "type": "string" },
    "metadata": { "type": "object" }
  },
  "required": ["id", "title", "startTime", "layerId"]
}
```

**api-contract.md:**
```markdown
# Circaevum GL API Contract

## Layer Management
- `addLayer(layerId, config)` - Add layer
- `removeLayer(layerId)` - Remove layer
- `setLayerVisibility(layerId, visible)` - Toggle visibility
- `updateLayerStyle(layerId, style)` - Update color/opacity

## Event Management
- `addEvents(layerId, events[])` - Add events to layer
- `removeEvents(layerId, eventIds[])` - Remove events
- `updateEvents(layerId, events[])` - Update events

## Navigation
- `setZoomLevel(level)` - Change zoom (1-9)
- `navigateToTime(date)` - Navigate to date
- `fitToLayer(layerId)` - Auto-zoom to layer
```

### Web Implementation (JavaScript)

```javascript
// js/api/circaevum-gl.js
class CircaevumGL {
  constructor(container, options) {
    // Three.js scene initialization
    this.scene = new THREE.Scene()
    // ... existing code ...
  }
  
  addLayer(layerId, config) {
    // JavaScript implementation
  }
  
  addEvents(layerId, events) {
    // Validate against schema
    // Render using Three.js
  }
}
```

### Unity Implementation (C#)

```csharp
// Assets/Circaevum/API/CircaevumGL.cs
public class CircaevumGL {
  private Scene scene;
  
  public CircaevumGL(GameObject container, Options options) {
    // Unity scene initialization
    this.scene = new Scene();
    // ... existing code ...
  }
  
  public void AddLayer(string layerId, LayerConfig config) {
    // C# implementation
  }
  
  public void AddEvents(string layerId, Event[] events) {
    // Validate against schema
    // Render using Unity
  }
}
```

### Data Synchronization via Nakama

```typescript
// Web: Fetch events from Nakama
const events = await nakamaClient.readStorageObjects(session, {
  collection: 'events',
  keys: [`layer_${layerId}`]
})

// Send to GL
circaevumGL.addEvents(layerId, events)
```

```csharp
// Unity: Fetch events from Nakama
var events = await nakamaClient.ReadStorageObjectsAsync(session, new[] {
  new StorageObjectId {
    Collection = "events",
    Key = $"layer_{layerId}"
  }
});

// Send to GL
circaevumGL.AddEvents(layerId, events);
```

## Integration with Existing Code

### From react-account-mgmt

**Use:**
- ✅ Nakama authentication pattern
- ✅ OAuth token storage
- ✅ Server API routes for security
- ✅ React context for state

**Adapt:**
- Extract auth logic to shared service
- Make API routes work from Unity too

### From v0-toggle-timelines

**Use:**
- ✅ Event positioning algorithms
- ✅ Orbital system calculations
- ✅ Zoom level logic

**Adapt:**
- Extract to shared specification
- Implement in both JS and C#

### From v0-temporal-uploads

**Use:**
- ✅ Layer management patterns
- ✅ Layer context structure
- ✅ UI component patterns

**Adapt:**
- Keep React-specific parts in web
- Create Unity equivalent in C#

## Migration Strategy

### Phase 1: Define Shared Specification (Week 1)
1. Create `spec/` directory
2. Define event schema (JSON Schema)
3. Define layer schema
4. Document API contract
5. Document time calculation algorithms

### Phase 2: Refactor Web Code (Week 2-3)
1. Extract core logic from `main.js`
2. Create `circaevum-gl.js` API
3. Implement event renderer
4. Test with existing React code

### Phase 3: Create Unity API (Week 4-5)
1. Create C# API matching JavaScript API
2. Implement using existing Unity code
3. Use same event/layer schemas
4. Test cross-platform sync via Nakama

### Phase 4: Integration (Week 6)
1. Connect web to Nakama
2. Connect Unity to Nakama
3. Test real-time sync
4. Polish and optimize

## Key Design Decisions

### 1. Shared Specification, Separate Implementation
- **Why**: Each platform optimized for its ecosystem
- **How**: JSON schemas, API contracts, algorithm docs

### 2. Nakama for Data Sync
- **Why**: You already have it, works cross-platform
- **How**: Events stored in Nakama, both platforms fetch

### 3. Server API for Security
- **Why**: OAuth tokens must stay secure
- **How**: Next.js API routes, Unity calls same endpoints

### 4. Framework-Agnostic Core
- **Why**: Web uses React, Unity uses C#
- **How**: Core logic in pure JS/C#, frameworks wrap it

## Next Steps

1. **Create shared specification** (`spec/` directory)
2. **Refactor web code** to match spec
3. **Create Unity API** matching web API
4. **Test cross-platform sync** via Nakama
5. **Document patterns** for future platforms

## Questions to Answer

1. **Real-time sync needed?** Or is periodic fetch enough?
2. **Shared scene state?** Or independent per platform?
3. **Event editing?** Which platform is source of truth?
4. **Performance targets?** How many events per layer?

---

This architecture allows you to:
- ✅ Keep existing Unity code
- ✅ Refactor web code cleanly
- ✅ Share data via Nakama
- ✅ Maintain feature parity
- ✅ Scale to more platforms later
