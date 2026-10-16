# Selflify CLI

Deploy a static SPA build to a Selflify server over HTTPS. The package requires Node.js 20 or later and does not require SSH or rsync.

Install the package in the project that produces your build:

```bash
yarn add -D @selflify/selflify-cli
```

Create a deploy token in your site's Configuration screen. Store the token as `SELFLIFY_DEPLOY_TOKEN` in your CI secrets, and set `SELFLIFY_SERVER` to the HTTPS origin of your Selflify panel.

```bash
yarn selflify deploy ./dist --site app --deploy pr-123
```

For a stable deployment, use the site's configured main branch as the deploy name. The token must have permission to deploy to stable.

```bash
yarn selflify deploy ./dist --site app --deploy stable
```

The command prints the deployment URL after publication. Failures return a nonzero exit code. The CLI sends one gzip tar archive, so every deployment transfers the whole build.

You can supply `--server https://panel.example.com` instead of setting `SELFLIFY_SERVER`. For retries of the same CI job, supply `--idempotency-key` with a stable job identifier of 16 to 128 letters, digits, underscores or dashes. Reusing the key with a different build fails. The server retains upload records for seven days, subject to its history capacity.

The CLI refuses redirects and plain HTTP. Local testing permits a loopback HTTP origin when you explicitly add `--allow-local-http`:

```bash
node packages/selflify-cli/bin/selflify.mjs deploy ./dist \
  --server http://127.0.0.1:8080 --allow-local-http \
  --site app --deploy pr-123
```

Builds must contain `index.html` at their root. Symlinks, special files and `.selflify` path segments are rejected. The limits are 128 MiB for the archive, 512 MiB for file contents and 20,000 archive entries.

During a network failure, the CLI retries requests with the same upload identifier. A failed or expired transfer requires a new upload. Use the panel's recent deployments to inspect its result.
