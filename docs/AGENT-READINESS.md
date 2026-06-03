# Agent readiness — circaevum.com

How to score well on [isitagentready.com](https://isitagentready.com/circaevum.com) (Cloudflare Agent Readiness checks).

**Scan API (verify after deploy):**

```bash
curl -s -X POST https://isitagentready.com/api/scan \
  -H "Content-Type: application/json" \
  -d '{"url":"https://circaevum.com"}' | jq '.level, .levelName, .checks'
```

## Static files (in this repo — deploy with the site)

| Path | Checks helped |
|------|----------------|
| `/robots.txt` | Discoverability, AI bot rules, Content-Signal |
| `/sitemap.xml` | Sitemap |
| `/llms.txt` | LLM site map |
| `/developers.html` | Human-facing integrator & agent docs |
| `/docs/FOR-AGENTS.md` | Full markdown reference for agents |
| `/index.md` | Markdown fallback URL |
| `/.well-known/api-catalog` | RFC 9727 API catalog |
| `/.well-known/agent-skills/index.json` | Agent Skills discovery |
| `/.well-known/oauth-authorization-server` | OAuth AS metadata + **`agent_auth`** |
| `/.well-known/openid-configuration` | OpenID Provider discovery |
| `/.well-known/oauth-protected-resource` | Protected resource metadata + **`agent_auth`** |
| `/.well-known/jwks.json` | JWKS |
| `/.well-known/mcp/server-card.json` | MCP Server Card (SEP-1649) |
| `/auth.md` | Auth.md guide (H1 contains `auth.md`) |
| `circaevum/js/ui/webmcp-tools.js` | WebMCP tools on homepage |

Deploy from [three-circa](https://github.com/Circaevum/three-circa) / `yang/web/` → GitHub Pages → **circaevum.com**.

### GitHub Pages: `.nojekyll` (required)

Jekyll skips `/.well-known/` without an empty **`.nojekyll`** at site root.

```bash
curl -sI https://circaevum.com/.well-known/mcp/server-card.json | head -3
curl -sI https://circaevum.com/auth.md | head -3
```

**api-catalog Content-Type:** if scan fails after 200, Cloudflare rule on `/.well-known/api-catalog` → `Content-Type: application/linkset+json`.

## Cloudflare (required for three HTTP/DNS checks)

See **[`cloudflare/README.md`](../cloudflare/README.md)** — index for:

| Cloudflare task | Check |
|-----------------|-------|
| Homepage **Link** header | `linkHeaders` |
| **Markdown for Agents** | `markdownNegotiation` |
| **DNS-AID** SVCB/HTTPS + DNSSEC | `dnsAid` |

GitHub Pages cannot set `Link` headers or negotiate `Accept: text/markdown`.

## Repo-only checks (after deploy)

| Check | Requirement |
|-------|-------------|
| `authMd` | `/auth.md` + `agent_auth` in OAuth metadata |
| `mcpServerCard` | `/.well-known/mcp/server-card.json` with `serverInfo`, transport `endpoint`, `capabilities` |
| `webMcp` | `navigator.modelContext.registerTool()` on homepage load (Chrome WebMCP preview) |

**WebMCP note:** isitagentready loads the page in a browser. Scan may **timeout** if WebMCP is unavailable in the scanner’s browser build. Tools still register on Chrome builds with `modelContext` enabled.

**MCP transport:** the server card describes browser-hosted tools (WebMCP) and embed API; there is no Streamable HTTP `/mcp` worker on circaevum.com yet.

## After deploy checklist

1. Push to **three-circa** `main` — include **`.nojekyll`**.
2. Confirm `/.well-known/*`, `/auth.md`, MCP server card return **200**.
3. Cloudflare: Link header, Markdown for Agents, DNS-AID + DNSSEC — see [`cloudflare/README.md`](../cloudflare/README.md).
4. Re-run scan.

## Expected score (honest)

| Layer | Unlocks |
|-------|---------|
| Static discovery files | apiCatalog, agentSkills, oauthDiscovery, oauthProtectedResource, authMd, mcpServerCard |
| Cloudflare Link + markdown + DNS-AID | linkHeaders, markdownNegotiation, dnsAid |
| WebMCP in supported browser | webMcp |

No fake `/mcp` HTTP server or A2A card unless you add real backends.

## Lanternade vs this score

[isitagentready.com](https://isitagentready.com/circaevum.com) scores **public HTTP discovery**. [Lanternade](https://toolchain.lanternade.com/) scores **code hygiene** — different layer.
