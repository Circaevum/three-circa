# Recovery notes (post–Local History restore)

## Recovered file

- **`yang/web/index.html`** was restored from Cursor Local History (backup `hzVx.html` in History folder `-34d8061d`). The previous version was saved as **`index.html.before-recovery`** in the same directory.

## Other files that have Cursor Local History

If something else looks wrong, you can use **Cursor Timeline** (or open the History folder) for these paths and compare/restore as needed:

| Path (under `yang/web/`) | History folder (under `~/Library/Application Support/Cursor/User/History/`) |
|--------------------------|-------------------------------------------------------------------------------|
| `index.html`             | `-34d8061d` (already used for restore)                                        |
| `circaevum/js/api/circaevum-gl.js` | `3e8015` |
| `circaevum/js/main.js`   | `48cae5d0`                                                                   |
| `circaevum/css/styles.css` | `1317cd7b`                                                                 |
| `circaevum/js/utils/geometry-helpers.js` | (path was `circaevum/js/utils/geometry-helpers.js`) |
| `circaevum/js/utils/vevent.js` | (path in History was `circaevum/js/utils/vevent.js`)                    |
| Other circaevum JS/CSS/docs | Various; use Timeline on the file to see backups                    |

## “Test event lines” and event-lines API

- The restored **index.html** uses **`gl.addEventLines`**, **`gl.getEventLines`**, and **`gl.removeEventLines`** (and the **Test event lines** button and Event List panel).
- **No Cursor History backup** of **circaevum-gl.js** contained those methods; they were only documented in **TESTING_API.md**.
- The event-lines API has been **re-implemented** so the restored UI works:
  - **circaevum-gl.js**: `addEventLines(layerId, lines)`, `getEventLines(layerId)`, `removeEventLines(layerId, indices?)`, plus `this.eventLines` and rendering of lines in `_renderLayer`.
  - **event-renderer.js**: `createEventLineObjects(lines, layerConfig, sceneContentGroup)` to draw line segments on the helix (same curve as duration events).

You can click **Test event lines** and use the Event List panel’s Refresh and “Draw line” as in **TESTING_API.md**.

## Cleanup

- When you’re satisfied with the restored app, you can delete **`yang/web/index.html.before-recovery`**.
