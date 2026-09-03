# Media Assets Setup

SabotPress media uses two persistent layers:

- D1 binding `BF_DB` for the media registry and editorial metadata.
- Cloudflare R2 binding `SABOT_MEDIA_BUCKET` for uploaded binary files.

`SABOT_MEDIA_BUCKET` is the canonical R2 binding name. Older deployments may still be recognized through legacy aliases in the Function code, but new and repaired environments should use the canonical name.

## Cloudflare binding

In Cloudflare Dashboard open:

**Workers & Pages → sabotmedia → Settings → Functions / Bindings → R2 bucket bindings**

Add an R2 bucket binding with variable name:

`SABOT_MEDIA_BUCKET`

Bind it to the bucket that should contain Sabot Media uploads. The production Pages environment must also keep the existing D1 binding `BF_DB`.

If `SABOT_MEDIA_BUCKET` is missing, `/api/media/files` returns a visible 503 and uploads are not converted into browser-local data URLs.

## D1 schema

Fresh databases can apply:

- `db/media_assets.sql`

The Pages Function also performs idempotent schema initialization. Existing `media_assets` tables are upgraded by adding `metadata_json` when needed, so older records are preserved.

The registry persists:

- title
- public/download URL
- alt text
- caption
- description
- credit and attribution
- creator
- license and license URL
- source / landing-page URL
- folder
- tags
- media type and MIME type
- filename, extension, and size
- R2 storage key
- source type
- created/updated timestamps

## Backend routes

- `/api/media/files` uploads and serves binary media.
- `/api/media-assets` reads and edits persistent D1 metadata.

An upload is considered successful only after both R2 storage and D1 registry persistence succeed. If D1 registration fails after R2 upload, the Function attempts to delete the uploaded object and returns an error.

## Legacy browser media

Older SabotPress versions stored upload records or data URLs in localStorage. The Media Library detects those records and shows a recovery section instead of mixing them into the authoritative library or picker.

- Existing persistent server URLs can be explicitly registered in D1.
- Browser-only `data:` media must be re-uploaded from the original file.

No localStorage media record is treated as a successful production upload.
