# Weblate → Sabot automatic translation sync

Goal: remove manual JSON download/upload from the newsroom workflow while keeping Sabot as the final publication authority.

## Runtime contract

Sabot supports two complementary sync paths:

1. **Current-state sync:** opening the authenticated Sabot Translations admin triggers `POST /api/weblate-sync`, which asks Weblate for all languages currently present in the configured component and imports them into D1 as `in_review`. This is what picks up translations that were uploaded before webhook automation existed.
2. **Future event sync:** Hosted Weblate sends signed Standard Webhooks to `POST https://sabot.media/weblate-webhook` for translation completion/upload events. Sabot fetches the current language file from Weblate and refreshes the corresponding D1 review record.

Neither path publishes automatically.

The webhook endpoint:

1. Verifies `webhook-id`, `webhook-timestamp`, and `webhook-signature` using Standard Webhooks HMAC-SHA256 and `WEBLATE_WEBHOOK_SECRET`.
2. Rejects stale/replayed/invalid deliveries.
3. Only accepts configured project/component mappings (`sabotpress` / `ai-server-called-paranoia` → `the-server-called-paranoia` initially).
4. Handles `Translation completed`, `Translation uploaded`, and `Resource updated` events and safely ignores unrelated events.
5. Fetches the current JSON translation file using `WEBLATE_API_TOKEN` and `GET /api/translations/{project}/{component}/{language}/file/`.
6. Imports through the existing native translation schema with `status=in_review`, provider `weblate`, attribution/provenance, and an audit entry.
7. Never publishes automatically.

## Environment

Cloudflare Pages production environment needs:

- `WEBLATE_API_TOKEN`: Weblate API token used server-side only for listing languages and fetching translation files.
- `WEBLATE_WEBHOOK_SECRET`: Standard Webhooks base64 secret shared with the Weblate Webhook add-on.
- Optional `WEBLATE_BASE_URL`: defaults to `https://hosted.weblate.org`.

Secrets must be configured as encrypted environment variables, never committed to the repository.

## Weblate configuration

In the `A/I — The Server Called Paranoia` component, install the **Webhook** add-on:

- URL: `https://sabot.media/weblate-webhook`
- Change events: `Custom`
- Selected events: `Translation completed`, `Translation uploaded`, and `Resource updated`
- Secret: the same base64 Standard Webhooks secret stored in Cloudflare as `WEBLATE_WEBHOOK_SECRET`

`Translation uploaded` matters because Weblate explicitly does not emit `Translation completed` for uploads or bulk edits.

## Editorial behavior

Every automatic Weblate import lands in Sabot as `in_review`. Editors still explicitly approve/publish from Publishing → Translations. Manual JSON import remains only as a fallback for outages or unusual external translation sources.
