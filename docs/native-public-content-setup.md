# Native Public Content Setup

This phase moves native public content out of local-only bridge storage and into the backend when `BF_DB` is available.

## Apply schema
Run the SQL in:

- `db/native_public_content.sql`

Use the Cloudflare D1 dashboard query editor or your normal deploy workflow.

## Required binding
Pages/Workers environment must expose:

- `BF_DB`

## Edit permissions
Uses the same permission path as public site config:

- `SABOT_ADMIN_TOKEN`
- or `PUBLIC_CONFIG_OPEN_EDIT=true`

Recommended:
- use `SABOT_ADMIN_TOKEN`
- do not leave write access open in production

## API route
Backend route:

- `/api/native-content`

Supported:
- `GET /api/native-content`
- `GET /api/native-content?id=...`
- `GET /api/native-content?slug=...`
- `POST /api/native-content`
- `DELETE /api/native-content?id=...`

## Fallback behavior
If backend is unavailable:
- frontend falls back to local storage
- bridge UI remains usable
- backend becomes source of truth once available
