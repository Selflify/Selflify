#!/usr/bin/env bash
set -euo pipefail

CONFIG="${HOME}/sites.json"
OUTPUT="${HOME}/Caddyfile"

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required"
  exit 1
fi

DOMAIN="$(jq -r '.domain' "$CONFIG")"
ROOT_DIR="$(jq -r '.sites.root.dir // "/var/www"' "$CONFIG")"
ROOT_LOGIN="$(jq -r '.sites.root.login // empty' "$CONFIG")"
ROOT_HASH="$(jq -r '.sites.root.password_hash // empty' "$CONFIG")"

cat > "$OUTPUT" <<EOF
{
    debug
    email dev@${DOMAIN}
    acme_ca https://acme-v02.api.letsencrypt.org/directory
}

(tls_cf) {
    tls {
        dns cloudflare {env.CLOUDFLARE_API_TOKEN}
    }
}

(common_headers) {
    header {
        X-Robots-Tag "noindex, nofollow, noarchive, nosnippet, noimageindex"
        Referrer-Policy "strict-origin-when-cross-origin"
        X-Content-Type-Options "nosniff"
    }
}

(static_cache) {
    @static {
        path *.js *.mjs *.css *.map *.png *.jpg *.jpeg *.gif *.svg *.webp *.ico *.woff *.woff2 *.ttf *.eot
    }
    header @static Cache-Control "public, max-age=31536000, immutable"

    @html {
        path *.html /
    }
    header @html Cache-Control "no-store, no-cache, must-revalidate"
}

(common_site) {
    import tls_cf
    import common_headers
    import static_cache

    encode gzip zstd

    log {
        output file /var/log/caddy/access.log {
            roll_size 20MiB
            roll_keep 10
            roll_keep_for 720h
        }
        format json
        level INFO
    }
}

EOF

if [[ -n "$ROOT_LOGIN" && -n "$ROOT_HASH" ]]; then
  cat >> "$OUTPUT" <<EOF
${DOMAIN} {
    import common_site

    basicauth {
        ${ROOT_LOGIN} ${ROOT_HASH}
    }

    root * ${ROOT_DIR}
    file_server
}

EOF
else
  cat >> "$OUTPUT" <<EOF
${DOMAIN} {
    import common_site

    root * ${ROOT_DIR}
    file_server
}

EOF
fi

mapfile -t SITE_NAMES < <(jq -r '.sites | keys[]' "$CONFIG" | grep -v '^root$' | sort)

for site in "${SITE_NAMES[@]}"; do
  site_dir="$(jq -r --arg s "$site" '.sites[$s].dir' "$CONFIG")"
  main_branch="$(jq -r --arg s "$site" '.sites[$s].main_branch // "stable"' "$CONFIG")"
  login="$(jq -r --arg s "$site" '.sites[$s].login // empty' "$CONFIG")"
  hash="$(jq -r --arg s "$site" '.sites[$s].password_hash // empty' "$CONFIG")"

  cat >> "$OUTPUT" <<EOF
${site}.${DOMAIN}, *.${site}.${DOMAIN} {
    import common_site

EOF

  if [[ -n "$login" && -n "$hash" ]]; then
    cat >> "$OUTPUT" <<EOF
    @preview expression \`{host} != "${site}.${DOMAIN}"\`

    handle @preview {
        basicauth {
            ${login} ${hash}
        }

        root * ${site_dir}/{labels.3}
        try_files {path} {path}/ /index.html
        file_server
    }

EOF
  else
    cat >> "$OUTPUT" <<EOF
    @preview expression \`{host} != "${site}.${DOMAIN}"\`

    handle @preview {
        root * ${site_dir}/{labels.3}
        try_files {path} {path}/ /index.html
        file_server
    }

EOF
  fi

  cat >> "$OUTPUT" <<EOF
    handle {
        root * ${site_dir}/${main_branch}
        try_files {path} {path}/ /index.html
        file_server
    }
}

EOF
done

echo "Generated ${OUTPUT}"

