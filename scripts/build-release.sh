#!/usr/bin/env bash
# Builds the GitHub Release package: dist/raf-extension.zip (full build).
# Starts in local mode (no server baked in); connect your own Raf server in Settings for video downloads.
# The file name has no version so https://github.com/selimyalinkilic/raf/releases/latest/download/raf-extension.zip always works.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=dist/raf-extension
rm -rf "$OUT" && mkdir -p "$OUT"
cp -r extension/. "$OUT/"
cat > "$OUT/config.js" <<'JS'
// GitHub release — no server configured: Raf starts in local mode. Add your server under Settings → Connection.
self.RAF_DEFAULTS = { server: "", token: "" };
JS
# *.ts.net is only for servers served by Tailscale; others get asked for their server's address in Settings
python3 - "$OUT/manifest.json" <<'PY'
import json, sys, collections
p = sys.argv[1]
m = json.load(open(p), object_pairs_hook=collections.OrderedDict)
m["host_permissions"] = [x for x in m["host_permissions"] if "ts.net" not in x]
json.dump(m, open(p, "w"), indent=2, ensure_ascii=False)
PY
if grep -rniE "tailnet|gmail\.com" "$OUT" --include=*.js --include=*.json --include=*.html --include=*.css; then
  echo "✗ personal or server-specific data found above — not packaging" >&2; exit 1
fi
rm -f dist/raf-extension.zip
(cd "$OUT" && zip -qr -X ../raf-extension.zip . -x '.*')
echo "✓ dist/raf-extension.zip ($(python3 -c "import json;print(json.load(open('$OUT/manifest.json'))['version'])"))"
