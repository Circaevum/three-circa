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
| `/llms.txt` | LLM site map (optional scan toggle) |
| `/developers.html` | Human-facing integrator & agent docs (MCP, API, OSC) |
| `/docs/FOR-AGENTS.md` | Full markdown reference for agents |
| `/index.md` | Markdown fallback URL |
| `/.well-known/api-catalog` | RFC 9727 API catalog (`application/linkset+json`) |
| `/.well-known/agent-skills/index.json` | Agent Skills discovery |
| `/.well-known/oauth-authorization-server` | OAuth AS metadata (RFC 8414) |
| `/.well-known/openid-configuration` | OpenID Provider discovery |
| `/.well-known/oauth-protected-resource` | Protected resource metadata (RFC 9728) |
| `/.well-known/jwks.json` | JWKS (empty — Nakama uses server-side JWT validation) |
| `/auth.md` | Agent authentication guide (Auth.md) |

These ship from [three-circa](https://github.com/Circaevum/three-circa) / `yang/web/` on GitHub Pages → **circaevum.com**.

### GitHub Pages: `.nojekyll` (required)

GitHub Pages runs Jekyll by default. Jekyll **skips** dot-directories like `/.well-known/`, so `api-catalog` and Agent Skills return **404** even after push.

**Fix:** keep an empty **`.nojekyll`** at the site root (`yang/web/.nojekyll`). Without it, discovery checks stay at 0/7 no matter what you add in repo.

After deploy, verify:

```bash
curl -sI https://circaevum.com/.well-known/agent-skills/index.json | head -3
curl -sI https://circaevum.com/.well-known/api-catalog | head -3
# expect HTTP/2 200 (not 404)
```

**api-catalog Content-Type:** scan wants `application/linkset+json`. GitHub may serve extensionless files as `application/octet-stream`. If scan still fails after 200, add a Cloudflare **response header** rule on `/.well-known/api-catalog` → `Content-Type: application/linkset+json`.

## Lanternade vs this score

[toolchain.lanternade.com](https://toolchain.lanternade.com/) (Zod, Gitleaks, Husky, Vitest, CI, ESLint) hardens **code in git**. [isitagentready.com](https://isitagentready.com/circaevum.com) scores **public HTTP discovery** for agents. **No Lanternade tier moves this score** — different layer.

Use Lanternade on `garmin-ingest`, portal, future bio hub anyway; use this doc for circaevum.com deploy + Cloudflare.

## Cloudflare (required for two more passes)

circaevum.com is proxied through **Cloudflare** (`cf-ray` on responses). GitHub Pages cannot set **Link** response headers or **Accept: text/markdown** negotiation — add Cloudflare rules:

### 1. Link headers (homepage)

**Transform Rules → Modify response header** (zone: circaevum.com):

When: URI Path equals `/` OR equals `/index.html`

Set headers:

```
Link: <https://circaevum.com/.well-known/api-catalog>; rel="api-catalog"
Link: <https://circaevum.com/.well-known/agent-skills/index.json>; rel="service-doc"
Link: <https://circaevum.com/llms.txt>; rel="describedby"
```

(Or one combined `Link:` header with comma-separated entries.)

### 2. Markdown content negotiation

**Option A — [Markdown for Agents](https://developers.cloudflare.com/workers/)** (Cloudflare dashboard product): enable for zone circaevum.com.

**Option B — Transform + origin path** (Cloudflare docs pattern):

1. **Request header transform:** if `Accept` contains `text/markdown` and path is `/` or `/index.html`, rewrite to fetch `/index.md`.
2. **Response header transform:** set `Content-Type: text/markdown` for `/index.md` responses when `Accept` included markdown.

**Option C — URL fallback:** agents can fetch https://circaevum.com/index.md directly (always markdown).

Validate:

```bash
curl -sI -H "Accept: text/markdown" https://circaevum.com/ | grep -i content-type
# expect: text/markdown
```

## Not applicable (yet) on circaevum.com

| Check | Why skip / defer |
|-------|------------------|
| MCP Server Card | No MCP server on static GL site |
| WebMCP | No browser tool registration on GL |
| x402 / commerce | Not a storefront |
| DNS-AID | Optional DNS SVCB records at registrar |
| Web Bot Auth | Only if circaevum.com sends signed bot requests outbound |

## After deploy checklist

1. Push to **three-circa** `main` (Pages rebuild) — include **`.nojekyll`** at repo root.
2. Confirm https://circaevum.com/robots.txt returns **200** `text/plain`.
3. Confirm https://circaevum.com/.well-known/api-catalog and `.../agent-skills/index.json` return **200** (not 404).
4. Apply Cloudflare Link + markdown rules if not already.
5. Re-run isitagentready.com scan.

### Expected score after fixes (honest ceiling)

| Fix | Checks unlocked |
|-----|-----------------|
| `.nojekyll` + `.well-known/*` live | `apiCatalog`, `agentSkills`, `oauthDiscovery`, `oauthProtectedResource` |
| `/auth.md` live | `authMd` |
| Cloudflare Link headers on `/` | `linkHeaders` |
| Cloudflare markdown negotiation on `/` | `markdownNegotiation` |
| DNS SVCB / DNS-AID at registrar (optional) | `dnsAid` |

**Still fail without scope creep** (no live MCP/A2A/WebMCP on static GL): MCP server card, WebMCP, A2A agent card.

Target after deploy + Cloudflare: **Level 3-ish** (Discoverability + Content + partial Discovery), not 100/100.

## Coding-agent repo map

Monorepo architecture: CIR root **`AGENTS.md`** (public) + **`internal/AGENTS-CIR.md`** (ops). Copy or sync **`AGENTS.md`** into three-circa when publishing.
