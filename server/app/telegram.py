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
# Bot language: "tr", "en", or "auto" (follow the Telegram app language of the last message; default English).
# Commands work in both languages whatever this is set to.
BOT_LANG = os.environ.get("RAF_BOT_LANG", "auto").lower()
_last_lang = "en"

S = {
    "en": {
        "dl_failed": "⚠️ Couldn't download: {url}\n<code>{err}</code>",
        "dl_link": "✅ <b>{cap}</b>\n{mb} MB — too big for Telegram, here's a link:\n{link}",
        "queued": "⏳ Queued ({kind}). I'll send it when it's ready.", "audio": "🎵 audio", "video": "🎬 video",
        "more": "… and {n} more", "today": "📚 <b>{n} pages today</b>\n", "none": "Nothing yet.",
        "search_how": "Usage: <code>/search word</code>",
        "found": "🔎 <b>{q}</b> — {n} results\n", "not_found": "Nothing found.",
        "dl_how": "Usage: <code>/download link</code> or <code>/audio link</code>",
        "last": "🕘 <b>Latest saves</b>\n",
        "help": "📚 <b>Raf</b>\nSend me a link and I'll put it on your shelf.\n"
                "Add #tags and a note next to the link.\n\n"
                "/today — saved today\n/last — latest 10\n/search word — search\n"
                "/download link — download the video · /audio link — audio only (mp3)\n"
                "Add #download next to a link to save and download it.",
        "send_link": "Send me a link to save 🙂", "total_today": "Today in total: {n}",
        "digest": "🌙 <b>Daily digest</b> — you saved <b>{n}</b> pages today", "error": "⚠️ Error: <code>{e}</code>",
    },
    "tr": {
        "dl_failed": "⚠️ İndirilemedi: {url}\n<code>{err}</code>",
        "dl_link": "✅ <b>{cap}</b>\n{mb} MB — Telegram sınırını aştığı için link:\n{link}",
        "queued": "⏳ Sıraya alındı ({kind}). Hazır olunca gönderirim.", "audio": "🎵 ses", "video": "🎬 video",
        "more": "… ve {n} tane daha", "today": "📚 <b>Bugün {n} sayfa</b>\n", "none": "Henüz yok.",
        "search_how": "Kullanım: <code>/ara kelime</code>",
        "found": "🔎 <b>{q}</b> — {n} sonuç\n", "not_found": "Bulunamadı.",
        "dl_how": "Kullanım: <code>/indir link</code> veya <code>/ses link</code>",
        "last": "🕘 <b>Son kaydedilenler</b>\n",
        "help": "📚 <b>Raf</b>\nBana bir link gönder, rafa kaldırayım.\n"
                "Linkin yanına #etiket ve not yazabilirsin.\n\n"
                "/bugun — bugün kaydettiklerin\n/son — son 10 kayıt\n/ara kelime — ara\n"
                "/indir link — videoyu indir · /ses link — sadece ses (mp3)\n"
                "Linkin yanına #indir yazarsan hem kaydeder hem indiririm.",
        "send_link": "Kaydetmem için bir link gönder 🙂", "total_today": "Bugün toplam: {n}",
        "digest": "🌙 <b>Günün özeti</b> — bugün <b>{n}</b> sayfa kaydettin", "error": "⚠️ Hata: <code>{e}</code>",
    },
}
CMD_TODAY, CMD_LAST, CMD_SEARCH = {"today", "bugun", "bugün"}, {"last", "son"}, {"search", "ara"}
CMD_VIDEO, CMD_AUDIO = {"download", "video", "indir"}, {"audio", "mp3", "ses"}
CMD_HELP = {"help", "start", "yardim", "yardım"}


def lang():
    return BOT_LANG if BOT_LANG in S else _last_lang


def _(key, **kw):
    return S[lang()][key].format(**kw)


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
        send(OWNER, _("dl_failed", url=html.escape(d['url']), err=html.escape(d['error'][:300]))); return
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
    send(OWNER, _("dl_link", cap=cap, mb=f"{d['size'] / 1048576:.0f}", link=link))


