# Agent readiness & site improvements — circaevum.com

How to score well on [isitagentready.com](https://isitagentready.com/circaevum.com), and related **HTTP security** checks (e.g. [Mantis](https://mantishack.com)).

**Scan API (verify after deploy):**

```bash
curl -s -X POST https://isitagentready.com/api/scan \
  -H "Content-Type: application/json" \
  -d '{"url":"https://circaevum.com"}' | jq '.level, .levelName, .checks'
```

**Response headers (any time):**

```bash
curl -sI https://circaevum.com/ | grep -iE '^(strict-transport|content-security|x-frame|x-content-type|referrer|link|server):'
```

---

## Current production (honest)

| Layer | Today |
|-------|--------|
| **Host** | [three-circa](https://github.com/Circaevum/three-circa) → **GitHub Pages** |
| **DNS** | `circaevum.com` A records → GitHub Pages (`185.199.x.x`) — **no Cloudflare proxy** |
| **Static discovery files** | In repo; deploy with the site |
| **Custom HTTP response headers** | **None** — GitHub Pages cannot set them |
| **Cloudflare docs in repo** | Runbooks for when you add an edge layer — **not applied in production yet** |

GitHub Pages is enough for static agent-discovery files. It is **not** enough for Link headers, markdown negotiation, DNS-AID, HSTS, CSP, or other response-header checks.

---

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

**api-catalog Content-Type:** if scan fails after 200, set `Content-Type: application/linkset+json` on `/.well-known/api-catalog` at the edge (see hosting options below).

---

## Opportunities to improve

Grouped by scanner / concern. All **HTTP header** rows need a host or proxy that can emit response headers — not GitHub Pages alone.

### A — Agent discovery (isitagentready.com)

| Opportunity | Scan check | Status | Notes |
|-------------|------------|--------|-------|
| Homepage **Link** header (RFC 8288) | `linkHeaders` | ❌ | Value in [`cloudflare/homepage-link-header.txt`](../cloudflare/homepage-link-header.txt); also in [`../_headers`](../_headers) for Pages/Netlify |
| **Markdown for Agents** (`Accept: text/markdown` on `/`) | `markdownNegotiation` | ❌ | Cloudflare product or Transform Rule; Netlify Edge Function; **fallback URLs work without it**: `/index.md`, `/docs/FOR-AGENTS.md` |
| **DNS-AID** (SVCB/HTTPS under `_agents` + DNSSEC) | `dnsAid` | ❌ | Cloudflare DNS — see [`cloudflare/dns-aid.md`](../cloudflare/dns-aid.md). Netlify DNS does **not** support SVCB/HTTPS records |
| **WebMCP** on homepage | `webMcp` | ⚠️ | Implemented in repo; scan may timeout if scanner browser lacks `navigator.modelContext` |
| Streamable HTTP **`/mcp`** worker | — | ❌ | Not planned on circaevum.com; server card describes WebMCP + embed API |

Runbooks: [`cloudflare/README.md`](../cloudflare/README.md) (Link, markdown, DNS-AID).

### B — HTTP security (e.g. Mantis header audit)

[Mantis](https://mantishack.com) (and similar tools) check **response headers** on `https://circaevum.com/`. Findings as of 2026-06 — all require an edge layer or host migration:

| Opportunity | Severity | Recommended header | Status |
|-------------|----------|-------------------|--------|
| **HSTS** | Medium | `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` | ❌ |
| **Content-Security-Policy** | Medium | Start **Report-Only**, then enforce — see [CSP notes](#csp-and-clickjacking-notes) | ❌ |
| **Clickjacking defense** | Medium | `Content-Security-Policy: frame-ancestors 'self' https://app.circaevum.com` | ❌ |
| **X-Content-Type-Options** | Low | `X-Content-Type-Options: nosniff` | ❌ |
| **Referrer-Policy** | Low | `Referrer-Policy: strict-origin-when-cross-origin` | ❌ |

**HTML `<meta>` tags** (Referrer-Policy, partial CSP) do **not** satisfy these scanners and cannot send HSTS or `frame-ancestors`. They are a weak stopgap only if you stay on GitHub Pages with no edge.

Verify after any header work:

```bash
curl -sI https://circaevum.com/ | grep -iE 'strict-transport|content-security|x-content-type|referrer'
```

Template headers for **Cloudflare Pages** or **Netlify**: [`../_headers`](../_headers).

### C — Future backends (optional, not faked)

| Opportunity | Notes |
|-------------|-------|
| Real Streamable HTTP `/mcp` | Separate worker/service; update server card when live |
| A2A agent card | DNS-AID placeholder in [`cloudflare/dns-aid.md`](../cloudflare/dns-aid.md) when an agent exists |

---

## Hosting options (headers + agent checks)

GitHub Pages **alone** cannot unlock rows in **A** (Link, markdown negotiation) or **B** (security headers). Pick one path:

| Path | Keep GitHub Pages? | Agent Link + security headers | Markdown negotiation | DNS-AID |
|------|-------------------|------------------------------|----------------------|---------|
| **GitHub Pages only** | Yes | ❌ | ❌ (direct `/index.md` OK) | ❌ |
| **Cloudflare free proxy** (orange-cloud in front of Pages) | Yes | ✅ Transform Rules or SSL HSTS | ✅ product or Transform Rules | ✅ if DNS on Cloudflare |
| **Cloudflare Pages** | No (migrate) | ✅ [`_headers`](../_headers) | ⚠️ Transform / Worker | ✅ if DNS on Cloudflare |
| **Netlify** | No (migrate) | ✅ `_headers` or `netlify.toml` | ⚠️ Edge Function (custom) | ❌ on Netlify DNS; use Cloudflare DNS only if needed |

**Netlify ≠ full Cloudflare replacement:** Netlify covers hosting, SSL, CDN, and custom headers well. It does **not** offer Cloudflare’s one-click Markdown for Agents, SVCB/HTTPS DNS records, or “proxy without migrating” in front of GitHub Pages. Hybrid **Netlify host + Cloudflare DNS** works if you need DNS-AID without moving static files back to Pages.

### Minimal change (keep GitHub Pages)

1. Add **Cloudflare** (free), point DNS to GitHub Pages, enable proxy.
2. **SSL/TLS → HSTS** in dashboard.
3. **Transform Rules → Modify response header** on `/*` — security headers from [B](#b--http-security-eg-mantis-header-audit) + homepage `Link` from [`cloudflare/README.md`](../cloudflare/README.md).
4. Optional: Markdown for Agents, DNS-AID per [`cloudflare/`](../cloudflare/README.md).

### Headers-in-git (leave GitHub Pages)

1. Deploy same repo to **Cloudflare Pages** or **Netlify**.
2. Point `circaevum.com` DNS to the new host.
3. Extend [`../_headers`](../_headers) (security + Link); keep file in sync with [`homepage-link-header.txt`](../cloudflare/homepage-link-header.txt).

---

## CSP and clickjacking notes

The GL is embedded in an iframe by **app.circaevum.com** ([`VITE_VIEWER_URL`](https://github.com/Circaevum/account-wrapper)). Do **not** use `X-Frame-Options: DENY` or `frame-ancestors 'none'` globally — that breaks the account app.

Use:

```http
Content-Security-Policy: frame-ancestors 'self' https://app.circaevum.com
```

Full CSP is non-trivial for this site: many local `<script>` tags, one CDN script (html2canvas on cdnjs), inline handlers in HTML, WebXR. Start report-only, e.g.:

```http
Content-Security-Policy-Report-Only: default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https: wss:; frame-ancestors 'self' https://app.circaevum.com
```

Tune from browser console violations before enforcing.

---

## Repo-only checks (after deploy)

| Check | Requirement |
|-------|-------------|
| `authMd` | `/auth.md` + `agent_auth` in OAuth metadata |
| `mcpServerCard` | `/.well-known/mcp/server-card.json` with `serverInfo`, transport `endpoint`, `capabilities` |
| `webMcp` | `navigator.modelContext.registerTool()` on homepage load (Chrome WebMCP preview) |

**WebMCP note:** isitagentready loads the page in a browser. Scan may **timeout** if WebMCP is unavailable in the scanner’s browser build. Tools still register on Chrome builds with `modelContext` enabled.

**MCP transport:** the server card describes browser-hosted tools (WebMCP) and embed API; there is no Streamable HTTP `/mcp` worker on circaevum.com yet.

---

## After deploy checklist

1. Push to **three-circa** `main` — include **`.nojekyll`**.
2. Confirm `/.well-known/*`, `/auth.md`, MCP server card return **200**.
3. If using an edge layer: Link header, security headers, optional markdown + DNS-AID — see [Hosting options](#hosting-options-headers--agent-checks).
4. Re-run [isitagentready scan](https://isitagentready.com/circaevum.com) and header audit (Mantis or `curl` above).

---

## Expected score (honest)

| Layer | Unlocks |
|-------|---------|
| Static discovery files (today) | apiCatalog, agentSkills, oauthDiscovery, oauthProtectedResource, authMd, mcpServerCard |
| Edge: Link + markdown + DNS-AID | linkHeaders, markdownNegotiation, dnsAid |
| Edge: security headers | Mantis / similar HTTP security audits |
| WebMCP in supported browser | webMcp |

No fake `/mcp` HTTP server or A2A card unless you add real backends.

---

## Lanternade vs this score

[isitagentready.com](https://isitagentready.com/circaevum.com) scores **public HTTP discovery**. [Lanternade](https://toolchain.lanternade.com/) scores **code hygiene** — different layer. Mantis scores **HTTP security headers** — also different from agent discovery, but same fix path (edge headers).
