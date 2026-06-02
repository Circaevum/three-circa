# Circaevum developers & agents

Use when integrating circaevum.com, documenting APIs for agents, or answering MCP / OSC / discovery questions.

## Human page

https://circaevum.com/developers.html — on-site summary with links.

## Full reference

https://circaevum.com/docs/FOR-AGENTS.md

## Key facts

- **No MCP server** on circaevum.com (static site).
- **Discovery:** `/llms.txt`, `/.well-known/api-catalog`, `/.well-known/agent-skills/index.json`, `/sitemap.xml`
- **Embed:** `https://circaevum.com/index.html?viewer=1` + `postMessage` or `window.getGL()`
- **Account:** https://app.circaevum.com/ (Nakama, calendars, Garmin)
- **OSC lab (local):** UDP streams `/eeg`, `/ppg`, `/acc`, etc. — record locally; not hosted on circaevum.com

## Related skills

- `circaevum-gl-embed` — iframe + ingest API
- `circaevum-site` — site overview
