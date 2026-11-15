#!/usr/bin/env bash
# Builds the Chrome Web Store package: dist/raf-store-<version>.zip
#  - no server URL / token baked in (local mode until the user connects a server)
#  - RAF_BUILD="store": YouTube downloads are off (Web Store policy) with a link explaining how to enable them
#  - "cookies" becomes an optional permission (asked for only when a server is connected)
#  - no YouTube / *.ts.net host access, the video button doesn't run on YouTube
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=dist/raf-store
rm -rf "$OUT" && mkdir -p "$OUT"
cp -r extension/. "$OUT/"
cat > "$OUT/config.js" <<'JS'
// Chrome Web Store build — no server configured: Raf starts in local mode.
self.RAF_DEFAULTS = { server: "", token: "" };
self.RAF_BUILD = "store";
JS
python3 - "$OUT/manifest.json" <<'PY'
import json, sys, collections
p = sys.argv[1]
m = json.load(open(p), object_pairs_hook=collections.OrderedDict)
yt = lambda u: "youtube.com" in u or "youtu.be" in u
m["permissions"] = [x for x in m["permissions"] if x != "cookies"]
m["optional_permissions"] = ["cookies"]
m["host_permissions"] = [x for x in m["host_permissions"] if not yt(x) and "ts.net" not in x]
for cs in m.get("content_scripts", []):
    cs["matches"] = [x for x in cs["matches"] if not yt(x)]
json.dump(m, open(p, "w"), indent=2, ensure_ascii=False)
PY
# Nothing personal may ship:
# 1) the server URL / token must be empty (the Raf server injects them only into its own /extension.zip)
python3 - "$OUT/config.js" <<'PY'
import re, sys
s = open(sys.argv[1]).read()
m = re.search(r"RAF_DEFAULTS\s*=\s*\{([^}]*)\}", s)
if not m or re.search(r"""(server|token)["']?\s*:\s*["'][^"']+["']""", m.group(1)):
    sys.exit("✗ config.js has a server URL or token — not packaging")
PY
# 2) optional extra patterns kept outside git (scripts/.private-patterns, one regex per line)
if [ -f scripts/.private-patterns ] && grep -rniE -f scripts/.private-patterns "$OUT" --include=*.js --include=*.json --include=*.html --include=*.css; then
  echo "✗ personal data found above — not packaging" >&2; exit 1
fi
VER=$(python3 -c "import json;print(json.load(open('$OUT/manifest.json'))['version'])")
rm -f "dist/raf-store-$VER.zip"
(cd "$OUT" && zip -qr -X "../raf-store-$VER.zip" . -x '.*')
echo "✓ dist/raf-store-$VER.zip"
