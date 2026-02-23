# Testing the Circaevum GL API

## 1. Run the app

From the repo root (or from `yang/web`), serve the app over HTTP so scripts load correctly:

```bash
# From CIR repo root:
cd yang/web && npx --yes serve -p 3000

# Or with Python:
cd yang/web && python3 -m http.server 3000
```

Then open **http://localhost:3000** in your browser. The 3D scene loads at the default zoom; no need to click anything first.

---

## 2. Test without the console: use the button

On the page there is a **"Test event lines"** button in the bottom-right corner. Click it once to add two sample line segments on the helix. The button will briefly say "Added! Use zoom 3–5 and A/D to find them." Use the zoom bar (e.g. **YEAR** or **MONTH**) and the **A** / **D** keys to move along the timeline until you see the colored lines.

---

## 3. Use the API from the browser console (optional)

Open DevTools (F12 or Cmd+Option+J), go to the **Console** tab. At the **bottom** of the Console panel there is a single line that starts with `>` — that’s where you type or paste. If you don’t see it, try dragging the top edge of the DevTools panel to make it taller, or click inside the Console tab and press Enter to focus the input line.

### Get the API instance

The first call to `sendEvent` or `sendEventLines` creates the Circaevum GL instance and attaches it to the scene. You can also create it explicitly:

```js
// Optional: create or get the API instance
const gl = window.circaevumGL || new CircaevumGL(document.getElementById('canvas-container'), { zoomLevel: 2 });
if (!window.circaevumGL) window.circaevumGL = gl;
```

### Add a layer and events (markers + worldlines)

```js
// One event (creates layer 'api' if needed)
sendEvent({
  start: new Date('2025-06-15T10:00:00'),
  end:   new Date('2025-06-16T18:00:00'),
  summary: 'Conference'
});

// Or use the API directly
const gl = window.circaevumGL;
gl.addLayer('my-calendar', { color: '#00b4d8', opacity: 0.9 });
gl.addEvents('my-calendar', [
  { uid: '1', dtstart: { dateTime: '2025-07-01T09:00:00Z' }, dtend: { dateTime: '2025-07-01T17:00:00Z' }, summary: 'Work day' }
]);
```

### Add event lines (line segments on the helix)

```js
// Helper (adds to layer 'lines' by default)
sendEventLines([
  { start: new Date('2025-01-01'), end: new Date('2025-01-07') },
  { start: new Date('2025-02-10'), end: new Date('2025-02-14') }
], 'ranges');

// Or use the API directly
gl.addLayer('ranges', { color: '#ff6b6b', opacity: 0.8 });
gl.addEventLines('ranges', [
  { start: '2025-03-01', end: '2025-03-15' }
]);
```

### Inspect and remove

```js
gl.getEventLines('ranges');        // list of { start, end }
gl.getEvents('my-calendar');       // list of events
gl.getEventObjects('my-calendar'); // descriptors for API consumers
gl.removeEventLines('ranges');     // clear all lines in layer
gl.removeEventLines('ranges', [0]); // remove first line only
gl.removeEvents('my-calendar', ['uid1']); // remove by UID
```

---

## 4. Quick visual test (via console)

1. Open http://localhost:3000 (scene loads at default zoom).
2. Either click the **Test event lines** button (bottom-right), or open the Console, click in the input line at the bottom (the `>` prompt), and paste:

```js
sendEventLines([
  { start: new Date('2025-01-01'), end: new Date('2025-01-31') },
  { start: new Date('2025-06-01'), end: new Date('2025-06-15') }
], 'test-lines');
```

3. You should see two colored line segments on the helix (around Earth’s path). Zoom to level 3 (Year) or 5 (Month) and move time (A/D) to bring them into view.
4. Clear lines (in console): `window.circaevumGL.removeEventLines('test-lines');`

---

## 5. API summary

| Method | Purpose |
|--------|--------|
| `addLayer(layerId, config)` | Add a layer (color, opacity, etc.). |
| `addEvents(layerId, events)` | Add VEVENT-like events (markers + worldlines for duration). |
| `addEvent(layerId, event)` | Add a single event. |
| `addEventLines(layerId, lines)` | Add line segments; each `{ start, end }` (Date or string). |
| `getEvents(layerId)` | Get events for a layer. |
| `getEventLines(layerId)` | Get event lines for a layer. |
| `getEventObjects(layerId)` | Get event descriptors (uid, summary, start, end). |
| `removeEvents(layerId, uids)` | Remove events by UID(s). |
| `removeEventLines(layerId, indices?)` | Remove all lines or by index. |
| `setLayerVisibility(layerId, visible)` | Show/hide a layer. |
| `updateLayerStyle(layerId, style)` | Change color, opacity, etc. |

Events and event lines use the same helix geometry; lines are drawn with the layer’s color and opacity.

---

## Troubleshooting

- **`SceneGeometry.createHelicalCurve: Invalid input parameters`**  
  This used to appear when event lines (or duration events) were drawn before the app’s time state was ready, so height values were NaN. The event renderer now coerces heights to valid numbers and falls back to a simple two-point segment if the helical curve fails, so this error should no longer appear. If it does, it may be from another part of the app (e.g. time markers); ensure the scene has finished loading before calling `addEventLines` or `addEvents`.

- **WebXR: Not supported**  
  Normal on many devices; the app runs without XR.

- **404 favicon**  
  Harmless; you can add a `favicon.ico` to the project root if you want to clear it.
