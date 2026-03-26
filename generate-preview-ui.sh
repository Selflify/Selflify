#!/usr/bin/env bash
set -euo pipefail

CONFIG="${HOME}/sites.json"

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required"
  exit 1
fi

DOMAIN="$(jq -r '.domain' "$CONFIG")"
ROOT_DIR="$(jq -r '.sites.root.dir // "/var/www"' "$CONFIG")"
OUTPUT="${ROOT_DIR}/index.html"

cat > "$OUTPUT" <<EOF
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="robots" content="noindex,nofollow,noarchive,nosnippet,noimageindex" />
  <title>Preview Environments</title>
  <style>
    :root {
      --bg: #f6f7fb;
      --card: #ffffff;
      --text: #1f2430;
      --muted: #69707d;
      --accent: #a12141;
      --border: #e6e8ef;
      --shadow: 0 8px 24px rgba(16,24,40,.06);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 40px 20px;
      font-family: Inter, system-ui, sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    .wrap { max-width: 1200px; margin: 0 auto; }
    h1 { margin: 0 0 10px; font-size: 32px; }
    .lead { margin: 0 0 32px; color: var(--muted); }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 20px;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 20px;
      box-shadow: var(--shadow);
    }
    .card h2 { margin: 0 0 14px; font-size: 20px; }
    .links { display: flex; flex-direction: column; gap: 10px; }
    .item {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: center;
    }
    a {
      color: var(--accent);
      text-decoration: none;
      word-break: break-word;
    }
    a:hover { text-decoration: underline; }
    .size {
      color: var(--muted);
      font-size: 12px;
      white-space: nowrap;
    }
    .stable a { font-weight: 700; }
    .empty {
      color: var(--muted);
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>🚀 Preview Environments</h1>
    <p class="lead">Stable и preview окружения</p>
    <div class="grid">
EOF

mapfile -t SITE_NAMES < <(jq -r '.sites | keys[]' "$CONFIG" | grep -v '^root$' | sort)

for site in "${SITE_NAMES[@]}"; do
  site_dir="$(jq -r --arg s "$site" '.sites[$s].dir' "$CONFIG")"
  main_branch="$(jq -r --arg s "$site" '.sites[$s].main_branch // "stable"' "$CONFIG")"

  {
    echo "<section class='card'>"
    echo "<h2>${site}</h2>"
    echo "<div class='links'>"

    if [[ -d "${site_dir}/${main_branch}" ]]; then
      size="$(du -sh "${site_dir}/${main_branch}" 2>/dev/null | awk '{print $1}')"
      echo "<div class='item stable'>"
      echo "<a href='https://${site}.${DOMAIN}' target='_blank' rel='noopener noreferrer'>🌿 ${main_branch}</a>"
      echo "<span class='size'>${size}</span>"
      echo "</div>"
    fi

    found=0
    while IFS= read -r dir; do
      name="$(basename "$dir")"
      [[ "$name" == "$main_branch" ]] && continue
      size="$(du -sh "$dir" 2>/dev/null | awk '{print $1}')"
      echo "<div class='item'>"
      echo "<a href='https://${name}.${site}.${DOMAIN}' target='_blank' rel='noopener noreferrer'>🔗 ${name}</a>"
      echo "<span class='size'>${size}</span>"
      echo "</div>"
      found=1
    done < <(find "$site_dir" -mindepth 1 -maxdepth 1 -type d | sort)

    if [[ "$found" -eq 0 ]]; then
      echo "<div class='empty'>Нет preview-окружений</div>"
    fi

    echo "</div>"
    echo "</section>"
  } >> "$OUTPUT"
done

cat >> "$OUTPUT" <<EOF
    </div>
  </div>
</body>
</html>
EOF

echo "Generated ${OUTPUT}"

