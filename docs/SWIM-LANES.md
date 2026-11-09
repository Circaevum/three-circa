# Work / Swim Lanes

Open `http://localhost:8080/?workView=swim-lanes&skipIntro=1`, or Layers → Work → Swim Lanes. Yin-portal has the same view at `http://127.0.0.1:5173/?workView=swim-lanes`; its Layers → Work entry also creates work items.

## Launch

In `yang/web`: `python3 -m http.server 8080 --bind 127.0.0.1`.
In `yang/yin-portal`: `npm run dev -- --host 127.0.0.1 --port 5173 --strictPort`.
No deployment or new dependency is required. The existing portal viewer URL defaults to localhost:8080 in development.

## Interaction

Swim Lanes slides up as a bottom drawer over the 3D calendar. The top grip expands/reduces it; Hide lanes closes it. Selecting an item switches the right inspector to Event mode; its Timeline tab returns to the overview. Weekends are slightly darker in both themes.

Compact mode uses 19 px objects, 25 px overlapping-item rows and a 42 px minimum lane, with full titles, dates and links available through item details. Comfortable mode expands rows. Project filtering, Fit, date navigation, and hour/day/week/month/quarter/year views are available. Month and quarter ticks fall on calendar Mondays, including across DST.

Horizontal trackpad scrolling pans time continuously; ordinary vertical scrolling remains vertical. Shift+wheel is an alternative. The lane center drives the existing GL selected time and zoom. The existing painted context-arc bounds produce the cyan band. Changes from the 3D calendar recenter the lane view and select the corresponding zoom. No independent time model or renderer is introduced.

Enable Connect, then drag an output endpoint to an input endpoint, or click each endpoint in turn. Self-links and cycles in the loaded graph are rejected. Connections flow along smooth cubic curves with directional arrowheads. Select a connector to inspect its target or reset its curve. Curve handles drag on an 8 px grid; endpoints remain attached when dates or zoom change. The target item owns its dependency list. Only owned targets can be saved in the portal; a subscribed source can link into an owned target.

Object state colors: blue = upcoming; magenta = waiting for response; yellow = needs action; green = completed milestone; neutral checkmark = completed task; gray = past/no-outcome; red = blocked/cancelled. This follows the latest direction reserving blue for future work. Status is also written in item details. Overdue and follow-up warnings do not silently change the saved state.

Workflow tints are intentionally faint and independent of state: blue AI-assisted coding, violet cloud, green code/configuration, ochre communication, olive field work, earth installation, teal presentations, rose contracts, slate operations. The workflow legend names each tint and icon. Change workflow in an item's editor.

## Existing calendar / sharing contract

Lane identity uses the event's calendar category/layer. Editors save lane changes back to `category`; `work.lane` remains as a compatibility mirror. VEVENT `uid`, `dtstart`, `dtend`, `summary`, `description`, `isWorkEvent` stay canonical. Calendar `status` remains separate from task state.

Optional `work` metadata:

```json
{"project":"OpenAMI / ISV","lane":"Delivery","kind":"task","status":"waiting","workflow":"cloud","assignee":"Platform team","followUpAt":"2026-11-12","dependencies":["other-event-uid"],"links":[{"uid":"other-event-uid","from":"end","to":"start","route":"elbow","offset":16}]}
```

Kinds: meeting/task/milestone. States: planned/todo/in-progress/waiting/blocked/cancelled/done/no-outcome. Milestones are displayed at their start instant. All-day dates follow VEvent's local-date convention; date-times retain their absolute instant.

The portal queries existing `rpc_list_calendars` and `rpc_list_subscribed_events` endpoints, with a 1,000 event per-calendar request limit. Subscribed identities are qualified as `ownerId::uid` so dependencies can resolve across that owner's shared lanes without colliding with another owner's UID. Public views and subscribed lanes are read-only here. This does not grant permissions or implement a new federation protocol. Existing server subscription/access decisions remain authoritative; no backend was deployed.

Lane access & sharing opens the existing share/invite controls. Only links created from this work-specific flow request the Swim Lanes view. Public work snapshots preserve metadata and visible-layer filtering. Unavailable dependency titles are never synthesized from private account data. Owned work events and shared events are kept separate; changing accounts clears the shared cache.

Messages: `CIRCAEVUM_WORK_EVENTS` replaces permitted loaded events, `CIRCAEVUM_OPEN_SWIM_LANES` opens the page, `CIRCAEVUM_REFRESH_WORK` refreshes access, `CIRCAEVUM_SAVE_WORK` saves owned work metadata with a success/error acknowledgement, `CIRCAEVUM_SHARE_WORK_LANE` opens existing sharing. GL accepts these from its parent; portal validates its viewer source/origin and looks up owned events before writing. Existing `CIRCAEVUM_EDIT_EVENT` opens the event editor.

## Reports and sample data

Follow-up report lists loaded items, owners/responsible parties, state, overdue dates, unresolved links, and past meetings with no linked next step. Meetings deliberately marked no-outcome are exempt from that alert. CSV export is local and escapes spreadsheet-formula prefixes.

The OpenAMI / ISV example is illustrative, not confirmed commitments. Example edits remain browser-local under `circaevum.work-example.v2`; old v1 edits are left intact. They never write to Nakama or affect Garmin data.

## Validation and remaining limits

GL: `node --test circaevum/js/models/work-timeline.test.cjs circaevum/js/aevum/helical-projection.test.cjs circaevum/js/utils/sky-geometry.test.cjs circaevum/js/app/navigation.test.js circaevum/js/renderers/event-types-zoom-visibility.test.js`.
Portal: `node --test src/work-event.test.js` and `npm run build`.

Reports and cycle detection cover loaded, permitted events, not an unbounded project database. Navigation informs the existing portal period-loader; it does not add a new global task query. Recurrence expansion and automatic dependency rescheduling are not implemented. Shared writers are intentionally not enabled: the available save path writes owner storage. Live authenticated saving and subscription ACL enforcement require the configured server and a signed-in session; they were not exercised against production during implementation. Garmin integration and renderer files remain unchanged.
