"""Raf Telegram botu: link gönder → kaydet; /bugun /ara /son; her akşam günlük özet.
Sadece sahibinin sohbetine cevap verir. TELEGRAM_TOKEN yoksa sessizce devre dışı kalır."""
import datetime as dt
import html
import json
import mimetypes
import os
import re
import threading
import uuid
import time
import traceback
import urllib.parse
import urllib.request

from . import db, downloads

TOKEN = os.environ.get("RAF_TELEGRAM_TOKEN", "")
OWNER = int(os.environ.get("RAF_TELEGRAM_CHAT_ID", "0") or 0)
DIGEST_HOUR = int(os.environ.get("RAF_DIGEST_HOUR", "21"))
WEB_URL = os.environ.get("RAF_PUBLIC_URL", "")
TZ = dt.timezone(dt.timedelta(hours=3))
URL_RE = re.compile(r"https?://[^\s<>\"]+")


def api(method, **params):
    data = urllib.parse.urlencode(
        {k: (json.dumps(v) if isinstance(v, (dict, list)) else v) for k, v in params.items()}).encode()
    with urllib.request.urlopen(f"https://api.telegram.org/bot{TOKEN}/{method}", data=data, timeout=70) as r:
        return json.load(r)


def send_file(chat_id, method, field, path, caption=""):
    """Telegram'a dosya yükle (multipart). Bot API sınırı 50 MB."""
    boundary = uuid.uuid4().hex
    parts = []
    for k, v in (("chat_id", str(chat_id)), ("caption", caption), ("parse_mode", "HTML"), ("supports_streaming", "true")):
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
    fname = os.path.basename(path).encode("ascii", "ignore").decode() or "video.mp4"
    parts.append((f'--{boundary}\r\nContent-Disposition: form-data; name="{field}"; filename="{fname}"\r\n'
                  f'Content-Type: {mimetypes.guess_type(path)[0] or "application/octet-stream"}\r\n\r\n').encode())
    with open(path, "rb") as f:
        body = b"".join(parts) + f.read() + f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(f"https://api.telegram.org/bot{TOKEN}/{method}", data=body,
                                 headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    with urllib.request.urlopen(req, timeout=600) as r:
        return json.load(r)


def on_download_finished(d):
    if d["source"] != "telegram" or not TOKEN:
        return
    if d["status"] == "error":
        send(OWNER, f"⚠️ İndirilemedi: {html.escape(d['url'])}\n<code>{html.escape(d['error'][:300])}</code>"); return
    path = downloads.path_of(d)
    cap = html.escape(d["title"][:200])
    link = f"{WEB_URL}/files/{d['id']}"
    if path and d["size"] < 49 * 1024 * 1024:
        try:
            if d["kind"] == "audio": send_file(OWNER, "sendAudio", "audio", path, cap)
            else: send_file(OWNER, "sendVideo", "video", path, cap)
            return
        except Exception:
            traceback.print_exc()
    send(OWNER, f"✅ <b>{cap}</b>\n{d['size'] / 1048576:.0f} MB — Telegram sınırını aştığı için link:\n{link}")


def queue_download(chat, url, kind):
    d = downloads.enqueue(url, kind, "telegram")
    send(chat, f"⏳ Sıraya alındı ({'🎵 ses' if kind == 'audio' else '🎬 video'}). Hazır olunca gönderirim.")
    return d


def send(chat_id, text):
    api("sendMessage", chat_id=chat_id, text=text, parse_mode="HTML", disable_web_page_preview="true")


def day_start(days_ago=0):
    now = dt.datetime.now(TZ)
    return int((now.replace(hour=0, minute=0, second=0, microsecond=0) - dt.timedelta(days=days_ago)).timestamp())


def fmt_items(items, limit=15):
    lines = []
    for it in items[:limit]:
        title = html.escape((it["title"] or it["url"])[:80])
        tags = " ".join("#" + html.escape(t) for t in it["tags"][:4])
        lines.append(f"• <a href=\"{html.escape(it['url'], quote=True)}\">{title}</a> {tags}".rstrip())
    if len(items) > limit:
        lines.append(f"… ve {len(items) - limit} tane daha")
    return "\n".join(lines)


def fetch_title(url):
    """Telegram'dan gelen linkin sayfa başlığını çekmeye çalış (olmazsa boş)."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Raf bookmark bot)"})
        with urllib.request.urlopen(req, timeout=10) as r:
            chunk = r.read(300_000).decode(r.headers.get_content_charset() or "utf-8", "ignore")
        m = re.search(r"<title[^>]*>(.*?)</title>", chunk, re.S | re.I)
        d = re.search(r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']*)', chunk, re.I)
        return (html.unescape(m.group(1)).strip()[:300] if m else ""), (html.unescape(d.group(1)).strip()[:500] if d else "")
    except Exception:
        return "", ""


def handle(msg):
    text = (msg.get("text") or msg.get("caption") or "").strip()
    chat = msg["chat"]["id"]
    if text.startswith("/"):
        cmd, _, arg = text[1:].partition(" ")
        cmd = cmd.split("@")[0].lower()
        if cmd in ("bugun", "bugün"):
            items = db.search(since=day_start(), limit=100)
            send(chat, f"📚 <b>Bugün {len(items)} sayfa</b>\n" + (fmt_items(items) or "Henüz yok."))
        elif cmd == "ara":
            if not arg.strip():
                send(chat, "Kullanım: <code>/ara kelime</code>"); return
            items = db.search(q=arg, limit=15)
            send(chat, f"🔎 <b>{html.escape(arg)}</b> — {len(items)} sonuç\n" + (fmt_items(items) or "Bulunamadı."))
        elif cmd in ("indir", "video", "ses", "mp3"):
            urls = URL_RE.findall(arg)
            if not urls:
                send(chat, "Kullanım: <code>/indir link</code> veya <code>/ses link</code>"); return
            for u in urls[:5]:
                queue_download(chat, u, "audio" if cmd in ("ses", "mp3") else "video")
        elif cmd == "son":
            send(chat, "🕘 <b>Son kaydedilenler</b>\n" + (fmt_items(db.search(limit=10)) or "Henüz yok."))
        else:
            send(chat, "📚 <b>Raf</b>\nBana bir link gönder, rafa kaldırayım.\n"
                       "Linkin yanına #etiket ve not yazabilirsin.\n\n"
                       "/bugun — bugün kaydettiklerin\n/son — son 10 kayıt\n/ara kelime — ara\n"
                       "/indir link — videoyu indir · /ses link — sadece ses (mp3)\n"
                       "Linkin yanına #indir yazarsan hem kaydeder hem indiririm."
                       + (f"\n\n🌐 {WEB_URL}" if WEB_URL else ""))
        return
    urls = URL_RE.findall(text)
    if not urls:
        send(chat, "Kaydetmem için bir link gönder 🙂"); return
    tags = re.findall(r"#([\wçğıöşüÇĞİÖŞÜ-]+)", text)
    want_dl = {t.lower() for t in tags} & {"indir", "video", "ses", "mp3"}
    tags = [t for t in tags if t.lower() not in ("indir", "video", "ses", "mp3")]
    note = URL_RE.sub("", re.sub(r"#[\wçğıöşüÇĞİÖŞÜ-]+", "", text)).strip()
    saved = []
    for u in urls[:10]:
        title, desc = fetch_title(u)
        item, new = db.save(u, title=title, description=desc, note=note, tags=tags, source="telegram")
        saved.append(("✅" if new else "♻️") + " " + html.escape(item["title"] or u)[:80])
    send(chat, "\n".join(saved) + f"\n\nBugün toplam: {db.count(since=day_start())}")
    if want_dl:
        for u in urls[:5]:
            queue_download(chat, u, "audio" if want_dl & {"ses", "mp3"} else "video")


def digest():
    items = db.search(since=day_start(), limit=200)
    if not items:
        return
    tags = {}
    for it in items:
        for t in it["tags"]:
            tags[t] = tags.get(t, 0) + 1
    top = " ".join(f"#{html.escape(t)}" for t, _ in sorted(tags.items(), key=lambda x: -x[1])[:5])
    send(OWNER, f"🌙 <b>Günün özeti</b> — bugün <b>{len(items)}</b> sayfa kaydettin"
                + (f"\n{top}" if top else "") + "\n\n" + fmt_items(items, 20)
                + (f"\n\n🌐 {WEB_URL}" if WEB_URL else ""))


def digest_loop():
    while True:
        try:
            now = dt.datetime.now(TZ)
            key = now.strftime("%Y-%m-%d")
            if now.hour >= DIGEST_HOUR and db.kv_get("digest_sent") != key:
                digest()
                db.kv_set("digest_sent", key)
        except Exception:
            traceback.print_exc()
        time.sleep(60)


def poll_loop():
    offset = None
    try:
        api("setMyCommands", commands=[
            {"command": "bugun", "description": "Bugün kaydettiklerin"},
            {"command": "son", "description": "Son 10 kayıt"},
            {"command": "ara", "description": "Kayıtlarda ara"},
            {"command": "indir", "description": "Video indir: /indir link"},
            {"command": "ses", "description": "Sadece ses (mp3): /ses link"}])
    except Exception:
        traceback.print_exc()
    while True:
        try:
            res = api("getUpdates", timeout=50, **({"offset": offset} if offset else {}))
            for u in res.get("result", []):
                offset = u["update_id"] + 1
                m = u.get("message") or {}
                if m.get("chat", {}).get("id") != OWNER:
                    continue
                try:
                    handle(m)
                except Exception as e:
                    traceback.print_exc()
                    send(OWNER, f"⚠️ Hata: <code>{html.escape(str(e))}</code>")
        except Exception:
            traceback.print_exc()
            time.sleep(10)


def start():
    if not TOKEN or not OWNER:
        print("Telegram kapalı (RAF_TELEGRAM_TOKEN / RAF_TELEGRAM_CHAT_ID yok)", flush=True)
        return
    downloads.on_finished.append(on_download_finished)
    threading.Thread(target=poll_loop, daemon=True).start()
    threading.Thread(target=digest_loop, daemon=True).start()
    print("Telegram botu çalışıyor", flush=True)
