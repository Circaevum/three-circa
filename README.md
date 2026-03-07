# Circaevum Graphics Library (Web)

3D time visualization for Circaevum—planetary orbits, worldlines, event rendering. This is the web/Three.js build. Use it standalone (e.g. [circaevum.com](https://circaevum.com)) or embed it via the wrapper (e.g. [app.circaevum.com](https://app.circaevum.com)).

## How time becomes space

The GL maps **timestamps to 3D coordinates** so you can see and navigate time as geometry:

- **Height (Y) = time.** Time flows upward. One year = 100 scene units; the year 2000 is the reference. A date’s height is `(year − 2000) × 100` plus progress through the year (months, days, hours).
- **Orbital angle (XZ plane).** From the same date we compute where Earth is in its orbit (e.g. vernal equinox = 0). Position in the horizontal plane is `x = cos(angle) × radius`, `z = sin(angle) × radius`.
- So each moment has a unique **(x, y, z)**: horizontal position = place in the year’s orbit, vertical = place in multi-year time.

**Worldlines** are the paths bodies take through this space-time. Each planet follows a **helical worldline**—a spiral that combines (1) orbital motion around the Sun in the XZ plane and (2) motion upward along Y as time advances. Earth’s worldline is the reference; events are drawn as arcs at slightly larger radii, parallel to Earth’s path.

**Circadian rhythm** is the ~24-hour biological cycle of day and night. The GL ties this to the same model: at day/clock zoom levels you can show a **circadian worldline**—the helix traced by a “hour hand” from Earth as it rotates while moving along its orbital path. So the daily cycle (noon/midnight, wake/sleep) appears as a spiral in the same space where years and orbits are already visible: one continuous, navigable space-time.

## What’s here

- **`index.html`** — Single entry: full GL, viewer mode with `?viewer=1` or in an iframe. Navbar has Log in (→ app) and Event List.
- **`circaevum/`** — Core GL: styles, JS (main, renderers, adapters, pipeline). No account/Nakama in this repo; login lives in the wrapper.
- **`docs/`** — [VIEWER-AND-WRAPPER.md](./docs/VIEWER-AND-WRAPPER.md), [NAKAMA-CONNECT.md](./docs/NAKAMA-CONNECT.md) (for backend wiring when needed).

## Run locally

Serve this folder (e.g. port 8080) so the wrapper can load it:

```bash
npx serve . -p 8080
```

Open `http://localhost:8080` for the GL with navbar, or use the wrapper’s `npm run dev:all` from `yang/account-wrapper` to run GL + wrapper together.

## WebXR (VR / AR)

The GL can run in **WebXR** as a “windowed” view: the 3D scene is drawn on a floating panel in front of you (render-to-texture). Zoom and time are controlled by the same 2D logic; the XR slider in the side panel adjusts zoom.

- **Passthrough (see-through):** On devices that support **immersive-ar** (e.g. many Android AR browsers), the area around the window can be passthrough. On **Apple Vision Pro**, Safari currently only supports **immersive-vr** (opaque). The session’s `environmentBlendMode` is then `opaque`, so the background cannot be see-through; the app uses a dark room background instead of black.
- **“Windowed app” on Vision Pro:** The system’s own “windowed” experience is the Safari window (the webpage) in your space. When you tap “Enter WebXR”, the app goes full VR and shows the GL on a floating quad inside that VR space. True passthrough would require Safari to support the WebXR AR module on visionOS (not yet available).

**References:**

- [WebXR AR Module (environmentBlendMode)](https://immersive-web.github.io/webxr-ar-module/) — how passthrough vs opaque is defined.
- [immersive-web/webxr-samples](https://immersive-web.github.io/webxr-samples/) — official samples (e.g. [immersive-ar-session](https://immersive-web.github.io/webxr-samples/immersive-ar-session.html), [ar-barebones](https://immersive-web.github.io/webxr-samples/ar-barebones.html)).
- [Google ARCore: Hello WebXR](https://developers.google.com/ar/develop/webxr/hello-webxr) — minimal AR setup with Three.js.

## Changelog

[CHANGELOG.md](./CHANGELOG.md) — version and feature history.

---

For project structure, DAO, and coordination (Zhong), see the main Circaevum org and [circaevum-dao-phase-1](https://github.com/Circaevum/circaevum-dao-phase-1).
