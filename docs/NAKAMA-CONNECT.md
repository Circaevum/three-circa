# Connecting Real Nakama to the Web App

This guide describes how to connect the Circaevum web app to your real Nakama server (same as Unity: device session, user session, storage).

## Quick start

1. In `index.html`, **uncomment** the block right after `<body>` that sets `window.NAKAMA_CONFIG` and loads the two Nakama scripts.
2. Ensure `NAKAMA_CONFIG` matches your server (production: `https`, `nakama.circaevum.com`, `443`, `defaultkey`).
3. Reload the app; the account panel will still use the **mock** flow until you wire the real API (see section 5). To use real Nakama, replace the placeholder login/create and storage logic with calls to `window.NakamaCircaevum` as described below.

## 1. Server configuration (match Unity)

Unity uses **NakamaDeviceManager** with:

| Setting    | Production (Unity)        | Local / override        |
|-----------|----------------------------|--------------------------|
| Scheme    | `https`                    | `http`                   |
| Host      | `nakama.circaevum.com`     | e.g. `127.0.0.1` or IP   |
| Port      | `443`                      | `7350`                   |
| Server key| `defaultkey`               | same or custom           |

The web app must use the **same** host, port, scheme, and server key so it talks to the same Nakama instance as Unity.

## 2. Add the Nakama JavaScript client

The app uses the official **Heroic Labs** client: `@heroiclabs/nakama-js`.

**Option A – ESM (no build, recommended to try first)**  
Load the client at runtime from a module:

- In `index.html`, before your account-panel script, add:

```html
<script type="module" src="circaevum/js/pipeline/nakama/nakama-load.js"></script>
<script src="circaevum/js/pipeline/nakama/nakama-circaevum.js"></script>
```

- `nakama-load.js` imports from `https://esm.run/@heroiclabs/nakama-js` and exposes `Client` and `Session` on `window`.
- `nakama-circaevum.js` uses `window.NakamaClient` and `window.NakamaSession` and reads `window.NAKAMA_CONFIG` (see below). It provides the API used by the account panel.

**Option B – Bundled build**  
If ESM.run is unavailable or you prefer a local bundle:

1. In `yang/web` run: `npm init -y && npm install @heroiclabs/nakama-js`
2. Bundle a single file, e.g. with esbuild:  
   `npx esbuild node_modules/@heroiclabs/nakama-js/dist/nakama-js.esm.mjs --bundle --format=iife --global-name=NakamaBundle --outfile=circaevum/js/pipeline/nakama/nakama-bundle.js`
3. Expose `Client` and `Session` from the bundle on `window` (e.g. in the bundle wrapper or a small script after it).
4. Keep using `nakama-circaevum.js` as-is; it only needs `window.NakamaClient` and `window.NakamaSession`.

## 3. Set connection config

Before the Nakama scripts run (or at top of your main script), set:

```javascript
window.NAKAMA_CONFIG = {
  scheme: 'https',
  host: 'nakama.circaevum.com',
  port: 443,
  serverKey: 'defaultkey'
};
```

For local Nakama:

```javascript
window.NAKAMA_CONFIG = {
  scheme: 'http',
  host: '127.0.0.1',
  port: 7350,
  serverKey: 'defaultkey'
};
```

You can put this in a small inline script in `index.html` or in a config file that loads first. Do **not** commit real server keys if they differ from `defaultkey`; use env or a non-committed config for production.

## 4. API provided by `nakama-circaevum.js`

The adapter exposes a single object on `window.NakamaCircaevum` (or the same API on `window` for classic scripts):

| Method | Purpose |
|--------|--------|
| `isConfigured()` | Returns whether `NAKAMA_CONFIG` has a valid host. |
| `getClient()` | Returns a Nakama `Client` instance (or `null` if not configured / not loaded). |
| `authenticateDevice(deviceId)` | Creates device session. Returns `Promise<{ session, error }>`. |
| `authenticateEmail(email, password, create, username)` | Email auth (login or signup). Returns `Promise<{ session, error }>`. |
| `getStoredSession()` | Restores session from localStorage (same keys as circa-iss). |
| `storeSession(session)` | Saves session token and refresh_token to localStorage. |
| `clearStoredSession()` | Removes stored session. |
| `restoreOrRefreshSession()` | Restores from storage and refreshes if near expiry. Returns `Promise<Session|null>`. |
| `listStorageObjects(session, collection, userId, limit, cursor)` | Lists user storage objects. Returns `Promise<{ objects, cursor, error }>`. |
| `writeStorageObjects(session, objects)` | Writes storage objects (for link-sessions / devices / users). |

