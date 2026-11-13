# Calendar modes and swim lanes

Updated 2026-11-09. Describes the current source implementation; it is not a claim that both deployments already contain these changes.

## Run the integrated app

Serve this repository on 8080 (`python3 -m http.server 8080 --bind 127.0.0.1`) and run Yin-portal on 5173 (`npm run dev -- --host 127.0.0.1 --port 5173 --strictPort`). Open `http://localhost:5173/`. Keep both services running. Standalone viewer and sample-data behavior is distinct from the signed-in app.

## Modes and navigation

| Mode | Behavior |
| --- | --- |
| Basic | Always enabled; gray theme. Traditional calendar integrations remain here. Select calendar layers individually; click a selected layer again to remove it. Choose up to three headers for the lowered selection view. |
| Health | Red theme; Sleep is purple. Selecting Garmin opens Sleep, Heart and Activities automatically, including empty/loading rows. No custom keep/unkeep header selection. Health calendar cards retain their order and top position. |
| Work | Blue theme. Initiative cards contain Projects; a Project opens Research, Development, Delivery, plus an Attached calendars source lane. |
| Finance | Green theme; account-controlled mode. |

Account Settings controls the extra modes and groups connections and System Health checks by mode. The header provides Icons, depth overview, camera fitting, Add event (`+`) and the hamburger menu. Keys is in the hamburger menu. Scene icons start minimized.

Account events carry an optional `displayColor` from the host in six-digit hex form (`#rrggbb`). The viewer uses it for scene geometry and event list markers. The saved `color` remains available to editors and serializers. Work lane status uses icons within the Work palette, and the Garmin sleep renderer distinguishes stages with purple shades.

## Basic layout and movement

The full Layers list remains available while selecting. Selected lanes align beside their actual menu rows. Scroll positioning is immediate, without easing. Closing Layers moves lanes to the bottom dock; reopening returns them beside the rows. Opening/closing transitions respect reduced motion.

Saved, owned Basic events can be dragged between displayed calendar lanes. A destination highlights, the portal reads the stored event, and the card moves after a successful save. Dates and other stored fields remain intact; category/categories change and the record is marked edited. This is a Circaevum layer move, **not** a move between upstream Google calendars. Missing/unavailable records fail visibly. Work source-to-workflow assignment remains a separate per-project operation.

## Data loading — independent of renderer LOD

`CIRCAEVUM_FETCH_LANES` requests selected layer names and the displayed `[t0,t1]` interval from the portal. The portal queries account storage using `listEventsInWindow`; a missing/failed/capped index response falls back to paginated storage reads. It filters selected layer names and interval overlap, not event duration or scene visibility.

The viewer stores fetched lane events separately from `gl.events`. Reopening/adding a layer must not seed the view from a partial scene cache. `calendar-events-updated` does not overwrite app lane snapshots. Request IDs reject stale responses; stable calendar-lane keys do not depend on the first event's owner/calendar metadata.

The selected time and zoom still follow the scene, including Zoom 7. This may change the requested date interval; it must not apply scene density/duration LOD to lanes. Loading indicators remain visible until results render. Empty rows say “No events in this time window”; errors offer Retry. Health additionally reports loading and loaded counts/date range. An empty Activities lane does not establish that Garmin has no activity history: provider ingestion/backfill and account storage are separate from lane fetching.

These fetches read Circaevum storage; selecting Garmin does not synchronously call Garmin's upstream history API. Never replace unavailable account data with synthetic records or describe sample records as live.

The right **Event List** follows the selected scene window. Its search covers events already loaded into the viewer. For saved history, the signed-in wrapper's **Layers → Open table** shows **All dates** for that layer. The table and Layers badge share an independent paginated snapshot, and opening the table preserves scene date and zoom.

## Work organization and integrations

Initiatives own calendar attachments and repository metadata. Projects are dropdown children on Initiative cards; rename preserves task identity, aliases and assignments. An attachment can stay Initiative-only or be linked to Projects. Attached events start in their own source lane and can be assigned individually to Research, Development or Delivery without reclassifying the original calendar event.

Research, Development, and Delivery headers open their source pickers. The portal owns GitHub authorization and Initiative repository links. Delivery shows read-only commit and push markers for its selected branch, with controls to refresh or jump to the latest record. The timeline controls and date ruler stay visible as the rows scroll. AI thread activity comes from imported and explicitly selected sources. Missing usage metrics stay unavailable.

The portal combines observed Project work into blocks across gaps of up to 30 minutes and sends them to Day, Clock, and Hour views. It derives Initiative spans from the first and last observed activity across their Projects and sends each span at its matching zoom. These projections use the `work-activity` layer and remain read-only.

## Event details and other overlays

Scene selections route to the right Events panel's Event mode using the existing detail content. Swim-lane cards also open that panel. Event list/Event tabs and selected-time context live in its header. Edit remains an explicit action handled by the portal. The Century/Decade pull summary has a sticky close button; dismissal survives navigation during the current mount and Menu → Show pull summary reopens it at those zooms.

