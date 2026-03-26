# Selflify — runbook and Codex prompt

## What is already implemented

This setup is a self-hosted preview platform for static SPA deployments with:

- preview environments for PRs, branches, and tags
- stable environment per site
- wildcard subdomains per site
- automatic HTTPS via Caddy + Cloudflare DNS challenge
- deploys uploaded by CI via `rsync` to the server
- root portal page on `sendsay.dev`
- preview cleanup script
- config-driven generation via `sites.json`

Current naming examples:

- stable: `app.sendsay.dev`
- PR preview: `pr-6825.app.sendsay.dev`
- branch preview: `feature-login.app.sendsay.dev`
- tag preview: `v3-189-2.app.sendsay.dev`

## Current architecture

### Server side

Deployed files live on disk:

```text
/var/www/
  app/
    stable/
    pr-6825/
    feature-login/
    v3-189-2/
  transport/
  x-editor/
  storybook/
```

Caddy serves files directly from `/var/www/...`.

Root portal page:

- `https://sendsay.dev`

Per-site stable:

- `https://<site>.sendsay.dev`

Per-site preview:

- `https://<deploy>.<site>.sendsay.dev`

### DNS

Cloudflare is used as DNS provider.

For each site, two A records are needed:

- `<site>.sendsay.dev` → server IP
- `*.<site>.sendsay.dev` → server IP

Both should be `DNS only`, not proxied.

### TLS

Caddy uses Cloudflare DNS challenge with:

```text
CLOUDFLARE_API_TOKEN
```

Wildcard certificates are used for each site group, for example:

- `*.app.sendsay.dev`
- `*.storybook.sendsay.dev`

## Current config model

Main config file:

```text
~/sites.json
```

Example:

```json
{
  "domain": "sendsay.dev",
  "sites": {
    "root": {
      "login": "login",
      "password_hash": "djkasd21kl231231da31231",
      "dir": "/var/www"
    },
    "chatbots": {
      "login": "login",
      "password_hash": "djkasd21kl231231da31231",
      "main_branch": "stable",
      "dir": "/var/www/chatbots"
    },
    "storybook": {
      "main_branch": "stable",
      "dir": "/var/www/storybook"
    }
  }
}
```

### Meaning of fields

- `domain` — base domain
- `sites.root` — settings for root portal page `sendsay.dev`
- `login` / `password_hash` — optional basic auth credentials
- `main_branch` — stable deploy folder name
- `dir` — filesystem path where site deploys live

## Generated files and scripts

### 1. Caddyfile

Generated into:

```text
~/Caddyfile
```

### 2. Root preview portal

Generated into:

```text
/var/www/index.html
```

by:

```text
~/generate-preview-ui.sh
```

### 3. Cleanup script

```text
~/cleanup-previews.sh
```

Deletes deploys older than 30 days for all sites except the main branch directory.

### 4. Caddy config generator

```text
~/generate-caddyfile.sh
```

Reads `~/sites.json` and regenerates `~/Caddyfile`.

## Current Docker setup

Files live directly in `~/`:

```text
~/
├── Dockerfile
├── docker-compose.yml
├── Caddyfile
├── .env
├── sites.json
├── generate-preview-ui.sh
├── cleanup-previews.sh
├── generate-caddyfile.sh
```

### Dockerfile

```dockerfile
FROM caddy:builder AS builder

RUN xcaddy build \
    --with github.com/caddy-dns/cloudflare

FROM caddy:latest
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
```

### docker-compose.yml

