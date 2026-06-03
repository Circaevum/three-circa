# Circaevum developers & agents

Use when integrating circaevum.com, documenting APIs for agents, or answering MCP / OSC / discovery questions.

## Read order (agents)

1. https://circaevum.com/llms.txt — site map and discovery URLs  
2. https://circaevum.com/docs/FOR-AGENTS.md — full reference (this skill supplements that doc)  
3. https://circaevum.com/.well-known/agent-skills/index.json — other SKILL.md files  

## Human page

https://circaevum.com/developers.html — on-site summary with links.

## Full reference

https://circaevum.com/docs/FOR-AGENTS.md

## Integration paths (modular)

| Path | When | Auth |
|------|------|------|
| **A — GL + your auth** | Embed viewer, your backend | None on GL |
| **B — Circaevum account** | Nakama calendars / Garmin | app.circaevum.com |
| **C — Reference wrapper** | Copy Yin-portal pattern | Nakama (or swap) |
| **D — Local lab** | OSC / sensors on LAN | Local |

**Most custom agents:** Path A — iframe `?viewer=1`, your login, `CIRCAEVUM_INGEST_EVENTS`. No OAuth required.

Detail: https://circaevum.com/docs/FOR-AGENTS.md#integration-paths-pick-what-you-need

## Key facts

- **No MCP server** on circaevum.com (static site).
- **GL embed:** `https://circaevum.com/index.html?viewer=1` + postMessage or `window.getGL()`
- **OAuth / auth.md:** optional — only Path B (Circaevum account)
- **OSC lab (local):** UDP streams `/eeg`, `/ppg`, `/acc`, etc.

## Related skills

- `circaevum-gl-embed` — iframe + ingest (Path A)
- `circaevum-site` — site overview
