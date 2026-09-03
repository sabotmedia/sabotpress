# Publish SabotPress online

You do not need a domain or paid hosting to start using SabotPress. The desktop edition keeps the publication on your own computer until you decide to make it public.

The project goal is simple: there should always be a usable **$0 public-publishing route** where a supported free host is available. A custom domain is optional.

## $0 route: hosted SabotPress on a free tier

The currently supported web deployment is Cloudflare Pages/Workers-style Functions with D1 and R2-compatible media storage. Cloudflare offers no-cost tiers for these services at the time this guide was written. Provider limits and free plans can change, so check the provider's current limits before moving a large publication.

You need:

1. a free Cloudflare account
2. a copy of the SabotPress repository in a Git host Cloudflare can deploy from
3. one D1 database bound as `BF_DB`
4. one R2 bucket bound as `SABOT_MEDIA_BUCKET`
5. `SABOT_ADMIN_TOKEN` and `SABOT_SESSION_SECRET` set as secrets

Build command:

```text
npm run build
```

Build output:

```text
dist
```

A free provider address is enough to publish. You do not have to buy a domain.

## I already own a domain

Keep the same free hosting and add the domain you already own.

In SabotPress Desktop open:

**Publish → Publish Online → I already own a domain**

or open **Settings → Domain setup**.

SabotPress stores the hostname and shows the DNS target supplied by the deployment. Add that record at the service that manages your DNS. Do not copy DNS values from another person's installation.

The only recurring cost in this setup can be the domain registration itself.

## Community hosting

This is the closest model to Noblogs: somebody else maintains the server and you maintain the publication.

A compatible host needs to provide:

- the SabotPress application runtime
- a persistent SQL-compatible database
- persistent media/object storage
- HTTPS
- backups
- a public hostname or subdomain
- a way to upgrade SabotPress without deleting publication data

A host can give users a free subdomain and keep custom domains optional.

## Publish from your own computer

A desktop machine can technically be exposed to the public internet, but that is not the default recommendation. The computer has to remain online and the operator becomes responsible for network exposure, HTTPS, updates and backups.

Temporary tunneling services can be useful for previews and testing. They should not be presented as permanent hosting unless the operator understands the tradeoffs.

## VPS / Docker

Running your own server gives the most control but requires more maintenance. See `docs/INSTALL.md` for the current deployment requirements. A Docker distribution is intended to make this route progressively less tedious.

## Cost rule

SabotPress itself is free software. A person should be able to:

- install and use it locally for $0
- create and edit a publication for $0
- publish using a supported free-hosting address for $0 where such a tier is available
- add a custom domain only if they want one

Do not design first-run setup around the assumption that the user has money for hosting or a domain.
