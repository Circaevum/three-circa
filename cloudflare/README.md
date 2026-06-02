# Link response headers — circaevum.com

GitHub Pages serves circaevum.com but **cannot** set HTTP `Link` response headers. Cloudflare sits in front (`cf-ray` on responses). Apply **one** of the options below so [isitagentready.com](https://isitagentready.com/circaevum.com) passes `discoverability.linkHeaders`.

Skill: https://isitagentready.com/.well-known/agent-skills/link-headers/SKILL.md  
RFC: [8288](https://www.rfc-editor.org/rfc/rfc8288) · [9727 §3](https://www.rfc-editor.org/rfc/rfc9727#section-3)

## Header value (copy-paste)

**Single combined `Link` header** (recommended):

```
<https://circaevum.com/.well-known/api-catalog>; rel="api-catalog", <https://circaevum.com/.well-known/agent-skills/index.json>; rel="service-doc", <https://circaevum.com/llms.txt>; rel="describedby", <https://circaevum.com/docs/FOR-AGENTS.md>; rel="service-doc"; type="text/markdown", <https://circaevum.com/.well-known/oauth-authorization-server>; rel="service-desc"; type="application/json"
```

Also in [`homepage-link-header.txt`](./homepage-link-header.txt).

Apply to **`/`** and **`/index.html`** only (homepage).

---

## Option A — Cloudflare Transform Rule (current stack: GitHub Pages + Cloudflare proxy)

1. Cloudflare dashboard → **circaevum.com** → **Rules** → **Transform Rules** → **Modify Response Header** → **Create rule**.
2. **Name:** `Agent readiness — homepage Link`
3. **When:** `(http.request.uri.path eq "/" or http.request.uri.path eq "/index.html")`
4. **Then:** **Set static** → Header name: `Link` → Value: paste line from above.
5. Deploy. Purge cache for `/` if needed.

### Validate

```bash
curl -sI https://circaevum.com/ | grep -i '^link:'
curl -sI https://circaevum.com/index.html | grep -i '^link:'
```

Expect at least one `Link:` line with `rel="api-catalog"`.

```bash
curl -s -X POST https://isitagentready.com/api/scan \
  -H "Content-Type: application/json" \
  -d '{"url":"https://circaevum.com"}' | jq '.checks.discoverability.linkHeaders'
```

---

## Option B — `_headers` (Cloudflare Pages deploy)

If the site is served from **Cloudflare Pages** (not GitHub Pages origin), the repo root [`../_headers`](../_headers) applies the same `Link` value to `/` and `/index.html`.

---

## Option C — HTML `<link>` (supplement only)

[`index.html`](../index.html) includes `<link rel="api-catalog">`, `rel="service-doc"`, and `rel="describedby"` in `<head>`. Helpful for some clients; **does not** replace HTTP `Link` headers for the isitagentready scan.

---

## Relation types used

| rel | Target |
|-----|--------|
| `api-catalog` | `/.well-known/api-catalog` |
| `service-doc` | Agent Skills index, FOR-AGENTS.md |
| `describedby` | `/llms.txt` |
| `service-desc` | OAuth authorization server metadata |
