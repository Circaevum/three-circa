# auth.md — Circaevum agent authentication

**Scope:** Circaevum **account & storage** (Path B in [FOR-AGENTS.md](https://circaevum.com/docs/FOR-AGENTS.md)).  
**Not required** to embed the Graphics Library with your own auth (Path A).

| System | Auth |
|--------|------|
| **circaevum.com** (GL) | Auth-free viewer — ingest via `postMessage` / `getGL()` from **your** host |
| **app.circaevum.com** | Human login / registration (Yin-portal) |
| **nakama.circaevum.com** | Session JWT for storage, RPC, calendars, Garmin |

## Path A — GL only, your auth

If you only need the 3D timeline:

1. Embed `https://circaevum.com/index.html?viewer=1` (or self-host [three-circa](https://github.com/Circaevum/three-circa)).
2. Authenticate users in **your** system.
3. Push events with `CIRCAEVUM_INGEST_EVENTS` — no Nakama, no OAuth discovery on this site.

See [FOR-AGENTS.md — Path A](https://circaevum.com/docs/FOR-AGENTS.md#path-a--gl-only-bring-your-own-auth-most-common-for-custom-agents).

## Path B — Circaevum account (this document)

Agents that need Circaevum-managed calendars, layers, or Garmin data use the account stack below.

### Discovery (machine-readable)

| Document | URL |
|----------|-----|
| OAuth Authorization Server (RFC 8414) | https://circaevum.com/.well-known/oauth-authorization-server |
| OpenID Provider configuration | https://circaevum.com/.well-known/openid-configuration |
| OAuth Protected Resource (RFC 9728) | https://circaevum.com/.well-known/oauth-protected-resource |
| JWKS | https://circaevum.com/.well-known/jwks.json |
| Integrator reference | https://circaevum.com/docs/FOR-AGENTS.md |

Protected-resource metadata describes **Nakama-backed storage**, not the auth-free GL iframe.

### How agents obtain access

1. **Browser / human-in-the-loop** — open https://app.circaevum.com/ and sign in (email + password). The Yin-portal holds the Nakama session in the browser.
2. **Programmatic (Nakama REST)** — exchange email credentials for a session JWT:
   - `POST https://nakama.circaevum.com/v2/account/authenticate/email?create=false`
   - HTTP Basic auth with the Nakama **server key** (application credential, not end-user password)
   - JSON body: `{ "email": "...", "password": "..." }`
   - Response includes `token` and `refresh_token` for subsequent RPC and storage calls.
3. **Refresh** — `POST https://nakama.circaevum.com/v2/account/session/refresh` with the refresh token.

Storage collections (`events`, `layers`, `garmin_*`, …) are documented in [circaevum-spec](https://github.com/Circaevum/circaevum-spec).

**Note:** Nakama session JWTs are validated by the Nakama server (symmetric signing). The JWKS document on circaevum.com is published for discovery compliance; public signing keys are not used for Nakama-issued session tokens today.

## agent_auth

Machine-readable `agent_auth` is published in:

- `/.well-known/oauth-authorization-server` (RFC 8414)
- `/.well-known/oauth-protected-resource` (RFC 9728)

```json
{
  "agent_auth": {
    "skill": "https://circaevum.com/auth.md",
    "register_uri": "https://app.circaevum.com/",
    "claim_uri": "https://app.circaevum.com/",
    "identity_types_supported": ["anonymous"],
    "anonymous": {
      "credential_types_supported": ["access_token"]
    }
  }
}
```

### Registration methods (Path B)

| Method | How |
|--------|-----|
| **Browser** | Open `register_uri` — sign up or log in at app.circaevum.com (Yin-portal + Nakama session JWT) |
| **Nakama REST** | `POST https://nakama.circaevum.com/v2/account/authenticate/email` with server key — see [FOR-AGENTS.md](https://circaevum.com/docs/FOR-AGENTS.md) |

**Path A (GL only):** no registration on circaevum.com — embed `?viewer=1` and use your auth + `CIRCAEVUM_INGEST_EVENTS`. See [Path A](https://circaevum.com/docs/FOR-AGENTS.md#path-a--gl-only-bring-your-own-auth-most-common-for-custom-agents).
