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

from . import db, downloads, telegram, web
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
        raise HTTPException(401, "Invalid API token")


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
        raise HTTPException(400, "Only http/https links can be saved")
    data = item.model_dump(); shot = data.pop("screenshot")
    saved, new = db.save(**data)
    if shot.startswith("data:image/"):
        raw = base64.b64decode(shot.split(",", 1)[1])
        if len(raw) > 8_000_000:
            raise HTTPException(413, "Screenshot is too large")
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
    quality: int = 0     # max video height (e.g. 2160, 1080, 720); 0 = default


def dl_public(d):
    d = dict(d); d.setdefault("reused", False); d["file_url"] = f"{PUBLIC_URL}/files/{d['id']}" if d["status"] == "done" else ""
    return d


@app.post("/api/downloads", dependencies=[Depends(auth)])
def api_dl_create(body: DownloadIn):
    if not body.url.startswith(("http://", "https://")):
        raise HTTPException(400, "Invalid link")
    return dl_public(downloads.enqueue(body.url, body.kind, "extension", body.cookies, body.quality))


class SendIn(BaseModel):
    url: str
    title: str = ""
    note: str = ""
    tags: list[str] = Field(default_factory=list)


@app.post("/api/send-to-phone", dependencies=[Depends(auth)])
def api_send_to_phone(body: SendIn):
    """Send a link to the owner's Telegram (opens on the phone in one tap)."""
    if not telegram.TOKEN or not telegram.OWNER:
        raise HTTPException(400, "Telegram is not configured on the Raf server")
    if not body.url.startswith(("http://", "https://")):
        raise HTTPException(400, "Invalid link")
    title = html.escape((body.title or body.url)[:200])
    extra = ""
    tags = [re.sub(r"[^\w]+", "_", t.strip().lstrip("#")) for t in body.tags if t.strip()]
    if tags:
        extra += "\n" + " ".join("#" + html.escape(t) for t in tags[:20])
    if body.note.strip():
        extra += "\n📝 " + html.escape(body.note.strip()[:1000])
    telegram.send(telegram.OWNER, f'📱 <a href="{html.escape(body.url, quote=True)}">{title}</a>\n<code>{html.escape(body.url[:300])}</code>{extra}')
    return {"ok": True}


class FormatsIn(BaseModel):
    url: str
    cookies: str = ""


@app.post("/api/formats", dependencies=[Depends(auth)])
def api_formats(body: FormatsIn):
    if not body.url.startswith(("http://", "https://")):
        raise HTTPException(400, "Invalid link")
    try:
        return downloads.formats(body.url, body.cookies)
    except Exception as e:
        msg = str(e).replace("ERROR: ", "")
        raise HTTPException(422, msg[:300])


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
def manifest(request: Request):
    tr = web.lang_of(request) == "tr"
    return JSONResponse({
        "name": "Raf", "short_name": "Raf",
        "description": "Kaydettiğin sayfalar ve indirdiğin videolar" if tr else "Your saved pages and downloaded videos",
        "start_url": "/", "scope": "/", "display": "standalone", "background_color": "#fffaf4", "theme_color": "#d9ccff",
        "icons": [
            {"src": "/static/icon-192.png", "sizes": "192x192", "type": "image/png"},
            {"src": "/static/icon-512.png", "sizes": "512x512", "type": "image/png"},
            {"src": "/static/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}],
        "lang": "tr" if tr else "en",
        "shortcuts": [{"name": "İndirilenler" if tr else "Downloads", "url": "/indirilenler"}],
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
        z.writestr("config.js", "// Generated by your Raf server when downloading the extension\n"
                   f"self.RAF_DEFAULTS = {json.dumps({'server': PUBLIC_URL, 'token': API_TOKEN})};\n")
    return Response(buf.getvalue(), media_type="application/zip",
                    headers={"Content-Disposition": 'attachment; filename="raf-eklenti.zip"'})


# ------------------------------------------------------------------ Web UI (en/tr) → web.py
app.include_router(web.router)
