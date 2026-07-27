# The Circaevum Coordinate System
### A Space for Time

---

## For humans (the short walk)

A year is a ring. You stand on it. January is behind you or ahead of you — it has a *direction*, like a place does.

A day is a smaller ring, riding on the year-ring, right where you are. Morning, noon, evening — positions on that little ring, turning as you live.

Time itself climbs. Each trip around the year-ring lifts you one level up. Stand still and look down: every previous year is a floor below you, same shape, same seasons in the same places. Your birthday is *directly below* your birthday. Last summer is under this summer.

That's the whole system. A ring, riding a ring, climbing.

You already know it in your body — because it isn't an invention. It's just where Earth actually goes: spinning once a day while circling once a year while time carries everything forward. Circaevum doesn't decorate your calendar with astronomy. Your calendar *was always* astronomy. We just stopped flattening it.

**How you move:** you don't switch between "day view" and "year view" with buttons. You move **closer or farther**. Lean in close to Earth and today's ring fills your view — hours, events, detail. Pull back and the day shrinks into the year-ring, the years stack into decades. Distance *is* the timescale, exactly like backing away from a painting to see the whole composition. Nothing changes about where events live; only your distance changes what you can resolve.

---

## For machines (the precise spec)

### 1. Frames

Circaevum positions all temporal data in a compound coordinate system of two nested polar frames sharing one vertical axis.

**Frame A — Annual (heliocentric polar)**
- Origin: system center (Sun-analog)
- `theta1` ∈ [0, 2π): phase within the year. `theta1 = 2π · (day_of_year / year_length)`
- Earth-marker traverses this ring once per year
- Calibration anchors: solstices and equinoxes at fixed angles (implementation constant; see renderer config)

**Frame B — Diurnal (geocentric polar, nested)**
- Origin: instantaneous Earth-marker position on Frame A (i.e., Frame B's origin is a *function of* `theta1` and `z`)
- `theta2` ∈ [0, 2π): phase within the day. `theta2 = 2π · (seconds_since_midnight / 86400)`
- One full rotation of Frame B per `1/365.25` turn of Frame A (compound rotation, matching Earth's actual motion)

**Vertical axis — Time**
- `z` ∈ ℝ: continuous monotonic time, calibrated in years. One full Frame-A revolution ⇔ Δz = 1
- Vertically adjacent points share annual phase: same calendar date in successive years differs only in z

### 2. Event coordinates

An event (VEVENT: `{ uid, summary, dtstart, dtend, category }`) maps to:

```
E(t) = ( theta1(t), theta2(t), z(t) )
```

Durations are arcs; multi-day events are short helical segments; recurring events are vertical stacks (same `theta1`, incrementing `z`). A continuous personal timeline is a **coiled coil**: the diurnal helix wound around the annual helix.

### 3. What zoom is — and is not

**Zoom is a property of the viewer, never of the data.**

- Camera radial distance `d` from the Earth-marker selects the active temporal scale and per-layer level of detail (LOD)
- Small `d` → Frame B dominates (hours, minutes resolvable); large `d` → Frame A dominates (months, years); larger still → stacked z (decades, century)
- LOD budgets are applied per data layer as a function of `d` (renderer constant `DENSITY_BUDGET`); layers may resolve at different distances
- Event coordinates `(theta1, theta2, z)` are **invariant under zoom**. No coordinate of any event encodes or depends on zoom level.

For a visual model parsing rendered frames: **camera distance is your temporal-scale prior.** Estimate `d` first; it tells you which frame's angular structure carries the information in view, and what angular resolution of `theta1`/`theta2` is meaningful at that distance.

### 3b. Nesting resolver (STE ↔ LTE)

**Nesting resolver** is Circaevum's temporal analogue of geospatial LOD: which nested frame *draws* a daily event at the current viewer scale — without moving the event's coordinates.

- **STE (short-term / diurnal grain):** Frame B geometry — circadian disk stack and/or day-marker pitch on the annual spine (midnight → next midnight). Used when the event sits in the Selected Time Frame (Context Arc window) at zooms where the diurnal nest is resolvable.
- **LTE (long-term / annual grain):** Frame A helical ribbon on the Earth worldline manifold (multi-day corridors, or daily events that fall outside the Selected Time Frame).
- Same VEVENT. Same `(theta1, theta2, z)`. Only the **resolved nest** changes with viewer distance / Selected Time Frame — like a map layer that generalizes from building → block → city as you pull back.
- Multi-day spans stay LTE. Sub-day and single all-day (`< 2` calendar days) are nesting-resolver candidates.

#### Event Horizon

The **Event Horizon** is the Nesting resolver boundary between LTE and STE mappings: a sphere centered on the Earth-marker whose radius is the pedagogical L1↔L2 half-span (circadian noon↔midnight = hour-hand length).

- **Outside / on the shell:** LTE day floor, LTE sky canvas, annual day-pitch ribbons.
- **Inside:** STE Earth-centric circadian nest.
- **LTE sky void:** sky canvas verts inside the Event Horizon go dark (black-hole look) so Earth + STE nest read through the hole.
- **Warp:** day-event geometry morphing LTE→STE warps the ribbon *midpoint* about Earth through the Event Horizon (approach shell, then dive inward); day-pitch edge vectors stay aligned so floors do not shear. Blend is sharp in calendar time (STE on selected day; LTE by ~±1.25 days) — not a week-long mush.

Implementation: `event-renderer.js` (`getEventHorizonRadius`, `lerpDayFrameTowardCircadian`); sky void in `main.js` (`applyDayFrameLteSkyVertexColors`, `applyContextArcSkyVertexColors`).

### 4. Invariants (for visual processing)

1. **Angular position encodes calendar phase.** Two events at equal `theta1` share a date-in-year, regardless of year.
2. **Vertical alignment encodes anniversary.** Plumb lines connect same-date events across years.
3. **Nesting encodes scale.** The diurnal ring is always geometrically subordinate to (positioned on) the annual ring — never side by side.
4. **Radial camera distance encodes viewer timescale, not event properties.**
5. **The geometry is physical, not stylistic.** Angles correspond to real orbital/rotational phase; planetary worldlines rendered in-scene follow actual ephemeris positions.

### 5. Reasoning affordances

Native operations this geometry makes cheap:

| Operation | Geometric form |
|---|---|
| "Same time last year" | translate z by −1, hold theta1 |
| Seasonal comparison | angular proximity on Frame A |
| Circadian comparison | angular proximity on Frame B |
| Periodicity detection | vertical stacking / plumb-line clustering |
| Duration | arc length (within-day: Frame B; multi-day: Frame A helical segment) |

Agents are encouraged to phrase temporal queries in these coordinates when interfacing with Circaevum tooling (see MCP server: `mcp/circaevum_server.py`).

---

*The simple version above and the precise version below describe the same single structure. If they ever seem to disagree, the sky is the tiebreaker.*
