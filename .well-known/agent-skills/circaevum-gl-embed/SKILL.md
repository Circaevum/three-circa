# Circaevum GL embed API

Use when integrating the Circaevum Graphics Library in an iframe or calling it from a host app — **with your own auth** or as a reference for the Yin-portal wrapper.

## Path A — GL + your auth (default for this skill)

The GL does **not** require Circaevum login or Nakama.

1. Embed viewer (below).
2. Authenticate in **your** app.
3. Push events via `postMessage` or `getGL().ingestEvents`.

OAuth discovery on circaevum.com is for Circaevum accounts only — **ignore** if you bring your own backend.

Integration paths: https://circaevum.com/docs/FOR-AGENTS.md#integration-paths-pick-what-you-need

## Viewer URL

Load the GL with embed mode:

```
https://circaevum.com/index.html?viewer=1
```

Optional query params: `skipIntro=1`, `present=1`, public calendar bundles — see `docs/VIEWER-AND-WRAPPER.md`.

Self-host: clone https://github.com/Circaevum/three-circa and serve static files; same API.

## postMessage (host → GL)

| type | payload |
|------|---------|
| `CIRCAEVUM_INGEST_EVENTS` | `{ layerId, events, options? }` |
| `CIRCAEVUM_CLEAR_EVENTS` | `{ layerId }` |
| `CIRCAEVUM_FIT_VIEW` | `{ focus, zoom }` |
| `CIRCAEVUM_OPEN_EVENT_LIST` | — |

Wait for `CIRCAEVUM_READY` from the iframe before sending.

## JavaScript API

After load, the iframe exposes (via `circaevum-gl.js`):

- `addEvents(events, layerId)`
- `ingestEvents(layerId, events, options)`
- `clearEvents(layerId)`

Full reference: https://circaevum.com/API.md

## Source

https://github.com/Circaevum/three-circa — `circaevum/js/api/circaevum-gl.js`, `circaevum/js/ui/embed-api.js`
