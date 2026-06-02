# Circaevum — for developers & AI agents

**Site:** https://circaevum.com · **Human page:** https://circaevum.com/developers.html · **Markdown:** https://circaevum.com/docs/FOR-AGENTS.md

circaevum.com hosts the **Graphics Library (GL)** — auth-free 3D timeline. Login, calendars, and Garmin sync live on **https://app.circaevum.com/** (separate origin).

---

## Machine-readable discovery

| Resource | URL | Purpose |
|----------|-----|---------|
| LLM site map | [/llms.txt](https://circaevum.com/llms.txt) | Curated links for agents |
| Homepage (markdown) | [/index.md](https://circaevum.com/index.md) | Overview without HTML |
| API catalog (RFC 9727) | [/.well-known/api-catalog](https://circaevum.com/.well-known/api-catalog) | Linkset of docs & APIs |
| Agent Skills index | [/.well-known/agent-skills/index.json](https://circaevum.com/.well-known/agent-skills/index.json) | SKILL.md files for agents |
| robots.txt | [/robots.txt](https://circaevum.com/robots.txt) | Crawl policy + Content-Signal |
| Sitemap | [/sitemap.xml](https://circaevum.com/sitemap.xml) | Canonical URLs |
| Agent readiness notes | [docs/AGENT-READINESS.md](https://circaevum.com/docs/AGENT-READINESS.md) | isitagentready.com checklist |

**Scan this site:** https://isitagentready.com/circaevum.com

---

## MCP (Model Context Protocol)

**circaevum.com does not host an MCP server.** There is no `/.well-known/mcp/server-card.json` on this origin.

| What | Where |
|------|--------|
| Embed + ingest API | This doc + [API.md](../API.md) + Agent Skills below |
| Account / Nakama RPC | **app.circaevum.com** (not documented on static GL) |
| Local bio lab (OSC → CSV) | Your machine; see [OSC lab streams](#osc-lab-streams-local) |

If we add MCP later, the server card will appear under `/.well-known/mcp/`.

---

## Graphics Library — embed API

### Viewer URL

```
https://circaevum.com/index.html?viewer=1
```

Query params: `skipIntro=1`, `present=1`, public calendar bundles — see [VIEWER-AND-WRAPPER.md](./VIEWER-AND-WRAPPER.md).

### JavaScript (`circaevum-gl.js`)

After the GL loads:

```javascript
const gl = window.getGL();
gl.ingestEvents('my-layer', events, { layerStyles: {} });
gl.clearEvents('my-layer');
```

Full reference: [API.md](../API.md) · source: [circaevum/js/api/circaevum-gl.js](https://github.com/Circaevum/three-circa/blob/main/circaevum/js/api/circaevum-gl.js)

### postMessage (iframe host ↔ GL)

**GL → host**

| type | When |
|------|------|
| `CIRCAEVUM_READY` | Safe to send ingest / view commands |
| `CIRCAEVUM_THEME` | Theme changed |
| `CIRCAEVUM_ZOOM` | Zoom level changed |
| `CIRCAEVUM_EDIT_EVENT` | User asked to edit an event |

**Host → GL**

| type | Payload |
|------|---------|
| `CIRCAEVUM_INGEST_EVENTS` | `{ layerId, events, options? }` |
| `CIRCAEVUM_CLEAR_EVENTS` | `{ layerId }` |
| `CIRCAEVUM_FIT_VIEW` | `{ focus, zoom, rx?, ry? }` |
| `CIRCAEVUM_OPEN_EVENT_LIST` | — |
| `CIRCAEVUM_HIGHLIGHT_EVENT` | `{ layerId, uid }` |
| `CIRCAEVUM_DRAW_ALL_EVENTS` | — |

Implementation: [embed-api.js](https://github.com/Circaevum/three-circa/blob/main/circaevum/js/ui/embed-api.js)

### Timeseries events (Garmin-style arcs)

Events may include:

```json
{
  "render": {
    "kind": "timeseries",
    "metric": "hr",
    "arc": false,
    "summary": [{ "tOff": 0, "v": 72 }],
    "dense": { "collection": "garmin_daily", "key": "...", "id": "..." }
  }
}
```

Arcs visible at sky zoom levels while **Shift** is held. See [vevent.js](https://github.com/Circaevum/three-circa/blob/main/circaevum/js/models/vevent.js).

---

## OAuth & account API

**Not on circaevum.com.** Use the Yin-portal at **https://app.circaevum.com/** with Nakama (env `VITE_NAKAMA_*`). OAuth for Garmin runs through the garmin-ingest service (`VITE_GARMIN_INGEST_URL` on the app).

Cross-client storage schema: [circaevum-spec](https://github.com/Circaevum/circaevum-spec)

---

## OSC lab streams (local)

For **local research** (Muse headband, ESP32, etc.), Circaevum supports a convention of streaming sensor data over **Open Sound Control (UDP)** on your LAN, then recording to CSV or bridging into the GL.

### Muse → OSC (reference)

LibMuse iOS example sends EEG floats to `/eeg` (default port **7000**, host configurable). See `MuseStatsIosSwift` in the Muse SDK examples (`internal/vendor/muse-sdk/` in CIR monorepo).

### Recommended stream names

| OSC address prefix | Typical payload |
|--------------------|-----------------|
| `/eeg` | Float32 samples (µV), multi-channel |
| `/ppg` | PPG channels |
| `/optics` | Optics channels |
| `/acc` | Accelerometer x,y,z |
| `/gyro` | Gyro x,y,z |
| `/drlref` | DRL/REF quality |
| `/thermistor` | Temperature |

### Local recorder pattern

A small Python listener (`python-osc`) can write one CSV per stream under a timestamped session folder, with columns `timestamp, ch0, ch1, …`. This stays **on your disk** — not uploaded by circaevum.com.

**WebSocket alternative:** JSON lines hub on LAN (see CIR `internal/` notes) for replay into custom viewers.

---

## Agent Skills (this site)

Published at [/.well-known/agent-skills/index.json](https://circaevum.com/.well-known/agent-skills/index.json):

- **circaevum-site** — what circaevum.com is
- **circaevum-gl-embed** — iframe + postMessage integration
- **circaevum-developers** — this document’s summary

---

## Open source

| Repo | Role |
|------|------|
| [Circaevum/three-circa](https://github.com/Circaevum/three-circa) | GL source (this site) |
| [Circaevum/circaevum-spec](https://github.com/Circaevum/circaevum-spec) | Storage & API contracts |
| [Circaevum/account-wrapper](https://github.com/Circaevum/account-wrapper) | App wrapper (private) |

Coding-agent map: [AGENTS.md](https://github.com/Circaevum/three-circa/blob/main/AGENTS.md) (when synced to repo).

---

## Content policy (robots.txt)

```
Content-Signal: ai-train=no, search=yes, ai-input=yes
```

AI crawlers (GPTBot, Claude-Web, Google-Extended, …) are explicitly allowed to read public docs; training use is declined via Content-Signal.
