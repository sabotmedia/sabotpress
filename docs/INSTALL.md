# Installing SabotPress

SabotPress is the publishing layer. It does not sell a domain or act as a DNS provider.

A normal independent setup has four pieces: a domain, DNS, hosting, and SabotPress. The domain can be attached after the application is already running, so somebody can reach the newsroom and publish before learning DNS.

## Supported production setup today

The current supported production architecture is Cloudflare Pages/Workers-style Functions with:

- a D1 database bound as `BF_DB`
- persistent R2-compatible media storage bound as `SABOT_MEDIA_BUCKET`
- the Vite frontend build
- the Functions under `functions/`

Required secrets are `SABOT_ADMIN_TOKEN` and `SABOT_SESSION_SECRET`.

## First login

1. Deploy the application.
2. Open `/login` and sign in.
3. Open the newsroom.
4. Choose **Simple Blog**, **Media Publication**, **Everything**, or a custom set of publishing tools.
5. Enter the publication name and optional editor/logo information.
6. Finish setup and start with **New Article**.
7. Connect a public domain later from Settings when ready.

Module choices and publication identity are stored in the site database so every editor sees the same interface.

## Domain setup

SabotPress is provider-neutral. The deployment adapter reports the DNS record the current host expects. Copy that record into whichever service currently manages DNS, then confirm the host sees the domain and HTTPS is active.

Never copy a DNS target from somebody else's SabotPress installation.

## Other hosts

Docker/VPS support is a target, but it should not be advertised as one-command deployment until a recipe supplies the frontend runtime, server/API runtime, persistent SQL-compatible storage, persistent media storage, secrets, scheduled jobs, backups, routing, HTTPS, and upgrades.
