# WebXR Mode Features

This document describes the WebXR/VR mode implementation for Circaevum.

## Features

### Camera Positioning
- **Initial Position**: User starts 5 meters back from the scene at eye level (1.6m)
- **Scene Positioning**: The entire scene is positioned so the current time view is at a comfortable viewing height
- **No Center Immersion**: User is positioned outside the scene for better overview, not inside the solar system

### Controller Input (Quest Controllers)

#### Left Controller
- **Thumbstick**: WASD-like movement
  - Forward/Back: Move closer to or further from the scene
  - Left/Right: Strafe left and right
  - Movement is relative to where you're looking

#### Right Controller  
- **Thumbstick**: Rotation
  - Left/Right: Rotate your view around the scene
  - Smooth rotation for comfortable navigation

### Movement Controls
- **Move Speed**: 2.0 meters per second (configurable via `xrMoveSpeed`)
- **Rotation Speed**: 1.0 radians per second (configurable via `xrRotationSpeed`)
- **Dead Zone**: 0.1 - small thumbstick movements are ignored to prevent drift

## Technical Implementation

### Scene Group
All scene content (planets, worldlines, stars, etc.) is contained in a `sceneContentGroup` that can be positioned and rotated as a unit. This allows:
- Moving the entire scene relative to the user
- Maintaining scene relationships while repositioning
- Easy reset when exiting VR

### Controller Setup
- Controllers are automatically detected when connected
- Visual representation: Left controller = green line, Right controller = blue line
- Input is polled every frame in the `animate()` function

### Positioning Logic
The scene is positioned using inverse movement - when the user moves forward, the scene moves backward relative to them. This creates a natural "walking through space" feeling.

## Testing

1. Start HTTPS server: `node https-server.js 8443`
2. Access from Quest: `https://YOUR_IP:8443`
3. Click "WEBXR" button
4. Use left controller thumbstick to move, right controller thumbstick to rotate

## Future Enhancements

- Teleportation for faster navigation
- Hand tracking support
- Grab and manipulate time markers
- Scale adjustment (zoom in/out)
- Reset position button
