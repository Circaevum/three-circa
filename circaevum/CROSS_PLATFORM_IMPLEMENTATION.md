# Cross-Platform Implementation Guide

## Architecture: Separate-but-Parallel with Shared Specification

This document shows how to implement Circaevum GL for both Web (JavaScript) and Unity (C#) using a shared specification approach.

## Directory Structure

```
circaevum/
├── spec/                              # Shared specification
│   ├── schemas/
│   │   ├── event.schema.json          # Event data format
│   │   ├── layer.schema.json          # Layer configuration
│   │   └── scene-config.schema.json   # Scene configuration
│   ├── api/
│   │   └── api-contract.md            # API definitions
│   └── algorithms/
│       └── time-calculations.md       # Time calculation docs
│
├── web/                               # Web implementation
│   ├── js/
│   │   ├── api/
│   │   │   └── circaevum-gl.js       # Public API
│   │   ├── core/
│   │   │   ├── scene-core.js
│   │   │   └── time-system.js
│   │   ├── layers/
│   │   │   └── layer-manager.js
│   │   └── renderers/
│   │       └── event-renderer.js
│   └── package.json
│
└── unity/                             # Unity implementation
    └── Assets/
        └── Circaevum/
            ├── API/
            │   └── CircaevumGL.cs    # Public API
            ├── Core/
            │   ├── SceneCore.cs
            │   └── TimeSystem.cs
            ├── Layers/
            │   └── LayerManager.cs
            └── Renderers/
                └── EventRenderer.cs
```

## Shared Specification

### Event Schema

**spec/schemas/event.schema.json:**
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Circaevum Event",
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "description": "Unique event identifier"
    },
    "title": {
      "type": "string",
      "description": "Event title"
    },
    "startTime": {
      "type": "string",
      "format": "date-time",
      "description": "ISO 8601 datetime"
    },
    "endTime": {
      "type": "string",
      "format": "date-time",
      "description": "Optional end time for duration events"
    },
    "layerId": {
      "type": "string",
      "description": "ID of the layer this event belongs to"
    },
    "color": {
      "type": "string",
      "pattern": "^#[0-9A-Fa-f]{6}$",
      "description": "Hex color (overrides layer color)"
    },
    "metadata": {
      "type": "object",
      "description": "Additional event data"
    }
  },
  "required": ["id", "title", "startTime", "layerId"]
}
```

### Layer Schema

**spec/schemas/layer.schema.json:**
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Circaevum Layer",
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "description": "Unique layer identifier"
    },
    "name": {
      "type": "string",
      "description": "Display name"
    },
    "source": {
      "type": "string",
      "enum": ["google", "outlook", "garmin", "chase", "manual", "csv", "json"],
      "description": "Data source type"
    },
    "color": {
      "type": "string",
      "pattern": "^#[0-9A-Fa-f]{6}$",
      "description": "Default color for events in this layer"
    },
    "visible": {
      "type": "boolean",
      "description": "Layer visibility"
    },
    "opacity": {
      "type": "number",
      "minimum": 0,
      "maximum": 1,
      "description": "Layer opacity"
    },
    "filter": {
      "type": "object",
      "properties": {
        "dateRange": {
          "type": "object",
          "properties": {
            "start": { "type": "string", "format": "date-time" },
            "end": { "type": "string", "format": "date-time" }
          }
        },
        "eventTypes": {
          "type": "array",
          "items": { "type": "string" }
        }
      }
    }
  },
  "required": ["id", "name", "source", "color", "visible"]
}
```

### API Contract