Depth overview represents full-page sheets sharing one axis and angle. Drag to rotate together; controls reorder preview pages. Preferences are device-local. Do not assume preview order changes normal-view stacking.

## Bridge messages

| Message | Direction / purpose |
| --- | --- |
| `CIRCAEVUM_OPEN_LAYERS` | Portal → viewer; names/title/mode. Basic toggles/accumulates; Garmin Health expands to its structured names. |
| `CIRCAEVUM_FETCH_LANES` / `CIRCAEVUM_LANES_RESULT` | Viewer request / portal response; requestId, names, bounds; events or error. |
| `CIRCAEVUM_LANE_ANCHORS` | Portal → viewer; open state, column width, current row rectangles. |
| `CIRCAEVUM_LANE_ROW_SIZES` | Viewer → portal; reserve selected Basic row heights. |
| `CIRCAEVUM_MOVE_LANE_EVENT` / `CIRCAEVUM_MOVE_LANE_RESULT` | Viewer request / portal acknowledgement; requestId, stored key, destination layer; saved event or error. |
| `CIRCAEVUM_OPEN_LINKED_PROJECT` | Portal → viewer; Project events and GitHub activity status. Updates refresh the active Project without reopening the lane. |
| `CIRCAEVUM_REFRESH_GITHUB_DELIVERY` | Viewer → portal; refresh the active Project’s linked branch. |
| `CIRCAEVUM_INGEST_EVENTS` / `CIRCAEVUM_CLEAR_EVENTS` | Portal → viewer; also sends and clears the read-only `work-activity` layer as Work mode and zoom change. |
| `CIRCAEVUM_ASSIGN_PROJECT_EVENT` | Viewer → portal; project/link/source/lane assignment. |
| `CIRCAEVUM_CONFIGURE_PROJECT_LANE` | Viewer → portal; open Research/Development/Delivery source picker. |
| `CIRCAEVUM_HOST_CHROME`, `CIRCAEVUM_PANEL_GEOMETRY` | Host layout and viewer geometry/open-state coordination. |

Existing Work save/share and scene ingest messages remain separate contracts. Only the authenticated host performs account writes. Read-only projections must not gain write access merely because they appear in a lane.

## Maintenance and verification

Core files: `circaevum/js/ui/swim-lanes.js`, `calendar-lane-events.js`, `calendar-viewport.js`, `event-detail-sheet.js`, and `circaevum/css/swim-lanes.css`. Portal counterparts: `src/App.jsx`, `swim-lane-fetch.js`, `WorkProjectsPanel.jsx`, `work-projects.js`, `ProjectSourcePicker.jsx`, and `AccountHub.jsx`.

```sh
node --test circaevum/js/ui/calendar-lane-events.test.cjs circaevum/js/ui/work-visibility.test.cjs circaevum/js/models/work-timeline.test.cjs
node --check circaevum/js/ui/swim-lanes.js
```

Run portal routing/fetch/work tests and its build for cross-repository changes. Keep dependent viewer script/style versions in `index.html` synchronized. Report authenticated persistence/provider checks separately from unit tests. Removed legacy menus (Swim, Layers, All Projects, Tints, Connect and Report) are not current app controls even if helper code remains.

## Work status and follow-ups (2026-11-10)

Owned Work items expose a Status and follow-up form in the right Event view. Waiting for response records a person/team separately from the assignee. Dead end / no outcome retains the compatible `no-outcome` value and allows result notes. Earlier-task selections use the existing cycle-checked dependencies. The event editor exposes the same fields.

Mark Follow-up needed and describe the next action/project. Optionally link an existing task or set a follow-up date. Without a known date, a dashed ghost appears at the future edge of the source lane, explicitly marked Date not set. This visual placeholder is metadata on the original item, not a new dated event or automatically created Project. A loaded linked task provides its actual title/date; unavailable links stay unresolved. Provider records and shared read-only events remain read-only.

Additional work metadata: `waitingOn`, `outcomeNotes`, `followUpNeeded`, `followUpTitle`, `followUpTaskId`; existing `followUpAt` and `dependencies` remain compatible.

### Project creation ribbon and linked-item tracking

The Work Swim Lanes header has a New Work item menu with Meeting, Email, Phone call, Teams message, Message, Task and Milestone. These open a new native Work item with the active Project, Research lane and selected type prefilled; no calendar attachment is required. Saving uses the authenticated event editor. Cancel leaves no stored event. Item type uses matching icons on timeline cards.

Linked calendar items expose Status and follow-up in the right Event panel. Their Project metadata is saved separately under `projectWork[project][sourceId]` on the source link in work organization preferences. Source dates, calendar identity and permissions remain unchanged. Metadata follows Project rename and stays independent across Projects. `canTrack` enables only Project metadata, not source editing. The viewer sends `CIRCAEVUM_SAVE_PROJECT_WORK`; the host validates the active Project/source and dependency cycles before saving. Creation uses `CIRCAEVUM_CREATE_PROJECT_MARKER` with an optional activity type. Account-sync failures retain the existing device-local dirty state and message.
