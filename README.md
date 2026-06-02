# Circaevum Graphics Library (Web)

3D time visualization for Circaevum—planetary orbits, worldlines, event rendering. This is the web/Three.js build. Use it standalone (e.g. [circaevum.com](https://circaevum.com)) or embed it via the wrapper (e.g. [app.circaevum.com](https://app.circaevum.com)).

## How time becomes space

The GL maps **timestamps to 3D coordinates** so you can see and navigate time as geometry:

- **Height (Y) = time.** Time flows upward. One year = 100 scene units; the year 2000 is the reference. A date’s height is `(year − 2000) × 100` plus progress through the year (months, days, hours).
- **Orbital angle (XZ plane).** From the same date we compute where Earth is in its orbit (e.g. vernal equinox = 0). Position in the horizontal plane is `x = cos(angle) × radius`, `z = sin(angle) × radius`.
- So each moment has a unique **(x, y, z)**: horizontal position = place in the year’s orbit, vertical = place in multi-year time.

**Worldlines** are the paths bodies take through this space-time. Each planet follows a **helical worldline**—a spiral that combines (1) orbital motion around the Sun in the XZ plane and (2) motion upward along Y as time advances. Earth’s worldline is the reference; events are drawn as arcs at slightly larger radii, parallel to Earth’s path.

**Circadian rhythm** is the ~24-hour biological cycle of day and night. The GL ties this to the same model: at day/clock zoom levels you can show a **circadian worldline**—the helix traced by a “hour hand” from Earth as it rotates while moving along its orbital path. So the daily cycle (noon/midnight, wake/sleep) appears as a spiral in the same space where years and orbits are already visible: one continuous, navigable space-time.

## What’s here

- **`index.html`** — Single entry: full GL, viewer mode with `?viewer=1` or in an iframe. Navbar has Log in (→ app) and Event List.
- **`circaevum/`** — Core GL: styles, JS (main, renderers, adapters, pipeline). No account/Nakama in this repo; login lives in the wrapper.
- **`docs/`** — [VIEWER-AND-WRAPPER.md](./docs/VIEWER-AND-WRAPPER.md), [NAKAMA-CONNECT.md](./docs/NAKAMA-CONNECT.md) (for backend wiring when needed).

## Intro tour (startup, opt-out, embed)

The GL can show a **first-visit prompt** (“Take the tour?” / “Skip”) and a **guided tour** with play/pause, scrub, step dots, and scripted camera/time/zoom beats. The first beat uses **`tourMinimalOrbitMode`** (no helical worldlines, ghost “now” orbit, or Lagrange extras) so the scene opens as a **near–top-down year view** with **Earth sweeping one calendar year** along its orbit ring. Startup and persistence live in [`circaevum/js/presentation/intro.js`](./circaevum/js/presentation/intro.js); the tour timeline is [`circaevum/js/presentation/intro-tour.js`](./circaevum/js/presentation/intro-tour.js). Scene hooks (`applyCircaevumTourScene` including `tourMinimalOrbitMode` / `moonLayer`, `captureCircaevumTourSnapshot`, `restoreCircaevumTourSnapshot`) are on `window` from [`circaevum/js/main.js`](./circaevum/js/main.js) after `setSelectedDateTime`.

**Persistence**

- `localStorage` key **`circaevum_intro_v1`**: JSON `{ "status": "dismissed" | "completed" | "accepted", "updatedAt": "<ISO>" }`. Plain string values written by older experiments are still read if they match those statuses.
- **`sessionStorage` key `circaevum_intro_v1_prompt_shown_session`**: once the prompt has been shown in a tab session, a reload does not show it again until the user finishes the flow or you clear storage (reduces nag on refresh).

**URL query parameters** (highest priority for “leave me alone” / demos)

| Param | Effect |
|-------|--------|
| `skipIntro=1` or `intro=0` | No prompt and no tour start from this load; does **not** write `localStorage` (safe for support links). |
| `intro=1` | Force the prompt even if the user previously dismissed (unless `skipIntro` / `intro=0` is also set). |
| `present=1` | Skip the prompt and start the guided tour immediately (unless skipped by the row above). |

**Public / shared calendar segment**

If the URL looks like a **public** view (`view=public`, or `bundle` + `owner`, or `calendar` + `owner`), the intro prompt **does not** run by default so shared links stay focused on the calendar. Use **`?intro=1`** (or `present=1`) on those URLs when you want the tour anyway.

**Replay**

- **Play** icon on the scene tool strip (bottom-right): resets intro state and shows the prompt again. In **viewer / iframe** mode the navbar is hidden; use the play icon on the scene strip.

**Parent page `postMessage`** (see [`circaevum/js/ui/embed-api.js`](./circaevum/js/ui/embed-api.js))

- `{ type: 'CIRCAEVUM_INTRO_SET', mode: 'dismissed' | 'completed' | 'accepted' | 'reset' }` — `reset` clears intro `localStorage` and intro session flags.
- `{ type: 'CIRCAEVUM_INTRO_PROMPT', show: true }` — show the prompt (still respects `skipIntro` / `intro=0` on the iframe URL).
- `{ type: 'CIRCAEVUM_INTRO_START' }` — start the guided tour.

**JavaScript helpers on `window`**

- `CircaevumIntro` — `runStartupGate`, `getIntroDecision`, `clearStoredIntro`, etc.
- `CircaevumIntroTour` — `start({ onComplete })`, `stop(completed)`, `isActive()`.
- `showCircaevumIntroPrompt({ force: true })`, `startCircaevumIntroTour()`, `applyCircaevumIntroEmbedCommand(data)`.

## Run locally

Serve this folder (e.g. port 8080) so the wrapper can load it:

```bash
npx serve . -p 8080
```

Open `http://localhost:8080` for the GL with navbar, or use the wrapper’s `npm run dev:all` from `yang/account-wrapper` to run GL + wrapper together.

## WebXR (VR / AR)

The GL can run in **WebXR** (immersive VR): you’re placed in the scene with the solar system in front of you. Zoom is adjustable via the in-scene XR slider.

- **Secure context required:** WebXR only runs on **HTTPS** (or `localhost`). If you see “WebXR needs a secure page”, load the app from an HTTPS URL (e.g. your deployed site) or use a tunnel for local testing (see below).
- **Testing on a headset without deploying:** Run the app on your Mac, then expose it over HTTPS and open that URL in the headset’s browser. With [ngrok](https://ngrok.com): install once with `brew install ngrok` (or download from ngrok.com), then run `npx serve . -p 8080` in one terminal and `ngrok http 8080` in another—open the `https://` URL ngrok prints in Safari on the headset.
- **Apple Vision Pro:** Safari on visionOS supports **immersive-vr** only (opaque). Open the page in **Safari on the headset** at an HTTPS URL; there is no “connect headset to Mac” step.

**References:**

- [WebXR AR Module (environmentBlendMode)](https://immersive-web.github.io/webxr-ar-module/) — how passthrough vs opaque is defined.
- [immersive-web/webxr-samples](https://immersive-web.github.io/webxr-samples/) — official samples (e.g. [immersive-ar-session](https://immersive-web.github.io/webxr-samples/immersive-ar-session.html), [ar-barebones](https://immersive-web.github.io/webxr-samples/ar-barebones.html)).
- [Google ARCore: Hello WebXR](https://developers.google.com/ar/develop/webxr/hello-webxr) — minimal AR setup with Three.js.

## Changelog

[CHANGELOG.md](./CHANGELOG.md) — version and feature history.

## Agent readiness (AI agents & isitagentready.com)

Static files for [isitagentready.com/circaevum.com](https://isitagentready.com/circaevum.com):

- `/robots.txt`, `/sitemap.xml`, `/llms.txt`, `/index.md`
- `/developers.html`, `/docs/FOR-AGENTS.md`
- `/.well-known/api-catalog`, `/.well-known/agent-skills/`

Full deploy + **Cloudflare** Link / markdown rules: **[docs/AGENT-READINESS.md](./docs/AGENT-READINESS.md)**.

After push to `main`, verify with:

```bash
curl -sI https://circaevum.com/robots.txt | head -3
```

---

For project structure, DAO, and coordination (Zhong), see the main Circaevum org and [circaevum-dao-phase-1](https://github.com/Circaevum/circaevum-dao-phase-1).