**spec/api/api-contract.md:**
```markdown
# Circaevum GL API Contract

## Initialization

### Web (JavaScript)
```javascript
const gl = new CircaevumGL(containerElement, {
  zoomLevel: 2,
  lightMode: false
})
```

### Unity (C#)
```csharp
var gl = new CircaevumGL(containerGameObject, new Options {
  ZoomLevel = 2,
  LightMode = false
});
```

## Layer Management

### addLayer(layerId, config)
- **Parameters**: layerId (string), config (LayerConfig)
- **Returns**: void
- **Behavior**: Creates a new layer with the given configuration

### removeLayer(layerId)
- **Parameters**: layerId (string)
- **Returns**: void
- **Behavior**: Removes the layer and all its events

### setLayerVisibility(layerId, visible)
- **Parameters**: layerId (string), visible (boolean)
- **Returns**: void
- **Behavior**: Shows/hides the layer

### updateLayerStyle(layerId, style)
- **Parameters**: layerId (string), style (object with color/opacity)
- **Returns**: void
- **Behavior**: Updates layer visual properties

## Event Management

### addEvents(layerId, events)
- **Parameters**: layerId (string), events (Event[])
- **Returns**: void
- **Behavior**: Adds events to the layer (validates against schema)

### removeEvents(layerId, eventIds)
- **Parameters**: layerId (string), eventIds (string[])
- **Returns**: void
- **Behavior**: Removes specified events

### updateEvents(layerId, events)
- **Parameters**: layerId (string), events (Event[])
- **Returns**: void
- **Behavior**: Replaces all events in the layer

## Navigation

### setZoomLevel(level)
- **Parameters**: level (number, 1-9)
- **Returns**: void
- **Behavior**: Changes zoom level

### navigateToTime(date)
- **Parameters**: date (Date/DateTime)
- **Returns**: void
- **Behavior**: Navigates to the specified time

### fitToLayer(layerId)
- **Parameters**: layerId (string)
- **Returns**: void
- **Behavior**: Auto-zooms to show all events in the layer
```

## Web Implementation (JavaScript)

### Core API

**web/js/api/circaevum-gl.js:**
```javascript
import { validateEvent, validateLayer } from '../utils/schema-validator.js';
import { EventRenderer } from '../renderers/event-renderer.js';
import { SceneCore } from '../core/scene-core.js';

class CircaevumGL {
  constructor(container, options = {}) {
    if (!container) {
      throw new Error('Container element is required');
    }

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

    // Initialize event renderer
    EventRenderer.init({
      scene: this.scene,
      sceneContentGroup: this.sceneContentGroup
    });

    // Internal state
    this.layers = new Map();
    this.events = new Map();
    this._layerObjects = new Map();
  }

  addLayer(layerId, config = {}) {
    // Validate against schema
    const validated = validateLayer({ id: layerId, ...config });
    
    const layerConfig = {
      id: layerId,
      name: validated.name || layerId,
      source: validated.source || 'manual',
      color: validated.color || '#ffffff',
      visible: validated.visible !== false,
      opacity: validated.opacity !== undefined ? validated.opacity : 1.0,
      filter: validated.filter || null
    };

    this.layers.set(layerId, layerConfig);
    this.events.set(layerId, []);
    this._renderLayer(layerId);
  }

  addEvents(layerId, events) {
    if (!this.layers.has(layerId)) {
      this.addLayer(layerId);
    }

    // Validate each event against schema
    const validatedEvents = events.map(event => validateEvent(event));
    
    const existingEvents = this.events.get(layerId) || [];
    const eventMap = new Map();
    
    // Merge events (avoid duplicates)
    existingEvents.forEach(e => eventMap.set(e.id, e));
    validatedEvents.forEach(e => eventMap.set(e.id, e));

    this.events.set(layerId, Array.from(eventMap.values()));
    this._renderLayer(layerId);
  }

  _renderLayer(layerId) {
    const layer = this.layers.get(layerId);
    if (!layer || !layer.visible) {
      this._removeLayerObjects(layerId);
      return;
    }

    const events = this.events.get(layerId) || [];
    let filteredEvents = events;

    // Apply filter if present
    if (layer.filter) {
      filteredEvents = this._applyFilter(events, layer.filter);
    }

    // Remove existing objects
    this._removeLayerObjects(layerId);

    // Create event objects
    const objects = EventRenderer.createEventObjects(
      filteredEvents,
      layer,
      this.sceneContentGroup
    );

    this._layerObjects.set(layerId, objects);
  }

  // ... rest of API methods
}

export default CircaevumGL;
```

### Schema Validator

**web/js/utils/schema-validator.js:**
```javascript
import eventSchema from '../../../spec/schemas/event.schema.json';
import layerSchema from '../../../spec/schemas/layer.schema.json';
import Ajv from 'ajv';

const ajv = new Ajv();
const validateEvent = ajv.compile(eventSchema);
const validateLayer = ajv.compile(layerSchema);

export function validateEvent(data) {
  const valid = validateEvent(data);
  if (!valid) {
    throw new Error(`Invalid event: ${validateEvent.errors.map(e => e.message).join(', ')}`);
  }
  return data;
}

export function validateLayer(data) {
  const valid = validateLayer(data);
  if (!valid) {
    throw new Error(`Invalid layer: ${validateLayer.errors.map(e => e.message).join(', ')}`);
  }
  return data;
}
```

