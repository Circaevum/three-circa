# Markdown for Agents — circaevum.com

Return `text/markdown` when clients send `Accept: text/markdown` on HTML URLs.

Skill: https://isitagentready.com/.well-known/agent-skills/markdown-negotiation/SKILL.md  
Cloudflare: [Markdown for Agents](https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents/)

GitHub Pages **cannot** negotiate content types. Enable negotiation at the edge (Cloudflare product, Transform Rules, or Netlify Edge Function) when you add a header-capable host or proxy — **not configured on circaevum.com today**.

## Option A — Cloudflare product (recommended)

1. Cloudflare dashboard → **circaevum.com**
2. Enable **Markdown for Agents** (or **AI Crawl Control** → Markdown for Agents, depending on dashboard layout)
3. Purge cache for `/` after enable

Validate:

```bash
curl -sI -H "Accept: text/markdown" https://circaevum.com/ | grep -i content-type
# expect: text/markdown

curl -s -X POST https://isitagentready.com/api/scan \
  -H "Content-Type: application/json" \
  -d '{"url":"https://circaevum.com"}' | jq '.checks.contentAccessibility.markdownNegotiation'
```

Scanner may also look for `x-markdown-tokens` — Cloudflare adds this when the product is enabled.

## Option B — Transform Rules (manual)

If the product is unavailable on your plan:

1. **Request transform:** when `Accept` contains `text/markdown` and path is `/` or `/index.html`, rewrite origin fetch to `/index.md`.
2. **Response transform:** for `/index.md` when request had `Accept: text/markdown`, set `Content-Type: text/markdown`.

## Option C — Direct markdown URL (always works, no scan credit)

Agents can fetch markdown without negotiation:

- https://circaevum.com/index.md
- https://circaevum.com/docs/FOR-AGENTS.md

[`index.html`](../index.html) advertises `<link rel="alternate" type="text/markdown" href="/index.md">`.
