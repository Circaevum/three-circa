# Circaevum — Planetary Time

Circaevum is an open-source **3D time visualization** (Graphics Library / GL). Time flows upward; Earth's orbit maps dates to horizontal position. Calendar events render as arcs on a circadian timeline. WebXR supported on HTTPS and localhost.

## Quick links

| Resource | URL |
|----------|-----|
| Interactive viewer | https://circaevum.com/ |
| Developers & agents | https://circaevum.com/developers.html |
| For agents (markdown) | https://circaevum.com/docs/FOR-AGENTS.md |
| Embed / viewer mode | https://circaevum.com/index.html?viewer=1 |
| Public API reference | https://circaevum.com/API.md |
| Viewer + iframe wrapper | https://circaevum.com/docs/VIEWER-AND-WRAPPER.md |
| LLM site map | https://circaevum.com/llms.txt |
| GitHub (three-circa) | https://github.com/Circaevum/three-circa |
| Account app (login, sync) | https://app.circaevum.com/ |

## For integrators

The GL is **auth-free**. Hosts with a logged-in backend push events via `postMessage` (`CIRCAEVUM_INGEST_EVENTS`, etc.) or call `window.getGL()` after load. See `circaevum/js/api/circaevum-gl.js` in the repo.

## Keyboard (2D)

- **W / S** — zoom in / out  
- **A / D** — step time earlier / later  
- **Shift** (at sky zoom) — show timeseries arcs (e.g. Garmin HR)

## License

See [THIRD_PARTY_NOTICES.md](https://circaevum.com/THIRD_PARTY_NOTICES.md) and the [three-circa](https://github.com/Circaevum/three-circa) repository.
