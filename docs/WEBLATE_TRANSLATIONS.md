# Weblate translations in SabotPress

SabotPress keeps editorial publishing authority in D1 while Weblate provides the collaborative translation workspace.

## What this integration does

- Stores translations separately from the canonical source article.
- Supports `draft`, `in_review`, `approved`, `published`, and `archived` translation states.
- Records translator and reviewer credit.
- Records the Weblate component URL when a translation comes from Weblate.
- Exposes only `published` translations to public readers.
- Adds published translations to the public article language selector.
- Preserves existing externally hosted translations, such as community translations on independent sites.
- Renders Sabot-hosted translations on the original article URL with `?lang=<code>`.
- Sanitizes translated HTML before it is inserted into the public article.

Publishing a translation remains an editorial action. Weblate completion does not automatically mean publication.

## API

### List public translations

`GET /api/native-translations?slug=<article-slug>`

Only published translations are returned to non-editors.

### List all translations for editorial review

`GET /api/native-translations?slug=<article-slug>&includeUnpublished=1`

Requires an authenticated editor.

### Export source text for Weblate

`GET /api/native-translations?slug=<article-slug>&format=weblate-source`

Requires an authenticated editor. The returned `bundle` is intentionally translation-only JSON:

```json
{
  "title": "…",
  "excerpt": "…",
  "bodyHtml": "…",
  "seoTitle": "…",
  "seoDescription": "…"
}
```

Do not add IDs, slugs, workflow states, or other metadata to the Weblate source file. Weblate treats JSON string values as translation units, so operational metadata does not belong in the translatable file.

### Import or update a Weblate translation

`POST /api/native-translations`

Example request body:

```json
{
  "slug": "the-server-called-paranoia",
  "languageCode": "it",
  "languageLabel": "Italiano",
  "status": "in_review",
  "provider": "weblate",
  "translatorCredit": "A/I translation group",
  "weblateUrl": "https://weblate.example.org/projects/sabot/ai-paranoia/it/",
  "weblateBundle": {
    "title": "…",
    "excerpt": "…",
    "bodyHtml": "…",
    "seoTitle": "…",
    "seoDescription": "…"
  }
}
```

The endpoint requires Sabot editorial authentication. After review, update `status` to `approved` or `published` with another POST/PUT.

## Recommended Weblate component settings

For one article component:

- Source language: English
- File format: JSON or JSON nested structure
- Monolingual base file: the exported English JSON
- Target files: one JSON file per language
- Repository workflow: GitHub pull requests when repository-backed synchronization is added

Weblate supports standard JSON and nested JSON translation files. Keep the article strings in a normal JSON file rather than inventing a Sabot-specific localization format.

## A/I campaign workflow

1. Export the canonical English A/I article from Sabot.
2. Add that JSON as the English base file in the A/I Weblate component.
3. Give translators the Weblate project/component link instead of Sabot admin access.
4. Translators work and review in Weblate.
5. Import the completed target-language JSON into Sabot with status `in_review`.
6. An editor checks the rendered translation and attribution.
7. Change the translation to `published`.
8. The language appears automatically in the article language selector and is available at `/post/the-server-called-paranoia?lang=<code>`.

Existing community translations hosted elsewhere can remain external links. They do not have to be copied into Sabot or falsely presented as Sabot/Weblate translations.

## Database

The schema is defined in `db/native_public_content_translations.sql`. Runtime initialization also lives in `functions/api/_lib/nativePublicTranslations.js`, following the existing Cloudflare D1 initialization pattern used elsewhere in SabotPress.
