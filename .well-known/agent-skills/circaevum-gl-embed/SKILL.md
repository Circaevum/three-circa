# Circaevum GL embed API

Use when integrating the Circaevum Graphics Library in an iframe or calling it from a host app (Yin-portal, custom wrapper).

## Viewer URL

Load the GL with embed mode:

```
https://circaevum.com/index.html?viewer=1
```

Optional query params: `skipIntro=1`, `present=1`, public calendar bundles — see `docs/VIEWER-AND-WRAPPER.md`.

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
