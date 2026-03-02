# XR Integration Guide

## Quick Start

The new XR adapter system has been created. To integrate it into your existing code:

### 1. Update HTML to Load XR Adapters

Add to `index.html` before `main.js`:

```html
<!-- XR Adapters -->
<script src="circaevum/js/adapters/xr/webxr-adapter.js"></script>
<script src="circaevum/js/adapters/input/xr-input.js"></script>
```

### 2. Update main.js to Use XR Adapter

Replace the existing `toggleWebXR()` function with:

```javascript
// Global XR adapter instance
let xrAdapter = null;
let xrInputAdapter = null;

function toggleWebXR() {
    const button = document.getElementById('webxr-toggle');
    
    if (xrAdapter && xrAdapter.isPresenting()) {
        // Exit XR
        xrAdapter.exitXR();
        if (xrInputAdapter) {
            xrInputAdapter.cleanup();
        }
        button.classList.remove('active');
        button.textContent = 'WEBXR';
    } else {
        // Enter XR
        if (!xrAdapter) {
            xrAdapter = new WebXRAdapter(scene, camera, renderer, sceneContentGroup);
        }
        
        xrAdapter.enterXR('immersive-vr').then((session) => {
            button.classList.add('active');
            button.textContent = 'EXIT VR';
            
            // Initialize XR input
            if (!xrInputAdapter) {
                xrInputAdapter = new XRInputAdapter(xrAdapter, {
                    currentZoom: currentZoom,
                    setZoomLevel: (zoom) => {
                        currentZoom = zoom;
                        createPlanets(currentZoom);
                    }
                });
            }
            xrInputAdapter.init(session);
            
        }).catch((error) => {
            console.error('Failed to enter XR:', error);
            alert('Failed to enter VR mode. Make sure your headset is connected.');
        });
    }
}
```

### 3. Update Animation Loop

In the `animate()` function, replace XR input handling:

```javascript
function animate(time, frame) {
    // ... existing code ...
    
    // Handle XR input if in XR mode
    if (xrAdapter && xrAdapter.isPresenting() && frame) {
        if (xrInputAdapter) {
            xrInputAdapter.handleInput(frame);
        }
    }
    
    // ... rest of animation code ...
}
```

### 4. Initialize XR Adapter on Load

In `initControls()`, update WebXR button setup:

```javascript
// WebXR toggle
const webxrToggle = document.getElementById('webxr-toggle');
if (webxrToggle) {
    webxrToggle.style.display = 'none';
    
    // Check if WebXR is supported using adapter
    if (typeof WebXRAdapter !== 'undefined') {
        xrAdapter = new WebXRAdapter(scene, camera, renderer, sceneContentGroup);
        xrAdapter.isSupported().then((supported) => {
            if (supported) {
                webxrToggle.style.display = 'block';
                webxrToggle.addEventListener('click', toggleWebXR);
                console.log('WebXR: Supported - button enabled');
            }
        });
    }
}
```

## Benefits

1. **Better Scene Visibility**: Improved scaling and positioning ensures planets/worldlines are visible
2. **XR Controls**: Zoom level and time selection via controllers
3. **Modular Design**: Easy to add other XR systems (OpenXR, etc.)
4. **Separation of Concerns**: XR code separate from core graphics

## Next Steps

1. **Create XR UI System**: Floating panels for zoom/time controls in VR
2. **Extract Core Graphics**: Move planet/worldline rendering to separate modules
3. **Add Hand Tracking**: Support for hand tracking input
4. **Test with Multiple Headsets**: Verify compatibility across devices

## Troubleshooting

### Planets Not Visible in XR

If planets still aren't visible:
1. Check console for "Scene content group has X children" - should be > 0
2. Verify `sceneContentGroup` is passed to adapter
3. Try adjusting `scaleFactor` in `webxr-adapter.js` (increase if too small)

### Controllers Not Working

1. Check browser console for "Left/Right controller connected" messages
2. Verify gamepad API is supported
3. Test button presses in console: `xrInputAdapter.handleButtonInput(...)`

### Scene Position Wrong

Adjust in `webxr-adapter.js`:
- `eyeLevel`: Height of user's eyes (default 1.6m)
- `viewingDistance`: Distance from scene (default -6.0m)
- `scaleFactor`: Scene scale (default 0.002)