```yaml
version: "3.9"

services:
  caddy:
    build: .
    container_name: caddy
    restart: unless-stopped

    ports:
      - "80:80"
      - "443:443"

    environment:
      - CLOUDFLARE_API_TOKEN=${CLOUDFLARE_API_TOKEN}

    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - ./data:/data
      - ./config:/config
      - ./logs:/var/log/caddy
      - /var/www:/var/www

    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

### .env

```env
CLOUDFLARE_API_TOKEN=your_cloudflare_token
```

## Current Caddy behavior

### Features

- serves SPA deployments
- uses `try_files {path} {path}/ /index.html`
- enables compression:
  - `gzip`
  - `zstd`
- sets cache headers
- disables indexing with `X-Robots-Tag`
- supports root portal basic auth
- supports optional per-site preview basic auth
- writes rotated access logs

### Label logic

For a host like:

```text
release-3-189-30.app.sendsay.dev
```

Caddy routes preview hostnames using the preview part of the host and maps them to directories like:

```text
/var/www/app/release-3-189-30
```

## Current scripts

### `~/generate-preview-ui.sh`

Responsibilities:

- read `~/sites.json`
- build `index.html` for `sendsay.dev`
- show all stable and preview environments
- show deployment size for each entry
- open deploy links in new tab with:
  - `target="_blank"`
  - `rel="noopener noreferrer"`

### `~/cleanup-previews.sh`

Responsibilities:

- read all sites from `~/sites.json`
- delete deploy directories older than 30 days
- never delete the configured main branch
- regenerate root portal page afterward

### `~/generate-caddyfile.sh`

Responsibilities:

- read `~/sites.json`
- generate `~/Caddyfile`
- configure:
  - root portal
  - per-site stable routing
  - per-site preview routing
  - optional basic auth
  - compression
  - noindex headers
  - cache headers
  - log rotation

## CI/CD flow

GitHub Actions workflow deploys each site build with `rsync`.

Environment naming currently works like this:

- PR → `pr-<number>`
- tag → tag name directly, with `/` and `.` normalized to `-`
- branch → branch name directly, with `/` and `.` normalized to `-`
- stable branch → `stable`

So examples become:

- `pr-6846`
- `release-3-189-30`
- `v3-189-2`
- `stable`

### Deploy target

Build output is copied to:

```text
/var/www/<site>/<env_name>/
```

### PR comment

Workflow posts a comment with preview URLs for each site.

## Operational notes

### Add a new site manually today

1. Add DNS records in Cloudflare:
   - `<site>.sendsay.dev`
   - `*.<site>.sendsay.dev`
2. Create site directory:
   - `/var/www/<site>/stable`
3. Add site to `~/sites.json`
4. Regenerate config:
   - `~/generate-caddyfile.sh`
5. Regenerate root portal:
   - `~/generate-preview-ui.sh`
6. Restart Caddy:
   - `docker compose restart caddy`
7. Add site to CI matrix in GitHub Actions

## Suggested Selflify product direction

Replace the static `sendsay.dev` portal with a real admin panel called **Selflify**.

### Product goals

Selflify should be a self-hosted service that:

- can be deployed on any server
- manages config files instead of a database
- manages sites and deploys for static SPA projects
- can be used to run this preview platform without manual file editing

### Branding

- name: `Selflify`
- dark theme
- primary brand color: `#a12141`
- UI style inspired by Netlify
- interface language: English

## Requested admin panel requirements

### General

- build with Next.js
- self-hosted in Docker
- no database
- update current config files directly
- deploy to `sendsay.dev` instead of the current generated HTML portal
- only one account
- on first open, show setup screen to create login and password

### Main dashboard

- list of all sites
- show total disk size on server
- show used server disk size on server
- show used size per site

### Site details page

For each site:

- site name
- main branch
- path to files
- optional login/password
- list of deploys
- show main branch deploy at the top
- all other deploys sorted by latest file modification time descending
- show size per deploy

### Global settings page

- server IP
- domain name
- Cloudflare API token
- root login/password

## Codex prompt

Use this prompt with Codex.

---

You are building a production-ready self-hosted admin panel called **Selflify**.

## Goal

Create a dark-themed Next.js application that replaces the current static root preview page at `sendsay.dev`.

This app manages a self-hosted preview platform for static SPA deployments.

It must not use a database.
It must read and write the existing filesystem config files directly.

## Branding and UI

- App name: **Selflify**
- Theme: dark
- Brand color: `#a12141`
- Interface language: English
- Visual inspiration: Netlify
- Clean, modern SaaS admin UI
- Use cards, side navigation, top summary widgets, empty states, and polished tables

