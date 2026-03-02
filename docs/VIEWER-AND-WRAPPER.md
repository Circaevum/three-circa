# Viewer mode and React wrapper

The Circaevum web app is split so the **graphics library (GL)** is viewer-only (no account/Nakama in the repo) and **login/account** lives in the wrapper (app.circaevum.com).

## Single entry: `index.html`

There is one HTML file: **`yang/web/index.html`**.

- **GL (yang/web)** is **viewer-only**: no Nakama config, no account panel. Navbar has hamburger with **Event List** only; "Open full app" in the event list footer points to the wrapper (set `window.CIRCAEVUM_FULL_APP_URL = 'https://app.circaevum.com'` for production).
- **Viewer mode** (`index.html?viewer=1` or when loaded in an iframe): No navbar; full-bleed GL; Event List via the **right-edge pull tab** or `postMessage` from the wrapper. Same postMessage API (ingest/clear events, open event list).

Viewer mode is enabled automatically when the URL has `?viewer=1` or when the page is embedded (e.g. in the React wrapper's iframe). On **localhost**, viewer mode is also the default (unless you use `?viewer=0`), and "Open full app" in the event list panel points to `http://localhost:5173` (the wrapper) if not overridden.

## React wrapper: Yin-portal (`account-wrapper/`)

- **Location:** `yang/account-wrapper/` (or a separate repo).
- **Role:** Navbar with hamburger (Account, Event List), Account panel, and an iframe that loads `index.html?viewer=1`. On login, fetches user events from Nakama and sends them to the iframe via `postMessage`.
- **Config:** Env vars `VITE_NAKAMA_*` and `VITE_VIEWER_URL`. In dev, if `VITE_VIEWER_URL` is unset, the wrapper uses `http://localhost:8080/index.html?viewer=1` (GL on port 8080).

**Local development:** Serve the GL from `yang/web` on port 8080 (e.g. `npx serve -p 8080`), run the wrapper with `npm run dev` (port 5173). Open http://localhost:5173. See `account-wrapper/README.md` for details.
