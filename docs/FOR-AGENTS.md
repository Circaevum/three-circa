# Circaevum — for developers & AI agents

**Site:** https://circaevum.com · **Human page:** https://circaevum.com/developers.html · **Markdown:** https://circaevum.com/docs/FOR-AGENTS.md

> **AI agents — start here:** Read [llms.txt](https://circaevum.com/llms.txt) first (site map), then **this file** for integration paths, embed API, and discovery. Human-readable summary: [developers.html](https://circaevum.com/developers.html).

circaevum.com hosts the **Graphics Library (GL)** — auth-free 3D timeline. Login, calendars, and Garmin sync live on **https://app.circaevum.com/** (separate origin).

**Modular integration:** pick only the pieces you need. The GL does **not** require Circaevum login, Nakama, or the OAuth metadata below. Many agents embed the viewer and supply events from **their own** auth and backend.

---

## Integration paths (pick what you need)

| Path | What you integrate | Auth | Start here |
|------|-------------------|------|------------|
| **A — GL + your auth** | [three-circa](https://github.com/Circaevum/three-circa) iframe or self-host | **None on GL** — you own identity & data | [Embed API](#graphics-library--embed-api) · [API.md](../API.md) · skill `circaevum-gl-embed` |
| **B — Circaevum account** | app.circaevum.com + Nakama storage | Nakama session (see [OAuth](#oauth--account-api-optional)) | [auth.md](../auth.md) · [circaevum-spec](https://github.com/Circaevum/circaevum-spec) |
| **C — Reference wrapper** | Yin-portal pattern (React host + GL iframe) | Nakama via portal | [VIEWER-AND-WRAPPER.md](./VIEWER-AND-WRAPPER.md) |
| **D — Local sensors** | OSC / CSV / LAN WebSocket → your pipeline | Local only | [OSC lab](#osc-lab-streams-local) |
| **E — Public calendars** | GL `?view=public` / bundle URLs | Optional guest read via Nakama RPC | [VIEWER-AND-WRAPPER.md](./VIEWER-AND-WRAPPER.md) |

### Path A — GL only, bring your own auth (most common for custom agents)

Use this when you want the 3D timeline but **not** Circaevum accounts.

1. **Embed or self-host** the GL — `https://circaevum.com/index.html?viewer=1` or clone [three-circa](https://github.com/Circaevum/three-circa).
2. **Your app** handles login (Auth0, Firebase, session cookies, API keys, etc.).
3. After your auth, **fetch events from your backend** and push them into the GL.

```javascript
// Host page (your origin) — wait for CIRCAEVUM_READY from iframe first
const events = await yourBackend.listEvents(session); // your API, your auth

iframe.contentWindow.postMessage(
  {
    type: 'CIRCAEVUM_INGEST_EVENTS',
    layerId: 'my-app',
    events,
    options: { layerStyles: { 'my-app': { color: '#22d3ee', visible: true } } },
  },
  'https://circaevum.com' // or your self-hosted GL origin
);
```

Or call `window.getGL()` if the GL runs same-origin. Event shape: VEVENT-like objects (`uid`, `summary`, `dtstart`, `dtend`, `category`, …) — see [API.md](../API.md).

**You can ignore:** `/.well-known/oauth-*`, `/auth.md`, app.circaevum.com, Nakama — unless you later adopt Path B.

**Self-host tip:** fork three-circa, serve static files, set `VITE_VIEWER_ORIGIN` / postMessage target to your host. No Circaevum infrastructure required.

### Path B — Circaevum account & storage (optional)

Use when you want **Circaevum-managed** calendars, layers, Garmin sync, and cross-client storage (Unity, portal, GL).

- Human UI: https://app.circaevum.com/
- API: https://nakama.circaevum.com/ (session JWT after email auth)
- Schema: [circaevum-spec](https://github.com/Circaevum/circaevum-spec)
- Discovery: [OAuth section](#oauth--account-api-optional) · [auth.md](../auth.md)

### Path C — Reference wrapper

[Yin-portal](https://github.com/Circaevum/account-wrapper) is the **reference** for Path A + B together: React shell, Nakama login, iframe GL, `postMessage` ingest. Copy the pattern or replace Nakama with your own backend while keeping the iframe contract.

### Paths D & E

- **D:** Biometrics / Muse / ESP32 on LAN — OSC addresses, local CSV; bridge into GL yourself.
- **E:** Read-only public calendar bundles in the GL URL — no login for viewers; see wrapper docs.

---

## Machine-readable discovery

| Resource | URL | Purpose |
|----------|-----|---------|
| LLM site map | [/llms.txt](https://circaevum.com/llms.txt) | Curated links for agents |
| Homepage (markdown) | [/index.md](https://circaevum.com/index.md) | Overview without HTML |
| API catalog (RFC 9727) | [/.well-known/api-catalog](https://circaevum.com/.well-known/api-catalog) | Linkset of docs & APIs |
| Agent Skills index | [/.well-known/agent-skills/index.json](https://circaevum.com/.well-known/agent-skills/index.json) | SKILL.md files for agents |
| OAuth Authorization Server | [/.well-known/oauth-authorization-server](https://circaevum.com/.well-known/oauth-authorization-server) | RFC 8414 — account API discovery |
| OpenID configuration | [/.well-known/openid-configuration](https://circaevum.com/.well-known/openid-configuration) | OIDC discovery |
| Protected resource | [/.well-known/oauth-protected-resource](https://circaevum.com/.well-known/oauth-protected-resource) | RFC 9728 |
| auth.md | [/auth.md](https://circaevum.com/auth.md) | Agent registration & Nakama auth |
| robots.txt | [/robots.txt](https://circaevum.com/robots.txt) | Crawl policy + Content-Signal |
| Sitemap | [/sitemap.xml](https://circaevum.com/sitemap.xml) | Canonical URLs |
| Agent readiness notes | [docs/AGENT-READINESS.md](https://circaevum.com/docs/AGENT-READINESS.md) | isitagentready.com checklist |
| Coordinate system | [docs/COORDINATES.md](./COORDINATES.md) | Nested polar frames + vertical time — zoom is viewer, not data |
| Link headers (HTTP) | [cloudflare/README.md](https://circaevum.com/cloudflare/README.md) | RFC 8288 — Cloudflare Transform Rule on `/` |
| MCP Server Card | [/.well-known/mcp/server-card.json](https://circaevum.com/.well-known/mcp/server-card.json) | SEP-1649; browser tools via WebMCP |
| DNS-AID | [cloudflare/dns-aid.md](https://circaevum.com/cloudflare/dns-aid.md) | `_index._agents` SVCB/HTTPS + DNSSEC at registrar |

**Homepage HTTP `Link` headers** are not set by GitHub Pages. Apply Cloudflare rules in [`cloudflare/README.md`](../cloudflare/README.md).

---

## MCP (Model Context Protocol)

**No Streamable HTTP MCP server** runs on circaevum.com (no `/mcp` worker). Discovery uses a **Server Card** plus **WebMCP** in the browser.

| What | URL |
|------|-----|
| MCP Server Card (SEP-1649) | [/.well-known/mcp/server-card.json](https://circaevum.com/.well-known/mcp/server-card.json) |
| WebMCP tools (homepage) | `circaevum_navigate_to_time`, `circaevum_set_zoom`, `circaevum_ingest_events`, … — [`webmcp-tools.js`](https://github.com/Circaevum/three-circa/blob/main/circaevum/js/ui/webmcp-tools.js) |
| Embed + ingest (Path A) | [API.md](../API.md) + skill `circaevum-gl-embed` |
| Circaevum account (Path B) | [auth.md](../auth.md) · app.circaevum.com |

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

## OAuth & account API (optional)

> **Only for Path B.** If you embed the GL with your own auth (Path A), skip this section and the OAuth discovery URLs.

**circaevum.com** publishes OAuth/OIDC **discovery metadata** so agents can find the **Circaevum account stack**. Session tokens are issued by **Nakama** after login on **https://app.circaevum.com/**.

| Discovery | URL |
|-----------|-----|
| OAuth Authorization Server (RFC 8414) | [/.well-known/oauth-authorization-server](https://circaevum.com/.well-known/oauth-authorization-server) |
| OpenID configuration | [/.well-known/openid-configuration](https://circaevum.com/.well-known/openid-configuration) |
| Protected resource (RFC 9728) | [/.well-known/oauth-protected-resource](https://circaevum.com/.well-known/oauth-protected-resource) |
| Agent auth guide | [/auth.md](https://circaevum.com/auth.md) |

**Human login:** https://app.circaevum.com/ (Yin-portal)

**Programmatic session (Nakama REST):**

```
POST https://nakama.circaevum.com/v2/account/authenticate/email
Authorization: Basic <base64(serverKey:)>
{ "email": "...", "password": "..." }
→ { "token", "refresh_token", ... }
```

Refresh: `POST /v2/account/session/refresh`. Garmin OAuth uses the garmin-ingest service (`VITE_GARMIN_INGEST_URL` on the app), not the GL origin.

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
