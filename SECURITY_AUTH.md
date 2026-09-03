# SabotPress authentication

SabotPress is a Vite application with server functions under `functions/api/*`. Public reading routes remain open while administrative routes and write APIs are protected server-side.

## Login

The default bootstrap login uses two production secrets:

- `SABOT_ADMIN_TOKEN`: the initial administrator login secret.
- `SABOT_SESSION_SECRET`: a separate long random secret used to sign editor sessions.

An editor signs in at `/login` or `/wp-login`. The server validates credentials, creates a signed session and sets an HttpOnly session cookie. The login secret is not returned to the frontend or stored in browser storage.

The session cookie uses `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` when the request is HTTPS. `SABOT_SESSION_TTL_SECONDS` can override the default session lifetime.

`POST /api/logout` clears the session.

## Individual users and roles

SabotPress also supports persisted administrator/editor accounts and capability-based roles. Authorization is enforced by server middleware and API permission checks rather than by whether a button happens to be visible in the browser.

Frontend state must never be treated as authorization.

## Server-side protection

`functions/_middleware.js` protects administrative/editor routes and non-public API writes. Individual write endpoints also resolve the authenticated site permission before saving, publishing, uploading or deleting data.

Draft and future-content reads are restricted to authorized editors.

## Optional identity proxy

A deployment may layer an identity-aware reverse proxy in front of SabotPress. The current Cloudflare deployment can accept a Cloudflare Access identity only when `SABOT_TRUST_CF_ACCESS=true`.

Do not enable trusted proxy identity headers unless the deployment actually prevents visitors from supplying those headers themselves.

For a Cloudflare deployment, Access policies may protect administrative paths such as `/admin*`, `/wp-admin*`, `/settings*`, `/users*`, `/media*`, `/sites*`, `/podcasts*`, `/printlab*` and the corresponding write API routes.

Other hosting adapters should provide an equivalent trusted authentication boundary if they expose proxy-authenticated identities.

## Secret handling

- Never commit production secrets to this repository.
- Use different random values for login and session signing.
- Rotate `SABOT_SESSION_SECRET` when all active signed sessions need to be invalidated.
- Keep database and object-storage credentials in the deployment's secret/configuration system.
- Backups containing account, configuration or editorial data should be protected like the production database.

## Deployment notes

Authentication depends on HTTPS in production. A normal editor should not have to understand the session implementation; deployment-specific diagnostics belong in Site Health and operator documentation.
