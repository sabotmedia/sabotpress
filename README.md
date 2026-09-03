# SabotPress

SabotPress is a free, self-hostable publishing platform for independent media projects, editorial collectives, archives, podcasts, campaigns, and print work.

It is meant to cover publishing work that otherwise tends to get split between a CMS and a pile of separate tools: articles, projects, media, feeds, podcasts, campaigns, translations, print layouts, basic audio work, analytics, users, and site settings.

## Where it fits

SabotPress is the publishing layer. A standalone install still needs somewhere to run and, for a normal public site, a domain and DNS provider.

A basic independent setup looks like:

`domain + DNS + hosting + SabotPress`

For a plain blog, WordPress is a mature and reasonable option. SabotPress starts to make more sense when a publication also needs podcasts, campaigns, print/PDF work, translations, archives, contributor workflows, or audio tools and would otherwise assemble those from plugins and separate applications.

The admin can be reduced to only the publishing modules a site uses. A simple blog can keep Articles and Media visible while hiding Campaigns, Publications, AudioLab, PrintLab, Podcasts, and translation tools until they are needed.

## Quick start

```bash
npm install
npm run dev
```

For a production build:

```bash
npm run build
```

For a fresh standalone installation, start with [`docs/INSTALL.md`](docs/INSTALL.md). People migrating from Noblogs/WordPress should also read [`docs/NOBLOGS_MIGRATION.md`](docs/NOBLOGS_MIGRATION.md).

## Storage and deployment

The current backend is designed around Cloudflare Pages/Workers-style functions with D1 for structured data and R2-compatible object storage for media. The application code is kept separate from publication content, so a fresh install starts without the source publication's articles, campaigns, podcast archive, or editorial files.

Production installs need their own database bindings, storage bindings, authentication secrets, domain settings, publication identity, and public-facing copy. Do not reuse credentials or deployment configuration from another installation.
