# Cloudflare edge runbook — circaevum.com

**Production today:** GitHub Pages only (DNS → GitHub; no Cloudflare proxy). This folder is a **runbook for when you add an edge layer** — not something already live.

GitHub Pages serves static files but **cannot** set custom response headers. To pass isitagentready **Link / markdown / DNS-AID** checks and HTTP security audits (HSTS, CSP, etc.), add **Cloudflare** (proxy or Pages), **Netlify**, or similar — see **[`docs/AGENT-READINESS.md`](../docs/AGENT-READINESS.md)** for all options and current gaps.

| Task | Doc | Scan check |
|------|-----|------------|
| Link headers (RFC 8288) | [link-headers below](#link-response-headers) · [`homepage-link-header.txt`](./homepage-link-header.txt) | `discoverability.linkHeaders` |
| Markdown for Agents | [`markdown-for-agents.md`](./markdown-for-agents.md) | `contentAccessibility.markdownNegotiation` |
| DNS-AID (SVCB/HTTPS + DNSSEC) | [`dns-aid.md`](./dns-aid.md) | `discoverability.dnsAid` |

Repo-side (no Cloudflare): [`/.well-known/mcp/server-card.json`](../.well-known/mcp/server-card.json), [`/auth.md`](../auth.md), WebMCP in [`webmcp-tools.js`](../circaevum/js/ui/webmcp-tools.js).

Validate all:

```bash
curl -s -X POST https://isitagentready.com/api/scan \
  -H "Content-Type: application/json" \
  -d '{"url":"https://circaevum.com"}' | jq '.level, .levelName, .checks'
```

---

## Link response headers

Skill: https://isitagentready.com/.well-known/agent-skills/link-headers/SKILL.md

**Single combined `Link` header** — apply to **`/`** and **`/index.html`**:

```
<https://circaevum.com/.well-known/api-catalog>; rel="api-catalog", <https://circaevum.com/.well-known/agent-skills/index.json>; rel="service-doc", <https://circaevum.com/llms.txt>; rel="describedby", <https://circaevum.com/docs/FOR-AGENTS.md>; rel="service-doc"; type="text/markdown", <https://circaevum.com/.well-known/oauth-authorization-server>; rel="service-desc"; type="application/json", <https://circaevum.com/.well-known/mcp/server-card.json>; rel="service-doc"; type="application/json"
```

**Transform Rules → Modify response header** — when path is `/` OR `/index.html`, set header `Link` to the value above (also in [`homepage-link-header.txt`](./homepage-link-header.txt)).

```bash
curl -sI https://circaevum.com/ | grep -i '^link:'
```

---

## Markdown for Agents

See [`markdown-for-agents.md`](./markdown-for-agents.md).

---

## DNS-AID

See [`dns-aid.md`](./dns-aid.md).

---

## `_headers` (Cloudflare Pages only)

If deploy moves to **Cloudflare Pages**, root [`../_headers`](../_headers) sets the same homepage `Link` header. Update that file when changing [`homepage-link-header.txt`](./homepage-link-header.txt).

---

## HTML `<link>` supplement

[`index.html`](../index.html) `<head>` includes `rel="api-catalog"`, `service-doc`, `service-desc`. Does **not** replace HTTP `Link` for the scan.
