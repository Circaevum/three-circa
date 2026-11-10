# Web GL contributor guidance

Read [README.md](README.md), [docs/FOR-AGENTS.md](docs/FOR-AGENTS.md), and [docs/SWIM-LANES.md](docs/SWIM-LANES.md). In a CIR workspace, also follow the parent agent guidance without copying private ops documentation into this public repository.

- This is the auth-free Three.js viewer. The account wrapper is a separate Git repository, usually `../yin-portal`, running on 5173; serve this viewer on 8080.
- Inspect existing changes and preserve unrelated work. Keep local previews accessible. The user reviews features; use focused code/build checks without imposing a review ceremony.
- Do not push, merge or deploy without an explicit request. Report local versus deployed status separately.
- Keep scene duration/density LOD confined to 3D rendering. App swim lanes consume independently fetched data and stable lane identities, not renderer cache replacements.
- Keep the Events panel scoped to its selected window. The wrapper owns all-date tables and saved event counts. Use the host's optional `displayColor` as a rendering override and retain the event's saved `color` in edit and serialization paths.
- The host computes circadian Project blocks and Initiative spans and supplies them on the `work-activity` layer. Keep them read-only and separate from account events. Keep Work lane controls and the date ruler visible while scrolling.
- Basic alone supports custom lane selection and menu-row alignment. Health opens structured Sleep/Heart/Activities lanes automatically and keeps its menu at the top.
- Opening/closing may animate; scrolling must track menu rows immediately. Respect reduced motion. Keep text input isolated from scene shortcuts.
- Route scene event details to the existing right Events panel's Event mode. Avoid reintroducing a second bottom event sheet in the integrated app.
- Preserve full-page, common-axis depth preview and the normal-view fallback; do not turn each component into an independently rotated page.
- Update query versions in `index.html` together when changing interdependent classic scripts/styles. A new caller with an old cached helper caused `projectFetched is not a function` and broken selection.
- Validate parent-message source; never put account credentials or storage writes into viewer code.

Checks: `node --test circaevum/js/ui/calendar-lane-events.test.cjs circaevum/js/ui/work-visibility.test.cjs circaevum/js/models/work-timeline.test.cjs`; syntax-check edited classic scripts with `node --check`. Run renderer/navigation tests when those systems change.