def queue_download(chat, url, kind):
    d = downloads.enqueue(url, kind, "telegram")
    if d["status"] == "error":  # refused up front (e.g. Netflix) — on_download_finished already explained why
        return d
    send(chat, _("queued", kind=_("audio" if kind == "audio" else "video")))
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
        lines.append(_("more", n=len(items) - limit))
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
    global _last_lang
    _last_lang = "tr" if (msg.get("from", {}).get("language_code") or "").lower().startswith("tr") else "en"
    text = (msg.get("text") or msg.get("caption") or "").strip()
    chat = msg["chat"]["id"]
    if text.startswith("/"):
        cmd, _sep, arg = text[1:].partition(" ")
        cmd = cmd.split("@")[0].lower()
        if cmd in CMD_TODAY:
            items = db.search(since=day_start(), limit=100)
            send(chat, _("today", n=len(items)) + (fmt_items(items) or _("none")))
        elif cmd in CMD_SEARCH:
            if not arg.strip():
                send(chat, _("search_how")); return
            items = db.search(q=arg, limit=15)
            send(chat, _("found", q=html.escape(arg), n=len(items)) + (fmt_items(items) or _("not_found")))
        elif cmd in CMD_VIDEO | CMD_AUDIO:
            urls = URL_RE.findall(arg)
            if not urls:
                send(chat, _("dl_how")); return
            for u in urls[:5]:
                queue_download(chat, u, "audio" if cmd in CMD_AUDIO else "video")
        elif cmd in CMD_LAST:
            send(chat, _("last") + (fmt_items(db.search(limit=10)) or _("none")))
        else:
            send(chat, _("help") + (f"\n\n🌐 {WEB_URL}" if WEB_URL else ""))
        return
    urls = URL_RE.findall(text)
    if not urls:
        send(chat, _("send_link")); return
    tags = re.findall(r"#([\wçğıöşüÇĞİÖŞÜ-]+)", text)
    dl_tags = CMD_VIDEO | CMD_AUDIO
    want_dl = {t.lower() for t in tags} & dl_tags
    tags = [t for t in tags if t.lower() not in dl_tags]
    note = URL_RE.sub("", re.sub(r"#[\wçğıöşüÇĞİÖŞÜ-]+", "", text)).strip()
    saved = []
    for u in urls[:10]:
        title, desc = fetch_title(u)
        item, new = db.save(u, title=title, description=desc, note=note, tags=tags, source="telegram")
        saved.append(("✅" if new else "♻️") + " " + html.escape(item["title"] or u)[:80])
    send(chat, "\n".join(saved) + "\n\n" + _("total_today", n=db.count(since=day_start())))
    if want_dl:
        for u in urls[:5]:
            queue_download(chat, u, "audio" if want_dl & CMD_AUDIO else "video")


def digest():
    items = db.search(since=day_start(), limit=200)
    if not items:
        return
    tags = {}
    for it in items:
        for t in it["tags"]:
            tags[t] = tags.get(t, 0) + 1
    top = " ".join(f"#{html.escape(t)}" for t, _n in sorted(tags.items(), key=lambda x: -x[1])[:5])
    send(OWNER, _("digest", n=len(items))
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
        en = [{"command": "today", "description": "Saved today"},
              {"command": "last", "description": "Latest 10"},
              {"command": "search", "description": "Search your shelf"},
              {"command": "download", "description": "Download a video: /download link"},
              {"command": "audio", "description": "Audio only (mp3): /audio link"}]
        tr = [{"command": "bugun", "description": "Bugün kaydettiklerin"},
              {"command": "son", "description": "Son 10 kayıt"},
              {"command": "ara", "description": "Kayıtlarda ara"},
              {"command": "indir", "description": "Video indir: /indir link"},
              {"command": "ses", "description": "Sadece ses (mp3): /ses link"}]
        # Menu: forced language for everyone, or English by default + Turkish for Turkish Telegram apps
        api("setMyCommands", commands=tr if BOT_LANG == "tr" else en)
        api("setMyCommands", commands=en if BOT_LANG == "en" else tr, language_code="tr")
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
                    send(OWNER, _("error", e=html.escape(str(e))))
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
