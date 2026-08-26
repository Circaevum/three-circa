# Recreate Circaevum GL — human readable guide

This is the minimal path to rebuild the viewer from scratch without reading 27k lines.

## 1. What it is

- **Time = Y.** `HEIGHT_PER_YEAR = 100` world units. `calculateDateHeight(y,m,d,h)` → `y` in `[2000,2100]` maps to Y.
- **Orbit = XZ.** `SceneGeometry.getAngle(height, currentHeight)` gives Earth's orbital angle, `getPosition3D(height, angle, distance)` gives planet position on helix. Earth `distance=50`, `PLANET_DATA` in `circaevum/js/config.js`.
- **Zoom = camera ladder.** `ZOOM_LEVELS[0..9]` in `config.js` (MOMENT → CLOCK). Controls `distance`, `height`, `timeYears` visible. Navigation = change `currentZoom` + `selectedDate`.
- **Data = VEVENTs.** `circaevum/js/models/vevent.js` → `{uid, dtstart, dtend, summary, category, render}`. `category` → layer `layerId`. Optional `render={kind:'timeseries', metric:'hr'|'sleepStage', arc:false, summary:[{tOff,v}], dense:{collection,key,id}}` → `X-CIRCAEVUM-RENDER` in ICS.
- **Ingest = postMessage.** Yin-portal owns Nakama session, pushes `CIRCAEVUM_INGEST_EVENTS {layerId, events}` into GL iframe. GL never authenticates. Bridge at `circaevum/js/ui/gl-api-bridge.js` and `embed-api.js`.

## 2. Minimal viewer skeleton

```html
<script src="three.min.js"></script>
<script src="config.js"></script>          <!-- PLANET_DATA, ZOOM_LEVELS -->
<script src="datetime.js"></script>       <!-- calculateDateHeight -->
<script src="utils/ribbon-geometry.js"></script>  <!-- RibbonGeometry.fromInnerOuter -->
<script src="core/scene-core.js"></script>       <!-- scene, camera, renderer -->
<script src="renderers/worldline-renderer.js"></script> <!-- helix worldlines -->
<script src="renderers/timemarker-renderer.js"></script> <!-- time frames -->
<script src="renderers/event-renderer.js"></script>     <!-- VEVENT → EventObject -->
<script src="main.js"></script>                     <!-- animation loop -->
```

Order matters — see `index.html:627→703`. Load `config.js` before `datetime.js` before renderers before `main.js`.

## 3. Add storage + events

1. Nakama collections: `events {uid, summary, dtstart, dtend, category}`, `layers {list, enabled}`, `garmin_daily/sleep` for timeseries.
2. From portal: `iframe.contentWindow.postMessage({type:'CIRCAEVUM_INGEST_EVENTS', layerId, events, options}, '*')`.
3. In GL: `EventRenderer.createEventObjects(events, layerConfig, sceneContentGroup, scene)` — returns `Group` with `userData.type==='EventObject'`. Check `getEventBandRadii(earthDist, durationDays)` for radial placement.

## 4. Zoom & LOD (where lag hides)

- `DENSITY_BUDGET` in `event-renderer.js:85` — per-zoom caps (CENTURY 20, MONTH 300, WEEK 80). Over budget → `createOverflowIndicatorArc` + priority sort `scoreEventPriority` (log₂-duration).
- `EVENT_TUBE_BUDGET=48` — quality `sqrt(48/n)` floor `0.34`, prefer `THREE.Line` below `0.55`. Far events `EVENT_LINE_LOD_FAR_FACTOR=2` already lines.
- Time window: `eventTouchesSelectedParentWindow` → only parent unit (±week/month) renders. WEEK uses `eventTouchesSelectedWeekWindow`, not month window.

## 5. Flatten (why text squished)

`flattenMode==='all'` lerps `currentFlattenAmount 0→1` at `main.js:11665` (`*0.08`). `applyFlattenToGroup(group, amount)` scales `group.scale.y = 1-amount`, compensates sprites via `baseScale / yScaleLocal`. Ribbon surface planes are vertex-flattened via `flattenTimelineLogicalY` in `updateEventRibbonLabelsForFlatten:731`, not group-scaled.

## 6. Add a new integration leaf

1. Copy `yin/rest/_template/leaf/` → `yin/rest/my-leaf/`
2. Register in `circaevum/spec/integrations/registry.json`
3. Allow collections in `circaevum/spec/nakama/modules/integration_ingest.lua`
4. Portal env `VITE_MY_LEAF_URL`, Yin-portal `src/my-leaf.js`

## 7. Recreate checklist

- [ ] `npx serve yang/web -p 8080` shows starfield + sun + Earth orbit
- [ ] `ZOOM_LEVELS` labels render at each W/A/S/D step
- [ ] Post a test VEVENT via `window.CircaevumGL.ingestEvents('test', [{uid:'1', dtstart:{dateTime:'2026-08-25T10:00:00Z'}, dtend:{...}, summary:'Hello', category:'test'}])` and it appears as ribbon/marker
- [ ] Timeseries: post `render:{kind:'timeseries', metric:'hr', arc:false, summary:[{tOff:0,v:70}]}` suppresses default dot, draws arc via `garmin-renderer.js` on day disk (hold Shift at DAY/CLOCK)

See `docs/COORDINATES.md` for θ₁/θ₂/z, `docs/FOR-AGENTS.md` for GL ingest contract.