Session has: `session.user_id`, `session.username`, `session.token`, `session.refresh_token`. Use `session.isexpired(nowSec)` for expiry checks.

## 5. Where to wire it in `index.html`

The current account panel uses **placeholder** flows. Replace or branch on `window.NakamaCircaevum` (or equivalent) as follows.

1. **Device + user session (login / create account)**  
   In the handler that currently calls `runDeviceAndUserSessionFlow`:
   - If `NakamaCircaevum.isConfigured()` and `NakamaCircaevum.getClient()`:
     - Call `authenticateDevice(deviceId)` (use your existing `getOrCreateDeviceId()`).
     - Then `authenticateEmail(email, password, isNewAccount, username)`.
     - On success, `storeSession(session)` and set `currentAccount` from `session.user_id`, `session.username`, and the device id. If “Associate with device” is on, call your link logic (see below).
   - Else: keep the existing mock flow (e.g. `runDeviceAndUserSessionFlow`).

2. **Link device to user (Associate with device)**  
   Unity does this in **NakamaStorageService.LinkSessions**: write to collections `devices` (under user) and `users` (under user). Replicate that with `writeStorageObjects`:
   - One write: collection `devices`, key e.g. `username + "'s " + deviceName`, value JSON with `deviceId`, `deviceModel`, `deviceType`, `deviceName`.
   - Second write: collection `users`, key e.g. `deviceName + " ID: " + deviceId`, value JSON with `userId`, `userName`, `auto_login`.
   Use the **user session** for both writes (same as Unity). Expose a helper in the adapter if you like, e.g. `linkUserToDevice(userSession, deviceId, deviceName)`.

3. **Auto-login on load**  
   Where you currently restore from `getAssociatedAccount()` and set `currentAccount`:
   - Call `NakamaCircaevum.restoreOrRefreshSession()`. If it returns a session, set `currentAccount` from that session (and optionally from stored associated-account blob for display name), then run the same “logged-in” path (e.g. load storage, tokens, devices, events).

4. **User-scoped storage (events, tokens, devices)**  
   When showing the logged-in account view:
   - **Events:** Call `listStorageObjects(session, 'events', session.user_id, limit, cursor)`. Map each object’s `.value` (JSON) to your event shape (e.g. id, summary, start, end) and pass them to `syncUserEventsToGL(currentAccount)` (set `currentAccount.events` and ingest into the `user-events` layer).
   - **Tokens:** Call `listStorageObjects(session, 'tokens', session.user_id, limit)`. Build an array of token identifiers or strings (e.g. provider + key) and set `currentAccount.tokens` for the “Tokens (concatenated)” line.
   - **Devices:** Call `listStorageObjects(session, 'devices', session.user_id, limit)`. Parse each `.value` and set `currentAccount.devices` (e.g. `{ deviceId, name }`) for the Devices list.

5. **Console logging**  
   Keep your existing `accountLog(level, msg)` calls; add logs for real Nakama requests/responses (e.g. “REQUEST: List storage (collection=events, userId=…)”, “RESPONSE: … count=N”) so the console still reflects what the app is doing.

6. **Logout**  
   On “Log out”, call `NakamaCircaevum.clearStoredSession()` in addition to clearing `currentAccount` and running `clearUserEventsFromGL()`.

## 6. CORS and HTTPS

- Nakama must allow the web app’s origin in CORS (server or reverse-proxy config).
- For production (`https://nakama.circaevum.com`), serve the app over HTTPS and use `scheme: 'https'`, port `443` in `NAKAMA_CONFIG`.

## 7. Session storage keys

The adapter uses the same localStorage keys as circa-iss so behaviour is consistent:

- `circa-iss-nakama-auth` (or a Circaevum-specific key if you change it in the adapter)
- `circa-iss-nakama-refresh`

You can switch to e.g. `circaevum-nakama-auth` / `circaevum-nakama-refresh` in the adapter and keep using them for restore and refresh.

## 8. Reference

- Unity: `yang/unity/TimeBox/Assets/Circaevum/Pipeline/Nakama/` (NakamaDeviceManager, NakamaUserManager, NakamaStorageService).
- Storage schema: `yang/spec/nakama/storage-schema.md` and `yang/unity/TimeBox/Assets/Circaevum/Spec/nakama/storage-schema.md`.
- Example web client: `circa-iss/src/lib/nakamaClient.js` (same Heroic Labs client and patterns).
