"""Raf — kişisel "sonra bak" rafı. API (eklenti), web arayüzü, Telegram botu, günlük özet."""
import base64
import datetime as dt
import html
import re
import io
import json
import os
import time
import zipfile
from urllib.parse import urlencode, urlparse

from fastapi import Depends, FastAPI, Form, Header, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import db, downloads, telegram
from .icons import ic

API_TOKEN = os.environ.get("RAF_API_TOKEN", "")
PUBLIC_URL = os.environ.get("RAF_PUBLIC_URL", "").rstrip("/")
EXT_DIR = os.environ.get("RAF_EXTENSION_DIR", "/ext")
SHOT_DIR = os.path.join(os.path.dirname(db.DB_PATH), "shots")

app = FastAPI(title="Raf", docs_url=None, redoc_url=None)
app.mount("/static", StaticFiles(directory=os.path.join(os.path.dirname(__file__), "static")), name="static")


@app.on_event("startup")
def _start():
    os.makedirs(SHOT_DIR, exist_ok=True)
    downloads.start()
    telegram.start()


def auth(authorization: str = Header(default="")):
    if not API_TOKEN or authorization != f"Bearer {API_TOKEN}":
        raise HTTPException(401, "Geçersiz anahtar")


# ------------------------------------------------------------------ API (eklenti)
class ItemIn(BaseModel):
    url: str
    title: str = ""
    description: str = ""
    note: str = ""
    tags: list[str] = Field(default_factory=list)
    text: str = ""
    favicon: str = ""
    source: str = "extension"
    screenshot: str = ""  # data:image/jpeg;base64,...  (görünür alanın görüntüsü)


@app.post("/api/items", dependencies=[Depends(auth)])
def api_save(item: ItemIn):
    if not item.url.startswith(("http://", "https://")):
        raise HTTPException(400, "Sadece http/https linkleri kaydedilebilir")
    data = item.model_dump(); shot = data.pop("screenshot")
    saved, new = db.save(**data)
    if shot.startswith("data:image/"):
        raw = base64.b64decode(shot.split(",", 1)[1])
        if len(raw) > 8_000_000:
            raise HTTPException(413, "Ekran görüntüsü çok büyük")
        ext = "png" if shot.startswith("data:image/png") else "jpg"
        name = f"{saved['id']}.{ext}"
        with open(os.path.join(SHOT_DIR, name), "wb") as f:
            f.write(raw)
        db.set_screenshot(saved["id"], name); saved = db.get(saved["id"])
    return {"item": saved, "new": new, "today": db.count(since=telegram.day_start())}


@app.get("/shots/{name}")
def shot_file(name: str):
    p = os.path.join(SHOT_DIR, os.path.basename(name))
    if not os.path.isfile(p):
        raise HTTPException(404)
    return FileResponse(p, headers={"Cache-Control": "max-age=31536000"})


# ------------------------------------------------------------------ İndirmeler
class DownloadIn(BaseModel):
    url: str
    kind: str = "video"  # video | audio
    cookies: str = ""    # eklentinin gönderdiği, o siteye ait çerezler (Netscape biçimi; saklanmaz)


def dl_public(d):
    d = dict(d); d.setdefault("reused", False); d["file_url"] = f"{PUBLIC_URL}/files/{d['id']}" if d["status"] == "done" else ""
    return d


@app.post("/api/downloads", dependencies=[Depends(auth)])
def api_dl_create(body: DownloadIn):
    if not body.url.startswith(("http://", "https://")):
        raise HTTPException(400, "Geçersiz link")
    return dl_public(downloads.enqueue(body.url, body.kind, "extension", body.cookies))


@app.get("/api/downloads", dependencies=[Depends(auth)])
def api_dl_list():
    return {"downloads": [dl_public(d) for d in db.dl_list(30)]}


@app.get("/api/downloads/{dl_id}", dependencies=[Depends(auth)])
def api_dl_get(dl_id: int):
    d = db.dl_get(dl_id)
    if not d: raise HTTPException(404)
    return dl_public(d)


@app.get("/files/{dl_id}")
def dl_file(dl_id: int, izle: int = 0):
    d = db.dl_get(dl_id); p = d and downloads.path_of(d)
    if not p: raise HTTPException(404, "Dosya yok")
    return FileResponse(p, filename=d["file"], content_disposition_type="inline" if izle else "attachment")


