# React Integration Guide

## React Wrapper Component

This shows how to wrap Circaevum GL in a React component for use in your management app.

```typescript
// src/components/CircaevumView.tsx

'use client';

import { useEffect, useRef, forwardRef, useImperativeHandle, useState } from 'react';
import { useLayers } from '@/contexts/layers-context';

// Import Circaevum GL (will be loaded as a script or bundled)
declare global {
  interface Window {
    CircaevumGL: any;
  }
}

interface CircaevumViewProps {
  className?: string;
  zoomLevel?: number;
  lightMode?: boolean;
  onEventClick?: (event: any) => void;
  onTimeChange?: (date: Date) => void;
  onZoomChange?: (level: number) => void;
}

export interface CircaevumViewRef {
  gl: any; // CircaevumGL instance
  fitToLayer: (layerId: string) => void;
  fitToLayers: (layerIds: string[]) => void;
  navigateToTime: (date: Date) => void;
  setZoomLevel: (level: number) => void;
}

export const CircaevumView = forwardRef<CircaevumViewRef, CircaevumViewProps>(
  ({ 
    className = '', 
    zoomLevel = 2,
    lightMode = false,
    onEventClick,
    onTimeChange,
    onZoomChange
  }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const glRef = useRef<any>(null);
    const { layers } = useLayers();
    const [isInitialized, setIsInitialized] = useState(false);

    // Initialize Circaevum GL
    useEffect(() => {
      if (!containerRef.current) return;
      if (typeof window.CircaevumGL === 'undefined') {
        console.error('CircaevumGL not loaded. Make sure to include the script.');
        return;
      }

      try {
        glRef.current = new window.CircaevumGL(containerRef.current, {
          zoomLevel,
          lightMode,
        });

        // Set up event handlers
        if (onEventClick) {
          glRef.current.on('eventClick', onEventClick);
        }
        if (onTimeChange) {
          glRef.current.on('timeChange', onTimeChange);
        }
        if (onZoomChange) {
          glRef.current.on('zoomChanged', (data: any) => {
            onZoomChange(data.level);
          });
        }

        setIsInitialized(true);

        return () => {
          if (glRef.current) {
            glRef.current.destroy();
            glRef.current = null;
          }
        };
      } catch (error) {
        console.error('Failed to initialize Circaevum GL:', error);
      }
    }, []);

    // Update zoom level when prop changes
    useEffect(() => {
      if (glRef.current && isInitialized) {
        glRef.current.setZoomLevel(zoomLevel);
      }
    }, [zoomLevel, isInitialized]);

    // Sync layers with GL
    useEffect(() => {
      if (!glRef.current || !isInitialized) return;

      // Get current layers in GL
      const glLayerIds = glRef.current.getLayerIds();

      // Add/update layers
      layers.forEach((layer) => {
        if (!glRef.current.hasLayer(layer.id)) {
          glRef.current.addLayer(layer.id, {
            name: layer.name,
            color: layer.color,
            visible: layer.visible,
            opacity: layer.opacity || 1.0,
          });
        }

        // Update layer style
        glRef.current.updateLayerStyle(layer.id, {
          color: layer.color,
          visible: layer.visible,
          opacity: layer.opacity || 1.0,
        });

        // Update events
        if (layer.events && layer.events.length > 0) {
          glRef.current.addEvents(layer.id, layer.events);
        }
      });

      // Remove layers that no longer exist
      glLayerIds.forEach((layerId: string) => {
        if (!layers.find(l => l.id === layerId)) {
          glRef.current.removeLayer(layerId);
        }
      });
    }, [layers, isInitialized]);

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      gl: glRef.current,
      fitToLayer: (layerId: string) => {
        glRef.current?.fitToLayer(layerId);
      },
      fitToLayers: (layerIds: string[]) => {
        glRef.current?.fitToLayers(layerIds);
      },
      navigateToTime: (date: Date) => {
        glRef.current?.navigateToTime(date);
      },
      setZoomLevel: (level: number) => {
        glRef.current?.setZoomLevel(level);
      },
    }));

    return (
      <div 
        ref={containerRef} 
        className={`circaevum-view ${className}`}
        style={{ width: '100%', height: '100%' }}
      />
    );
  }
);

CircaevumView.displayName = 'CircaevumView';
```

## Layer Context

