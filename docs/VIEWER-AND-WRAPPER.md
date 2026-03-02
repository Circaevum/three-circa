# Viewer mode and React wrapper

The Circaevum web app can be split so the **graphics library (GL)** stays open-source and **login/account** lives in a separate wrapper (e.g. private repo).

## Single entry: `index.html`

There is one HTML file: **`yang/web/index.html`**.

- **Normal load** (`index.html` or `index.html` without query): Full app with navbar, Account panel, Event List (from hamburger), and Nakama (if configured).
- **Viewer mode** (`index.html?viewer=1` or when loaded in an iframe): No navbar, no account panel; full-bleed GL; Event List opens via the **right-edge pull tab** or via `postMessage` from the wrapper. Same postMessage API (ingest/clear events, open event list).

Viewer mode is enabled automatically when the URL has `?viewer=1` or when the page is embedded (e.g. in the React wrapper's iframe). On **localhost**, viewer mode is also the default (unless you use `?viewer=0`), and "Open full app" in the event list panel points to `http://localhost:5173` (the wrapper) if not overridden.

## React wrapper: Yin-portal (`account-wrapper/`)

- **Location:** `yang/account-wrapper/` (or a separate repo).
- **Role:** Navbar with hamburger (Account, Event List), Account panel, and an iframe that loads `index.html?viewer=1`. On login, fetches user events from Nakama and sends them to the iframe via `postMessage`.
- **Config:** Env vars `VITE_NAKAMA_*` and `VITE_VIEWER_URL`. In dev, if `VITE_VIEWER_URL` is unset, the wrapper uses `http://localhost:8080/index.html?viewer=1` (GL on port 8080).

**Local development:** Serve the GL from `yang/web` on port 8080 (e.g. `npx serve -p 8080`), run the wrapper with `npm run dev` (port 5173). Open http://localhost:5173. See `account-wrapper/README.md` for details.