@app.get("/api/items", dependencies=[Depends(auth)])
def api_list(q: str = "", tag: str = "", limit: int = 20, offset: int = 0):
    return {"items": db.search(q=q, tag=tag, limit=min(limit, 100), offset=offset)}


@app.get("/api/lookup", dependencies=[Depends(auth)])
def api_lookup(url: str):
    """Eklenti: bu sayfa daha önce kaydedilmiş mi?"""
    return {"item": db.by_url(url)}


@app.delete("/api/items/{item_id}", dependencies=[Depends(auth)])
def api_delete(item_id: int):
    if not db.delete(item_id):
        raise HTTPException(404)
    return {"ok": True}


@app.get("/api/tags", dependencies=[Depends(auth)])
def api_tags():
    return {"tags": db.tag_counts()}


@app.get("/api/extension")
def api_extension():
    """Eklentinin en güncel sürümü (popup eski kaldıysa uyarı gösterir)."""
    try:
        v = json.load(open(os.path.join(EXT_DIR, "manifest.json")))["version"]
    except Exception:
        v = ""
    return {"version": v, "download": f"{PUBLIC_URL}/extension.zip", "help": f"{PUBLIC_URL}/kurulum"}


@app.get("/manifest.webmanifest")
def manifest():
    return JSONResponse({
        "name": "Raf", "short_name": "Raf", "description": "Kaydettiğin sayfalar ve indirdiğin videolar",
        "start_url": "/", "scope": "/", "display": "standalone", "background_color": "#fffaf4", "theme_color": "#d9ccff",
        "lang": "tr", "icons": [
            {"src": "/static/icon-192.png", "sizes": "192x192", "type": "image/png"},
            {"src": "/static/icon-512.png", "sizes": "512x512", "type": "image/png"},
            {"src": "/static/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}],
        "shortcuts": [{"name": "İndirilenler", "url": "/indirilenler"}],
        # Android: başka uygulamadan "Paylaş → Raf" (iOS desteklemiyor; iOS için Kestirme kullan)
        "share_target": {"action": "/paylas", "method": "GET", "params": {"title": "title", "text": "text", "url": "url"}},
    }, media_type="application/manifest+json")


@app.get("/sw.js")
def service_worker():
    return FileResponse(os.path.join(os.path.dirname(__file__), "static", "sw.js"), media_type="application/javascript",
                        headers={"Cache-Control": "no-cache"})


@app.get("/api/status")
def api_status():
    """Pano (Homepage) için — sayılar dışında bilgi vermez."""
    return {"today": db.count(since=telegram.day_start()), "week": db.count(since=telegram.day_start(6)),
            "total": db.count()}


# ------------------------------------------------------------------ Eklenti indirme
@app.get("/extension.zip")
def extension_zip():
    if not os.path.isdir(EXT_DIR):
        raise HTTPException(404, "Eklenti klasörü yok")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for root, _, files in os.walk(EXT_DIR):
            for f in files:
                if f == "config.js" and root == EXT_DIR:
                    continue  # aşağıda sunucu ayarlarıyla yeniden yazılıyor
                p = os.path.join(root, f)
                z.write(p, os.path.relpath(p, EXT_DIR))
        # Sunucu adresi ve anahtar hazır gelsin: kurulumda hiçbir şey yazmak gerekmez
        z.writestr("config.js", "// Sunucudan indirilirken otomatik oluşturuldu\n"
                   f"self.RAF_DEFAULTS = {json.dumps({'server': PUBLIC_URL, 'token': API_TOKEN})};\n")
    return Response(buf.getvalue(), media_type="application/zip",
                    headers={"Content-Disposition": 'attachment; filename="raf-eklenti.zip"'})


# ------------------------------------------------------------------ Web arayüzü
def esc(s):
    return html.escape(str(s or ""), quote=True)


def ago(ts):
    s = int(time.time() - ts)
    if s < 60: return "az önce"
    if s < 3600: return f"{s // 60} dk önce"
    if s < 86400: return f"{s // 3600} sa önce"
    if s < 86400 * 30: return f"{s // 86400} gün önce"
    return time.strftime("%d.%m.%Y", time.localtime(ts))


def card(it):
    host = urlparse(it["url"]).netloc.replace("www.", "")
    fav = esc(it["favicon"]) or f"https://www.google.com/s2/favicons?domain={esc(host)}&sz=64"
    tags = "".join(f'<a class="tag" href="/?{urlencode({"tag": t})}">#{esc(t)}</a>' for t in it["tags"])
    note = f'<p class="note">{ic("note")} {esc(it["note"])}</p>' if it["note"] else ""
    desc = f'<p class="desc">{esc(it["description"][:220])}</p>' if it["description"] else ""
    src = {"telegram": ic("send"), "extension": ic("puzzle"), "web": ic("globe")}.get(it["source"], "")
    shot = (f'<a class="shot" href="/shots/{esc(it["screenshot"])}" target="_blank"><img src="/shots/{esc(it["screenshot"])}" alt="" loading="lazy"></a>'
            if it.get("screenshot") else "")
    return f'''<article class="card">
  <img class="fav" src="{fav}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
  <div class="body">
    <a class="title" href="{esc(it['url'])}" target="_blank" rel="noreferrer">{esc(it['title'] or it['url'])}</a>
    <div class="meta">{esc(host)} · {ago(it['created_at'])} {src}</div>
    {desc}{note}<div class="tags">{tags}</div>
  </div>
  {shot}
  <form method="post" action="/ui/delete" onsubmit="return confirm('Silinsin mi?')">
    <input type="hidden" name="id" value="{it['id']}"><button class="del" title="Sil" aria-label="Sil">{ic("x")}</button>
  </form>
</article>'''


@app.get("/", response_class=HTMLResponse)
def index(q: str = "", tag: str = "", page: int = 1):
    per = 30
    items = db.search(q=q, tag=tag, limit=per + 1, offset=(page - 1) * per)
    more = len(items) > per
    items = items[:per]
    tags = "".join(
        f'<a class="chip{" on" if t["tag"] == tag else ""}" href="/?{urlencode({"tag": t["tag"]})}">#{esc(t["tag"])} <b>{t["n"]}</b></a>'
        for t in db.tag_counts()[:24])
    today, total = db.count(since=telegram.day_start()), db.count()
    nav = ""
    if page > 1 or more:
        prev = f'<a href="/?{urlencode({"q": q, "tag": tag, "page": page - 1})}">← Yeni</a>' if page > 1 else "<span></span>"
        nxt = f'<a href="/?{urlencode({"q": q, "tag": tag, "page": page + 1})}">Eski →</a>' if more else ""
        nav = f'<nav class="pager">{prev}{nxt}</nav>'
    heading = f"#{esc(tag)}" if tag else (f"“{esc(q)}” için sonuçlar" if q else "Rafındakiler")
    empty = f'<div class="empty">{ic("inbox", "big")}<br>Burada henüz bir şey yok.<br>Yukarıya link yapıştır, eklentiyi ya da Telegram botunu kullan.</div>'
    return f'''<!doctype html><html lang="tr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Raf</title>
<link rel="icon" href="/static/icon.svg"><link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" href="/static/apple-touch-icon.png"><meta name="theme-color" content="#d9ccff"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="Raf"><meta name="apple-mobile-web-app-status-bar-style" content="default"><script>if("serviceWorker" in navigator)navigator.serviceWorker.register("/sw.js")</script><link rel="stylesheet" href="/static/style.css"></head><body>
<header class="top">
  <a class="brand" href="/"><img src="/static/icon.svg" alt=""> Raf</a>
  <form class="search" action="/"><span class="field">{ic("search")}<input name="q" value="{esc(q)}" placeholder="Rafta ara…"></span></form>
  <div class="stats"><span>Bugün <b>{today}</b></span><span>Toplam <b>{total}</b></span><a class="navbtn" href="/indirilenler">{ic("download")} İndirilenler</a></div>
</header>
<main>
  <form class="addform" method="post" action="/ui/save">
    <span class="field wide">{ic("link")}<input name="url" type="url" inputmode="url" placeholder="Link yapıştır…" required></span>
    <div class="addrow">
      <span class="field">{ic("tag")}<input name="tags" placeholder="etiketler (virgülle)"></span>
      <label class="switch"><input type="checkbox" name="indir" value="1"><span class="track"></span>{ic("video")} Videoyu da indir</label>
      <button>{ic("plus")} Rafa kaldır</button>
    </div>
  </form>
  <div class="chips">{tags}</div>
  <h1>{heading}{' <a class="clear" href="/">temizle</a>' if (q or tag) else ''}</h1>
  <section class="list">{"".join(card(i) for i in items) or empty}</section>
  {nav}
  <footer><a href="/extension.zip">{ic("puzzle")} Chrome eklentisini indir</a> · <a href="/kurulum">Kurulum</a></footer>
</main></body></html>'''


def human(n):
    for u in ["B", "KB", "MB", "GB"]:
        if n < 1024: return f"{n:.0f} {u}" if u in ("B", "KB") else f"{n:.1f} {u}"
        n /= 1024
    return f"{n:.1f} TB"


TRZ = dt.timezone(dt.timedelta(hours=3))
AYLAR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"]
PLATFORMS = [("youtube.com", "YouTube"), ("youtu.be", "YouTube"), ("x.com", "X"), ("twitter.com", "X"),
             ("instagram.com", "Instagram"), ("tiktok.com", "TikTok"), ("facebook.com", "Facebook"), ("fb.watch", "Facebook"),
             ("vimeo.com", "Vimeo"), ("reddit.com", "Reddit"), ("twitch.tv", "Twitch"), ("linkedin.com", "LinkedIn"),
             ("threads.", "Threads"), ("bsky.app", "Bluesky"), ("dailymotion.com", "Dailymotion"), ("pinterest.", "Pinterest")]
STATUS_TR = {"done": "Tamamlanan", "active": "Sürenler", "error": "Hatalı"}
SOURCE_TR = {"extension": "Eklenti", "telegram": "Telegram", "web": "Web"}
SOURCE_IC = {"extension": "puzzle", "telegram": "send", "web": "globe"}


def platform_of(url):
    host = urlparse(url).netloc.lower()
    for key, name in PLATFORMS:
        if key in host:
            return name
    return host.replace("www.", "") or "?"


def fmt_dt(ts):
    t = dt.datetime.fromtimestamp(ts, TRZ)
    return f"{t.day} {AYLAR[t.month - 1]} {t.year}, {t:%H:%M}"


def day_label(ts):
    t = dt.datetime.fromtimestamp(ts, TRZ).date(); today = dt.datetime.now(TRZ).date()
    if t == today: return "Bugün"
    if t == today - dt.timedelta(days=1): return "Dün"
    return f"{t.day} {AYLAR[t.month - 1]} {t.year}"


def sel(name, value, options):
    opts = "".join(f'<option value="{esc(k)}"{" selected" if k == value else ""}>{esc(v)}</option>' for k, v in options)
    return f'<select name="{name}" onchange="this.form.submit()">{opts}</select>'


@app.get("/indirilenler", response_class=HTMLResponse)
def downloads_page(q: str = "", durum: str = "", tur: str = "", platform: str = "", kaynak: str = "",
                   tarih: str = "", sira: str = "yeni"):
    all_dl = db.dl_list(2000)
    for d in all_dl:
        d["platform"] = platform_of(d["url"])
    now = time.time()
    since = {"bugun": telegram.day_start(), "7": now - 7 * 86400, "30": now - 30 * 86400}.get(tarih)
    ql = q.strip().lower()
    rows = [d for d in all_dl
            if (not ql or ql in (d["title"] + " " + d["url"] + " " + d["file"]).lower())
            and (not durum or (d["status"] in ("queued", "running") if durum == "active" else d["status"] == durum))
            and (not tur or d["kind"] == tur)
            and (not platform or d["platform"] == platform)
            and (not kaynak or d["source"] == kaynak)
            and (not since or d["created_at"] >= since)]
    if sira == "eski": rows.sort(key=lambda d: d["created_at"])
    elif sira == "boyut": rows.sort(key=lambda d: -d["size"])
    elif sira == "ad": rows.sort(key=lambda d: (d["title"] or d["url"]).lower())

    platforms = sorted({d["platform"] for d in all_dl})
    filters = (
        f'<form class="filters" method="get" action="/indirilenler">'
        f'<span class="field fsearch">{ic("search")}<input name="q" value="{esc(q)}" placeholder="Başlıkta veya linkte ara…"></span>'
        + sel("durum", durum, [("", "Tüm durumlar")] + list(STATUS_TR.items()))
        + sel("tur", tur, [("", "Video + ses"), ("video", "Video"), ("audio", "Ses")])
        + sel("platform", platform, [("", "Tüm platformlar")] + [(p_, p_) for p_ in platforms])
        + sel("kaynak", kaynak, [("", "Tüm kaynaklar")] + list(SOURCE_TR.items()))
        + sel("tarih", tarih, [("", "Tüm zamanlar"), ("bugun", "Bugün"), ("7", "Son 7 gün"), ("30", "Son 30 gün")])
        + sel("sira", sira, [("yeni", "Yeniden eskiye"), ("eski", "Eskiden yeniye"), ("boyut", "Büyükten küçüğe"), ("ad", "Ada göre")])
        + ('<a class="clear" href="/indirilenler">temizle</a>' if any([q, durum, tur, platform, kaynak, tarih]) or sira != "yeni" else "")
        + '</form>')
    total = sum(d["size"] for d in rows if d["status"] == "done")
    summary = f'<p class="summary">{len(rows)} sonuç' + (f' · {human(total)}' if total else "") + (f' · toplam {len(all_dl)} indirme' if len(rows) != len(all_dl) else "") + '</p>'

    out, last_day = [], None
    for d in rows:
        if sira in ("yeni", "eski"):
            lbl = day_label(d["created_at"])
            if lbl != last_day:
                out.append(f'<h2 class="day">{lbl}</h2>'); last_day = lbl
        st = {"queued": f'<span class="st q">{ic("clock")} sırada</span>',
              "running": f'<span class="st r">{ic("spinner", "spin")} %{d["progress"]:.0f}</span>',
              "done": f'<span class="st ok">{ic("check")} tamamlandı</span>',
              "error": f'<span class="st err">{ic("alert")} hata</span>'}[d["status"]]
        name = esc(d["title"] or d["url"])
        act = (f'<div class="acts"><a class="navbtn play" href="/files/{d["id"]}?izle=1" target="_blank">{ic("play")} İzle</a>'
               f'<a class="navbtn" href="/files/{d["id"]}" download>{ic("download")} {human(d["size"])}</a></div>' if d["status"] == "done" else "")
        err = f'<p class="note">{esc(d["error"])}</p>' if d["error"] else ""
        out.append(f'''<article class="card dlcard"><div class="fav dl">{ic("music" if d["kind"] == "audio" else "video")}</div>
  <div class="body"><a class="title" href="{esc(d['url'])}" target="_blank" rel="noreferrer">{name}</a>
  <div class="meta"><span class="pill">{esc(d['platform'])}</span> {st}<span class="m">{ic("calendar")} {fmt_dt(d['created_at'])} <span class="muted">· {ago(d['created_at'])}</span></span><span class="m">{ic(SOURCE_IC.get(d['source'], "globe"))} {SOURCE_TR.get(d['source'], esc(d['source']))}</span></div>{err}</div>{act}
  <form method="post" action="/ui/dl-delete" onsubmit="return confirm('Silinsin mi? (dosya da silinir)')">
  <input type="hidden" name="id" value="{d['id']}"><button class="del" title="Sil" aria-label="Sil">{ic("x")}</button></form></article>''')
    busy = any(d["status"] in ("queued", "running") for d in all_dl)
    empty = '<div class="empty">' + ("Bu filtrelere uyan indirme yok." if all_dl else "Henüz indirme yok.") + '</div>'
    return f'''<!doctype html><html lang="tr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Raf · İndirilenler</title>
<link rel="icon" href="/static/icon.svg"><link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" href="/static/apple-touch-icon.png"><meta name="theme-color" content="#d9ccff"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="Raf"><meta name="apple-mobile-web-app-status-bar-style" content="default"><script>if("serviceWorker" in navigator)navigator.serviceWorker.register("/sw.js")</script><link rel="stylesheet" href="/static/style.css"></head><body>
<header class="top"><a class="brand" href="/"><img src="/static/icon.svg" alt=""> Raf</a>
<form class="search" method="post" action="/ui/dl-new"><span class="field">{ic("plus")}<input name="url" type="url" inputmode="url" placeholder="Video linki yapıştır → Enter"></span></form>
<div class="stats"><a class="navbtn" href="/">{ic("library")} Raf</a></div></header>
<main><h1>{ic("download")} İndirilenler</h1>{filters}{summary}<section class="list">{"".join(out) or empty}</section></main>
{'<script>setTimeout(function r(){var a=document.activeElement;if(a&&(a.tagName==="INPUT"||a.tagName==="SELECT"))return setTimeout(r,3000);location.reload()},3000)</script>' if busy else ''}
</body></html>'''


@app.post("/ui/dl-new")
def ui_dl_new(url: str = Form(...)):
    if url.startswith(("http://", "https://")):
        downloads.enqueue(url.strip(), "video", "web")
    return RedirectResponse("/indirilenler", status_code=303)


@app.post("/ui/dl-delete")
def ui_dl_delete(id: int = Form(...)):
    d = db.dl_get(id)
    if d:
        p = downloads.path_of(d)
        if p: os.remove(p)
        db.dl_delete(id)
    return RedirectResponse("/indirilenler", status_code=303)


@app.post("/ui/save")
def ui_save(url: str = Form(...), tags: str = Form(""), indir: str = Form("")):
    url = url.strip()
    if url.startswith(("http://", "https://")):
        title, desc = telegram.fetch_title(url)
        db.save(url, title=title, description=desc, tags=[t for t in re.split(r"[,\s#]+", tags) if t], source="web")
        if indir:
            downloads.enqueue(url, "video", "web")
            return RedirectResponse("/indirilenler", status_code=303)
    return RedirectResponse("/", status_code=303)


@app.get("/paylas")
def share_target(url: str = "", text: str = "", title: str = ""):
    """Android 'Paylaş → Raf': linki kaydet."""
    m = re.search(r"https?://\S+", url or text or "")
    if m:
        t, d = telegram.fetch_title(m.group(0))
        db.save(m.group(0), title=t or title, description=d, source="web")
    return RedirectResponse("/", status_code=303)


@app.post("/ui/delete")
def ui_delete(id: int = Form(...), request: Request = None):
    db.delete(id)
    return RedirectResponse(request.headers.get("referer") or "/", status_code=303)


@app.get("/kurulum", response_class=HTMLResponse)
def setup_page():
    return '''<!doctype html><html lang="tr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Raf · Kurulum</title>
<link rel="icon" href="/static/icon.svg"><link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" href="/static/apple-touch-icon.png"><meta name="theme-color" content="#d9ccff"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="Raf"><meta name="apple-mobile-web-app-status-bar-style" content="default"><script>if("serviceWorker" in navigator)navigator.serviceWorker.register("/sw.js")</script><link rel="stylesheet" href="/static/style.css"></head><body>
<header class="top"><a class="brand" href="/"><img src="/static/icon.svg" alt=""> Raf</a></header>
<main class="prose"><h1>Chrome eklentisi kurulumu</h1><ol>
<li><a href="/extension.zip"><b>raf-eklenti.zip</b></a> dosyasını indir ve bir klasöre çıkar (ör. <code>Belgeler\\raf-eklenti</code>). Klasörü silme, Chrome oradan çalıştırır.</li>
<li>Chrome'da <code>chrome://extensions</code> adresini aç, sağ üstten <b>Geliştirici modu</b>nu aç.</li>
<li><b>Paketlenmemiş öğe yükle</b> → çıkardığın klasörü seç.</li>
<li>Yapboz simgesinden Raf'ı <b>sabitle</b>. Sunucu adresi ve anahtar hazır gelir, ayar gerekmez.</li>
</ol><h2>Kullanım</h2><ul>
<li>Simgeye tıkla → etiket/not ekle → <b>Rafa kaldır</b>.</li>
<li>Hızlı kayıt: <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd></li>
<li>Sağ tık: “Bu sayfayı / linki rafa kaldır”, seçili metni not olarak kaydet.</li>
<li>Telefonda: linki Telegram botuna gönder.</li></ul>
<p>Güncelleme: yeni zip'i aynı klasöre çıkar, <code>chrome://extensions</code>'ta Raf'ın ↻ simgesine bas.</p></main></body></html>'''