## Unity Implementation (C#)

### Core API

**unity/Assets/Circaevum/API/CircaevumGL.cs:**
```csharp
using System;
using System.Collections.Generic;
using UnityEngine;
using Newtonsoft.Json;
using Newtonsoft.Json.Schema;

namespace Circaevum
{
    public class CircaevumGL
    {
        private GameObject container;
        private Options options;
        private SceneCore sceneCore;
        private EventRenderer eventRenderer;
        
        private Dictionary<string, LayerConfig> layers;
        private Dictionary<string, List<Event>> events;
        private Dictionary<string, List<GameObject>> layerObjects;

        public CircaevumGL(GameObject container, Options options = null)
        {
            if (container == null)
            {
                throw new ArgumentException("Container GameObject is required");
            }

            this.container = container;
            this.options = options ?? new Options
            {
                ZoomLevel = 2,
                LightMode = false
            };

            // Initialize scene
            this.sceneCore = new SceneCore();
            sceneCore.InitScene(container, new SceneOptions
            {
                BackgroundColor = options?.BackgroundColor ?? new Color(0, 0.031f, 0.078f)
            });

            // Initialize event renderer
            this.eventRenderer = new EventRenderer();
            eventRenderer.Init(sceneCore);

            // Internal state
            this.layers = new Dictionary<string, LayerConfig>();
            this.events = new Dictionary<string, List<Event>>();
            this.layerObjects = new Dictionary<string, List<GameObject>>();
        }

        public void AddLayer(string layerId, LayerConfig config = null)
        {
            // Validate against schema
            var validated = SchemaValidator.ValidateLayer(new { id = layerId, config });

            var layerConfig = new LayerConfig
            {
                Id = layerId,
                Name = validated.name ?? layerId,
                Source = validated.source ?? "manual",
                Color = validated.color ?? Color.white,
                Visible = validated.visible ?? true,
                Opacity = validated.opacity ?? 1.0f,
                Filter = validated.filter
            };

            layers[layerId] = layerConfig;
            events[layerId] = new List<Event>();
            RenderLayer(layerId);
        }

        public void AddEvents(string layerId, Event[] events)
        {
            if (!layers.ContainsKey(layerId))
            {
                AddLayer(layerId);
            }

            // Validate each event against schema
            var validatedEvents = new List<Event>();
            foreach (var evt in events)
            {
                var validated = SchemaValidator.ValidateEvent(evt);
                validatedEvents.Add(validated);
            }

            // Merge events (avoid duplicates)
            var existingEvents = this.events[layerId];
            var eventDict = new Dictionary<string, Event>();
            
            foreach (var e in existingEvents)
            {
                eventDict[e.Id] = e;
            }
            foreach (var e in validatedEvents)
            {
                eventDict[e.Id] = e;
            }

            this.events[layerId] = new List<Event>(eventDict.Values);
            RenderLayer(layerId);
        }

        private void RenderLayer(string layerId)
        {
            if (!layers.ContainsKey(layerId) || !layers[layerId].Visible)
            {
                RemoveLayerObjects(layerId);
                return;
            }

            var layer = layers[layerId];
            var layerEvents = events.ContainsKey(layerId) ? events[layerId] : new List<Event>();
            var filteredEvents = layerEvents;

            // Apply filter if present
            if (layer.Filter != null)
            {
                filteredEvents = ApplyFilter(layerEvents, layer.Filter);
            }

            // Remove existing objects
            RemoveLayerObjects(layerId);

            // Create event objects
            var objects = eventRenderer.CreateEventObjects(
                filteredEvents,
                layer,
                sceneCore.SceneContentGroup
            );

            layerObjects[layerId] = objects;
        }

        // ... rest of API methods
    }
}
```

### Schema Validator (C#)

