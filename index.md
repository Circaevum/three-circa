# Circaevum — Planetary Time

Circaevum is an open-source **3D time visualization** (Graphics Library / GL). Time flows upward; Earth's orbit maps dates to horizontal position. Calendar events render as arcs on a circadian timeline. WebXR supported on HTTPS and localhost.

## AI agents — start here

1. **[llms.txt](https://circaevum.com/llms.txt)** — curated site map and discovery URLs  
2. **[FOR-AGENTS.md](https://circaevum.com/docs/FOR-AGENTS.md)** — full integrator reference (embed, postMessage, optional OAuth)  
3. **[Agent Skills](https://circaevum.com/.well-known/agent-skills/index.json)** — task-specific SKILL.md files  

Human summary: [developers.html](https://circaevum.com/developers.html)

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
| OAuth discovery | https://circaevum.com/.well-known/oauth-authorization-server |
| Agent auth (auth.md) | https://circaevum.com/auth.md |
| GitHub (three-circa) | https://github.com/Circaevum/three-circa |
| Account app (login, sync) | https://app.circaevum.com/ |

## For integrators

The GL is **auth-free**. Pick an integration path in [FOR-AGENTS.md](https://circaevum.com/docs/FOR-AGENTS.md#integration-paths-pick-what-you-need):

- **Your auth:** embed `?viewer=1`, push events via `postMessage` (`CIRCAEVUM_INGEST_EVENTS`) from your backend — no Nakama required.
- **Circaevum account:** app.circaevum.com + Nakama — see [auth.md](https://circaevum.com/auth.md).

See `circaevum/js/api/circaevum-gl.js` in the repo.

## Keyboard (2D)

- **W / S** — zoom in / out  
- **A / D** — step time earlier / later  
- **Shift** (at sky zoom) — show timeseries arcs (e.g. Garmin HR)

## License

See [THIRD_PARTY_NOTICES.md](https://circaevum.com/THIRD_PARTY_NOTICES.md) and the [three-circa](https://github.com/Circaevum/three-circa) repository.
