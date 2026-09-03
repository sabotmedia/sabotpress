# SabotPress

SabotPress is free publishing software for independent media projects, editorial collectives, archives, podcasts, campaigns, and print work.

It covers publishing work that otherwise tends to get split between a CMS and a pile of separate tools: articles, projects, media, feeds, podcasts, campaigns, translations, print layouts, basic audio work, analytics, users, and site settings.

## Three ways to use it

### Try in the browser

The browser/PWA edition is local-first. Open it, start a publication, and work without an account or a domain. Structured data and media stay in browser storage until you explicitly export or publish them. After the first successful load the installed PWA can keep the core writing/editing interface available offline.

Browser storage belongs to that browser profile and origin. Clearing site data can erase the local copy, so use SabotPress portable backups for anything you care about.

See [`docs/BROWSER_PWA.md`](docs/BROWSER_PWA.md).

### Download the desktop app

The Electron edition stores structured data in local SQLite and media in the computer's application-data folder. It is the better fit for large media libraries, heavier AudioLab/PrintLab use, filesystem access, and people who want a standalone offline application.

See [`docs/DESKTOP.md`](docs/DESKTOP.md) and the GitHub Releases page for Windows, macOS, and Linux builds.

### Self-host SabotPress

The server edition is for a shared publication with normal user accounts, server-backed storage, and a public web address. The current backend supports Cloudflare Pages/Workers-style Functions with D1 and R2-compatible storage, with provider-neutral deployment work kept behind adapters where possible.

See [`docs/INSTALL.md`](docs/INSTALL.md).

## Publishing modules

The admin can be reduced to only the tools a publication uses. A simple blog can keep Articles and Media visible while hiding Campaigns, Publications, AudioLab, PrintLab, Podcasts, and translation tools until they are needed.

Presets during first run provide a quick starting point:

- Simple Blog
- Media Publication
- Everything
- Custom

## Portable publications

Browser and desktop editions share a portable `.sabotpress` backup format. A backup can include publication setup, native content, collections, publication/print projects, podcast settings, campaigns, translations, public site configuration, feed settings, media metadata, and embedded local media files.

That makes the local-first browser edition an entry point rather than a trap. Work can move to desktop or a compatible hosted SabotPress instance without rebuilding the publication by hand.

## Development

```bash
npm install
npm run dev
```

Browser-local/PWA development:

```bash
npm run dev:pwa
```

Production builds:

```bash
npm run build
npm run build:pwa
```

Full checks:

```bash
npm run check
```

People migrating from Noblogs/WordPress should also read [`docs/NOBLOGS_MIGRATION.md`](docs/NOBLOGS_MIGRATION.md).

## Storage boundaries

The three editions deliberately use different authoritative stores:

- browser/PWA: IndexedDB for publication records and media blobs
- desktop: local SQLite plus filesystem media
- self-hosted/server: configured database and object storage

Browser localStorage is used only for small UI/cache/reminder state, not as a second source of truth for publication content. Local editions do not require a login. Server editions keep the existing authentication and Users & Access model.

A fresh SabotPress install is software, not a copy of another publication. Publication-specific articles, campaigns, accounts, credentials, domains, and branding are not supposed to be defaults.