## Deployment model

The whole app must be delivered as a self-hosted Dockerized service.

It should be possible to deploy it on any server.

The app should manage and update the existing files:

- `~/sites.json`
- `~/generate-preview-ui.sh`
- `~/cleanup-previews.sh`
- `~/generate-caddyfile.sh`
- `~/Caddyfile`

It should also know that deploy directories live in paths like:

- `/var/www/app/stable`
- `/var/www/app/pr-6825`
- `/var/www/storybook/release-3-189-30`

## Current config format

There is a JSON config file at `~/sites.json`:

```json
{
  "domain": "sendsay.dev",
  "sites": {
    "root": {
      "login": "login",
      "password_hash": "hash",
      "dir": "/var/www"
    },
    "chatbots": {
      "login": "login",
      "password_hash": "hash",
      "main_branch": "stable",
      "dir": "/var/www/chatbots"
    },
    "storybook": {
      "main_branch": "stable",
      "dir": "/var/www/storybook"
    }
  }
}
```

## Authentication

There is only one account for the admin panel.

Requirements:

- On first open, if no admin credentials are configured yet, show a setup screen
- The setup screen should ask for:
  - login
  - password
- Store credentials by updating the config-based system, not a database
- After setup, require login to access the admin panel
- Use secure password hashing
- Session-based authentication is fine
- The root portal may continue using basic auth if needed, but the admin panel itself should have a proper login screen

## Features

### 1. Dashboard

Main page should show:

- all sites
- total server disk size
- used server disk size
- used disk size by each site

### 2. Site list

For each site, show:

- site name
- main branch
- filesystem path
- total size used by this site
- number of deploys
- quick link to open stable
- quick link to open site details

### 3. Site details page

For each site:

- name
- main branch
- files path
- optional preview login
- optional preview password
- save button

Also show deploy list:

- main branch deploy pinned at top
- all others below
- sort non-main deploys by latest file modification time descending
- show:
  - deploy name
  - size
  - last modified time
  - URL
  - open action
  - delete action

### 4. Global settings page

Show editable fields:

- server IP
- domain name
- Cloudflare API token
- root login
- root password

Saving should update the config-driven system and regenerate relevant files.

## File regeneration behavior

Whenever settings change, the app must be able to:

- update `~/sites.json`
- regenerate `~/generate-preview-ui.sh` if needed
- regenerate `~/cleanup-previews.sh` if needed
- regenerate `~/generate-caddyfile.sh` if needed
- regenerate `~/Caddyfile`
- optionally run the shell scripts or restart related services when requested

Design this safely.

## Required implementation details

- Next.js app router
- TypeScript
- strong filesystem-based architecture
- API routes or server actions for reading/writing config
- validation for all editable fields
- reusable UI components
- dark theme throughout
- responsive layout
- Dockerfile for the app
- docker-compose example for running Selflify
- use environment variables only where appropriate
- no database
- no Prisma
- no ORM

## Suggested structure

Implement something like:

- `/app/login`
- `/app/setup`
- `/app/dashboard`
- `/app/sites`
- `/app/sites/[site]`
- `/app/settings`

Use a filesystem service layer to:

- read `sites.json`
- compute disk usage with shell commands or Node APIs
- inspect deploy directories
- sort deploys by modified time
- write config changes safely
- regenerate derived files

## Important UX details

- make the dashboard feel like a real hosting control panel
- include empty states
- include loading states
- include confirmation before deleting a deploy
- use the brand color `#a12141` consistently
- make the site details page especially polished

## Output

Produce:

1. the full Next.js application
2. Dockerfile
3. docker-compose example
4. config/file service layer
5. authentication flow
6. implementation notes for deployment on a server

Make it production-minded, clean, and easy to extend.

---

## Suggested next step

1. Save this file as project documentation
2. Feed the Codex prompt into Codex
3. Let the generated admin panel replace the static root portal on `sendsay.dev`
