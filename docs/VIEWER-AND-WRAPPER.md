# Viewer mode and React wrapper

The Circaevum web app can be split so the **graphics library (GL)** stays open-source and **login/account** lives in a separate wrapper (e.g. private repo).

## Single entry: `index.html`

There is one HTML file: **`yang/web/index.html`**.

- **Normal load** (`index.html` or `index.html` without query): Full app with navbar, Account panel, Event List (from hamburger), and Nakama (if configured).
- **Viewer mode** (`index.html?viewer=1` or when loaded in an iframe): No navbar, no account panel; full-bleed GL; Event List opens via the **right-edge pull tab** or via `postMessage` from the wrapper. Same postMessage API (ingest/clear events, open event list).

Viewer mode is enabled automatically when the URL has `?viewer=1` or when the page is embedded (e.g. in the React wrapper’s iframe).

## React wrapper: `circaevum-app/`

- **Location:** `circaevum-app/` (or a separate repo).
- **Role:** Navbar with hamburger (Account, Event List), Account panel, and an iframe that loads `index.html?viewer=1`. On login, fetches user events from Nakama and sends them to the iframe via `postMessage`.
- **Config:** Env vars `VITE_NAKAMA_*` and `VITE_VIEWER_URL` (e.g. `http://localhost:52027/index.html?viewer=1`).

See `circaevum-app/README.md` for setup.
