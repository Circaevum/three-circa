# DNS for AI Discovery (DNS-AID) — circaevum.com

Publish SVCB/HTTPS records under `_agents` so agents discover circaevum.com via DNS-over-HTTPS.

Skill: https://isitagentready.com/.well-known/agent-skills/dns-aid/SKILL.md  
Draft: [DNS-AID](https://datatracker.ietf.org/doc/draft-mozleywilliams-dnsop-dnsaid/) · RFC 9460 (SVCB/HTTPS)

## Requirements (scanner)

- Records under `_agents` namespace (e.g. `_index._agents.circaevum.com`)
- ServiceMode `HTTPS` or `SVCB` with `alpn` and `port`
- **DNSSEC** enabled on the zone (validating resolvers get authenticated data)

## Records to add (Cloudflare DNS)

Zone: **circaevum.com** (DNS managed by Cloudflare if proxied).

| Name | Type | Content |
|------|------|---------|
| `_index._agents` | **HTTPS** | `1 circaevum.com. alpn="h3,h2" ipv4hint=auto ipv6hint=auto port=443` |
| `_docs._agents` | **HTTPS** | `1 circaevum.com. alpn="h2,h3" port=443` |

Cloudflare dashboard → **DNS** → **Add record** → type **HTTPS** (or **SVCB** if HTTPS is unavailable).

Example BIND form:

```dns
_index._agents.circaevum.com. 3600 IN HTTPS 1 circaevum.com. alpn="h3,h2" port=443
_docs._agents.circaevum.com.  3600 IN HTTPS 1 circaevum.com. alpn="h2,h3" port=443
```

Optional A2A placeholder (when an A2A agent exists):

```dns
_a2a._agents.circaevum.com. 3600 IN SVCB 1 agent.circaevum.com. alpn="a2a" port=443 mandatory=alpn,port
```

## DNSSEC

Cloudflare dashboard → **DNS** → **Settings** → **DNSSEC** → **Enable**.

Without DNSSEC, `dnsAid` may stay **fail** even with SVCB/HTTPS records.

## Validate

```bash
# Cloudflare DoH (same resolver family the scanner uses)
curl -s "https://cloudflare-dns.com/dns-query?name=_index._agents.circaevum.com&type=HTTPS" \
  -H "accept: application/dns-json" | jq .

curl -s -X POST https://isitagentready.com/api/scan \
  -H "Content-Type: application/json" \
  -d '{"url":"https://circaevum.com"}' | jq '.checks.discoverability.dnsAid'
```

## What this advertises

`_index._agents` points agents at the **public GL + discovery** origin (circaevum.com). Account API and Nakama remain on `app.circaevum.com` / `nakama.circaevum.com` — see [FOR-AGENTS.md](../docs/FOR-AGENTS.md).