**unity/Assets/Circaevum/Utils/SchemaValidator.cs:**
```csharp
using System;
using Newtonsoft.Json;
using Newtonsoft.Json.Schema;
using Newtonsoft.Json.Linq;

namespace Circaevum
{
    public static class SchemaValidator
    {
        private static JSchema eventSchema;
        private static JSchema layerSchema;

        static SchemaValidator()
        {
            // Load schemas from Resources or embedded
            var eventSchemaJson = Resources.Load<TextAsset>("Schemas/event.schema").text;
            var layerSchemaJson = Resources.Load<TextAsset>("Schemas/layer.schema").text;
            
            eventSchema = JSchema.Parse(eventSchemaJson);
            layerSchema = JSchema.Parse(layerSchemaJson);
        }

        public static Event ValidateEvent(object data)
        {
            var json = JObject.FromObject(data);
            if (!json.IsValid(eventSchema, out IList<string> errors))
            {
                throw new ArgumentException($"Invalid event: {string.Join(", ", errors)}");
            }
            return json.ToObject<Event>();
        }

        public static dynamic ValidateLayer(object data)
        {
            var json = JObject.FromObject(data);
            if (!json.IsValid(layerSchema, out IList<string> errors))
            {
                throw new ArgumentException($"Invalid layer: {string.Join(", ", errors)}");
            }
            return json;
        }
    }
}
```

## Data Synchronization via Nakama

### Web: Fetch and Display

```typescript
// In React component
import { useAuth } from '@/contexts/auth-context';
import { useCalendar } from '@/contexts/calendar-context';

function CircaevumView() {
  const { client, session } = useAuth();
  const { integrations } = useCalendar();
  const glRef = useRef<CircaevumGL>(null);

  useEffect(() => {
    if (!client || !session) return;

    // Fetch events from Nakama
    const fetchEvents = async () => {
      const result = await client.readStorageObjects(session, {
        collection: 'events'
      });

      // Group by layer
      const eventsByLayer = new Map();
      result.objects.forEach(obj => {
        const event = JSON.parse(obj.value);
        const layerId = event.layerId;
        if (!eventsByLayer.has(layerId)) {
          eventsByLayer.set(layerId, []);
        }
        eventsByLayer.get(layerId).push(event);
      });

      // Add to GL
      eventsByLayer.forEach((events, layerId) => {
        glRef.current?.addEvents(layerId, events);
      });
    };

    fetchEvents();
  }, [client, session]);

  return <div ref={containerRef} />;
}
```

### Unity: Fetch and Display

```csharp
// In Unity MonoBehaviour
using Circaevum;
using Nakama;

public class CircaevumController : MonoBehaviour
{
    private CircaevumGL gl;
    private IClient nakamaClient;
    private ISession nakamaSession;

    async void Start()
    {
        // Initialize GL
        gl = new CircaevumGL(gameObject);

        // Fetch events from Nakama
        await FetchEventsFromNakama();
    }

    private async System.Threading.Tasks.Task FetchEventsFromNakama()
    {
        var result = await nakamaClient.ReadStorageObjectsAsync(nakamaSession, new[]
        {
            new StorageObjectId { Collection = "events" }
        });

        // Group by layer
        var eventsByLayer = new Dictionary<string, List<Event>>();
        foreach (var obj in result.Objects)
        {
            var evt = JsonConvert.DeserializeObject<Event>(obj.Value);
            if (!eventsByLayer.ContainsKey(evt.LayerId))
            {
                eventsByLayer[evt.LayerId] = new List<Event>();
            }
            eventsByLayer[evt.LayerId].Add(evt);
        }

        // Add to GL
        foreach (var kvp in eventsByLayer)
        {
            gl.AddEvents(kvp.Key, kvp.Value.ToArray());
        }
    }
}
```

## Benefits of This Approach

1. **Platform Optimization**: Each implementation uses native APIs
2. **Type Safety**: C# gets compile-time checks, JS gets runtime validation
3. **Shared Logic**: Algorithms documented, can be verified for parity
4. **Independent Evolution**: Can add platform-specific features
5. **Easy Testing**: Test each platform independently
6. **Clear Contracts**: Schema ensures data compatibility

## Maintaining Feature Parity

### Checklist for New Features

1. ✅ Update shared schema
2. ✅ Update API contract
3. ✅ Implement in JavaScript
4. ✅ Implement in C#
5. ✅ Test cross-platform sync
6. ✅ Update documentation

### Versioning

Use semantic versioning:
- **Major**: Breaking API changes
- **Minor**: New features (both platforms)
- **Patch**: Bug fixes

Both platforms should stay on same major version.

## Next Steps

1. Create `spec/` directory with schemas
2. Set up schema validation in both platforms
3. Refactor web code to use schemas
4. Create Unity API matching web API
5. Test with real Nakama data
6. Document any platform-specific differences
