# SabotPress V1 Architecture

This pass introduces platform boundaries without changing the public UI.

## Folder Layout

- `src/models/` holds canonical publication shapes and adapters from legacy content.
- `src/assets/` discovers typed assets from posts, media records, and print links.
- `src/renderers/` turns normalized posts into pure render data for React views.
- `src/print/` owns print layout generation through `printEngine.render()`.
- `src/editors/` defines reusable editor descriptors for future admin screens.
- `src/workspaces/` defines workspace descriptors, starting with Printlab.
- `src/stores/` provides centralized stores and hooks for publication, print, media, editor, project, and search state.
- `src/routing/` centralizes public and admin route constants.
- `src/components/library/` names the reusable UI primitives to extract from existing admin screens.

## Publication Model

`src/models/publication.js` defines the reusable model layer:

- `Publication`
- `Issue`
- `Post`
- `Page`
- `Asset`
- `Media`
- `Collection`
- `Project`
- `Taxonomy`
- `PrintAsset`

Legacy `piece` records are adapted through `normalizePost()`. Editing data lives under `post.editing`; render data lives under `post.rendering`. Components should consume normalized posts or renderer output instead of inventing local shapes.

## Asset Model

`src/assets/assetSystem.js` introduces typed assets:

- `readerHtml`
- `readerPdf`
- `printPdf`
- `bookletPdf`
- `coverImage`
- `thumbnail`
- `hero`
- `featuredImage`
- `audio`
- `video`
- `download`

Public pages can call `attachPostAssets()` or `discoverPostAssets()` and then ask which assets exist.

## Render Pipeline

The render flow is:

`Legacy/native piece -> normalizePost() -> attachPostAssets() -> renderPost() -> React view`

Renderers output pure data and do not import React. Initial renderers exist for:

- Article
- Comic
- Podcast
- Newsletter
- Zine
- Poster
- Tile Sheet
- Print Layout
- Half Fold
- Canvas

`PiecePage` now reads hero/body/eyebrow data from the renderer pipeline while preserving its existing markup.

## Print Engine

All print layout data should come from:

`printEngine.render(post, { layout, options })`

Supported layout targets:

- Article
- Poster
- Tile
- Booklet
- Single Page
- Zine Sheet

`PrintPage` and `PrintLabPage` now use the print engine for print render data. Future sticker and button output should be added as new layouts in `src/print/printEngine.js`, not inside React components.

## Editor Framework

`src/editors/` now contains descriptor modules for:

- `ArticleEditor`
- `PublicationEditor`
- `CanvasEditor`
- `PrintAssetEditor`
- `ProjectEditor`
- `MediaEditor`
- `TaxonomyEditor`

These are framework descriptors for the next pass. Existing admin pages remain in place to avoid visual and behavioral churn.

## Workspace Framework

`src/workspaces/printlab.js` defines Printlab as the first workspace. Future workspaces should follow the same descriptor pattern:

- Article Studio
- Project Studio
- Media Studio
- Theme Studio
- Printlab

## Routing

`src/routing/routes.js` defines normalized routes.

Public:

- `/post/:slug`
- `/archive`
- `/project/:slug`
- `/about`
- `/contact`
- `/support`
- `/submit`
- `/print/:slug`
- `/zine/:slug`

Admin:

- `/wp-admin`
- `/wp-admin/posts`
- `/wp-admin/media`
- `/wp-admin/projects`
- `/wp-admin/printlab`
- `/wp-admin/settings`

Legacy routes are still registered so existing links continue to work.

## Future Extension Points

- Move existing admin screens behind editor descriptors one at a time.
- Replace duplicated admin panels with concrete components from `src/components/library/`.
- Persist store state only after each store has a clear ownership boundary.
- Add database-backed publication, issue, asset, and print asset records.
- Expand `printEngine.render()` with sticker, button, and imposed booklet layouts.