```typescript
// src/contexts/layers-context.tsx

'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export interface Event {
  id: string;
  title: string;
  startTime: Date;
  endTime?: Date;
  color?: string;
  type?: string;
  [key: string]: any;
}

export interface Layer {
  id: string;
  name: string;
  source: 'google' | 'outlook' | 'garmin' | 'chase' | 'manual' | 'csv' | 'json';
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
  addEventsToLayer: (layerId: string, events: Event[]) => void;
}

const LayersContext = createContext<LayersContextValue | undefined>(undefined);

export function LayersProvider({ children }: { children: ReactNode }) {
  const [layers, setLayers] = useState<Layer[]>([]);

  const addLayer = useCallback((layer: Layer) => {
    setLayers(prev => {
      if (prev.find(l => l.id === layer.id)) {
        console.warn(`Layer ${layer.id} already exists`);
        return prev;
      }
      return [...prev, layer];
    });
  }, []);

  const removeLayer = useCallback((id: string) => {
    setLayers(prev => prev.filter(l => l.id !== id));
  }, []);

  const updateLayer = useCallback((id: string, updates: Partial<Layer>) => {
    setLayers(prev => 
      prev.map(l => l.id === id ? { ...l, ...updates } : l)
    );
  }, []);

  const toggleLayerVisibility = useCallback((id: string) => {
    setLayers(prev => 
      prev.map(l => l.id === id ? { ...l, visible: !l.visible } : l)
    );
  }, []);

  const setLayerColor = useCallback((id: string, color: string) => {
    updateLayer(id, { color });
  }, [updateLayer]);

  const setLayerFilter = useCallback((id: string, filter: Layer['filter']) => {
    updateLayer(id, { filter });
  }, [updateLayer]);

  const addEventsToLayer = useCallback((layerId: string, events: Event[]) => {
    setLayers(prev => 
      prev.map(l => {
        if (l.id === layerId) {
          // Merge events, avoiding duplicates
          const existingIds = new Set(l.events.map(e => e.id));
          const newEvents = events.filter(e => !existingIds.has(e.id));
          return { ...l, events: [...l.events, ...newEvents] };
        }
        return l;
      })
    );
  }, []);

  return (
    <LayersContext.Provider
      value={{
        layers,
        addLayer,
        removeLayer,
        updateLayer,
        toggleLayerVisibility,
        setLayerColor,
        setLayerFilter,
        addEventsToLayer,
      }}
    >
      {children}
    </LayersContext.Provider>
  );
}

export function useLayers() {
  const context = useContext(LayersContext);
  if (context === undefined) {
    throw new Error('useLayers must be used within a LayersProvider');
  }
  return context;
}
```

## Layer Panel Component

```typescript
// src/components/LayerPanel.tsx

'use client';

import { useLayers } from '@/contexts/layers-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff, Palette, ZoomIn, Trash2 } from 'lucide-react';
import { ColorPicker } from '@/components/ui/color-picker';
import { useRef } from 'react';
import type { CircaevumViewRef } from './CircaevumView';

export function LayerPanel() {
  const { layers, toggleLayerVisibility, updateLayer, removeLayer, setLayerColor } = useLayers();
  const circaevumRef = useRef<CircaevumViewRef>(null);

  const handleFitToLayer = (layerId: string) => {
    circaevumRef.current?.fitToLayer(layerId);
  };

  return (
    <div className="layer-panel space-y-4">
      <h2 className="text-lg font-semibold">Layers</h2>
      
      {layers.map((layer) => (
        <Card key={layer.id} className={layer.visible ? '' : 'opacity-60'}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: layer.color }}
                />
                <CardTitle className="text-sm">{layer.name}</CardTitle>
              </div>
              <Switch
                checked={layer.visible}
                onCheckedChange={() => toggleLayerVisibility(layer.id)}
              />
            </div>
            <CardDescription>
              {layer.source.toUpperCase()} • {layer.events.length} events
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const newColor = prompt('Enter hex color:', layer.color);
                  if (newColor) setLayerColor(layer.id, newColor);
                }}
              >
                <Palette className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleFitToLayer(layer.id)}
              >
                <ZoomIn className="h-4 w-4" />
                Fit
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => removeLayer(layer.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

## Main App Integration

```typescript
// src/app/page.tsx or src/App.tsx

'use client';

import { LayersProvider } from '@/contexts/layers-context';
import { CircaevumView } from '@/components/CircaevumView';
import { LayerPanel } from '@/components/LayerPanel';
import { AccountPanel } from '@/components/AccountPanel';
import { OAuthPanel } from '@/components/OAuthPanel';
import { useEventService } from '@/hooks/use-event-service';

export default function App() {
  const eventService = useEventService();

  return (
    <LayersProvider>
      <div className="flex h-screen">
        {/* Sidebar */}
        <aside className="w-80 border-r p-4 overflow-y-auto">
          <AccountPanel />
          <div className="mt-4">
            <OAuthPanel />
          </div>
          <div className="mt-4">
            <LayerPanel />
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 relative">
          <CircaevumView className="w-full h-full" />
        </main>
      </div>
    </LayersProvider>
  );
}
```

## Loading Circaevum GL Script

In your React app, you need to load the Circaevum GL script. You can do this in several ways:

### Option 1: Script Tag (Simple)

```html
<!-- public/index.html or app/layout.tsx -->
<script src="/circaevum/js/api/circaevum-gl.js"></script>
<script src="/circaevum/js/main.js"></script>
<!-- ... other dependencies ... -->
```

### Option 2: Dynamic Import (Better)

```typescript
// src/lib/load-circaevum.ts

export async function loadCircaevumGL() {
  if (typeof window.CircaevumGL !== 'undefined') {
    return window.CircaevumGL;
  }

  // Load scripts dynamically
  await Promise.all([
    loadScript('/circaevum/js/three.min.js'),
    loadScript('/circaevum/js/config.js'),
    loadScript('/circaevum/js/datetime.js'),
    loadScript('/circaevum/js/scene-geometry.js'),
    loadScript('/circaevum/js/worldlines.js'),
    loadScript('/circaevum/js/timemarkers.js'),
    loadScript('/circaevum/js/main.js'),
    loadScript('/circaevum/js/api/circaevum-gl.js'),
  ]);

  return window.CircaevumGL;
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}
```

Then use it in your component:

```typescript
useEffect(() => {
  loadCircaevumGL().then(() => {
    // Now CircaevumGL is available
    setIsGLReady(true);
  });
}, []);
```

## Next Steps

1. Set up the React app structure
2. Create the layer context
3. Build the UI components
4. Integrate with your existing account management
5. Connect to event fetching services
