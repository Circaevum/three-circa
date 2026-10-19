# PAC 2026 · ISV + Tech Comm + Paper Sessions

Circaevum-import CSV for IEEE Power Africa 2026 (Nairobi, EAT = UTC+3).

**Full source:** `pac2026-isv-power-africa.csv` (~81 KB, 252 events)  
**Branch:** `explore/pac2026-isv-layer`

## Upload size (`http: request body too large`)

Cloud write rejects the **full** file in one shot (Nakama/proxy body cap — not the CSV on disk alone). Import the **split chunks** below, one file at a time (same calendar / layer).

| File | Rows | ~size | Layer |
|------|------|-------|--------|
| `pac2026-tech-comm-workshop.csv` | 4 | 1 KB | Yellow Tech Comm |
| `pac2026-isv-track.csv` | 70 | 19 KB | Green ISV track |
| `pac2026-paper-sessions-2026-09-22.csv` | 36 | 13 KB | Blue papers · Mon |
| `pac2026-paper-sessions-2026-09-23.csv` | 72 | 25 KB | Blue papers · Tue |
| `pac2026-paper-sessions-2026-09-24.csv` | 70 | 25 KB | Blue papers · Wed |

Keep `pac2026-isv-power-africa.csv` as the single source of truth for regen; do not upload it whole until the body limit is raised.

## Colors

| Color | Hex | Layer |
|-------|-----|--------|
| Yellow | `#EAB308` | ISV Tech Comm OpenAMI EMS workshop ([isv.wiki](https://isv.wiki/#events/power-africa-2026-workshop-planning)) |
| Green | `#22C55E` | Other ISV track (sheet day-by-day; logistics breakfast/bus/tea skipped) |
| Blue | `#3B82F6` | PAC technical paper slots ([PDF](https://ieee-powerafrica.org/wp-content/uploads/sites/509/2026/09/PAC2026-Paper-Sessions.pdf)) |

## Columns

`title,start,end,color,description,location,categories,uid` — matches Circaevum CSV import (`title`/`start`/`end`/`color`). Times are **UTC** (`…Z`).

## Sources

1. Tech Comm workshop blocks — wiki Mon 21 + Thu 24 wrap-up  
2. ISV hour-by-hour — [working sheet](https://docs.google.com/spreadsheets/d/1vc-kQhte16IUUtVNZ4025ExlQE8d4seebhAYUrpADYY/edit)  
3. Paper sessions — PAC2026 Paper Sessions PDF (22–24 Sep)

## Public slug

Import CSV chunks in Yin-portal → make calendar public / create public bundle → share slug link (`rpc_resolve_calendar_slug`). These files are the layer payload only; slug is account-side.

## Regenerate

Re-export sheet CSV + refresh PDF extract, then re-run the generator used to build the full file. Re-split with:

```sh
# from CIR/yang/web/circaevum/js/data — after regenerating the full CSV
python3 - <<'PY'
# (same splitter used in agent session — or re-run from README notes)
PY
```

Or ask agent: “re-split pac2026 CSV for Circaevum upload.”
