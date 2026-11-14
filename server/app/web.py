"""Raf web UI (server-rendered, English + Turkish).

Language: ?/lang/<code> sets a cookie; otherwise the browser's Accept-Language decides (tr → Turkish, else English).
"""
import datetime as dt
import html
import os
import re
import time
from urllib.parse import urlencode, urlparse

from fastapi import APIRouter, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from . import db, downloads, telegram
from .icons import ic

router = APIRouter()
LANGS = ("en", "tr")
COOKIE = "raf_lang"

S = {  # key: (English, Türkçe)
    "search_shelf": ("Search your shelf…", "Rafta ara…"),
    "today": ("Today", "Bugün"), "total": ("Total", "Toplam"), "downloads": ("Downloads", "İndirilenler"),
    "paste_link": ("Paste a link…", "Link yapıştır…"), "tags_ph": ("tags (comma separated)", "etiketler (virgülle)"),
    "also_download": ("Also download the video", "Videoyu da indir"), "save": ("Save to Raf", "Rafa kaldır"),
    "on_shelf": ("On your shelf", "Rafındakiler"), "results_for": ("Results for “{}”", "“{}” için sonuçlar"), "clear": ("clear", "temizle"),
    "empty_shelf": ("Nothing here yet.<br>Paste a link above, or use the extension or the Telegram bot.",
                    "Burada henüz bir şey yok.<br>Yukarıya link yapıştır, eklentiyi ya da Telegram botunu kullan."),
    "newer": ("← Newer", "← Yeni"), "older": ("Older →", "Eski →"),
    "get_ext": ("Get the Chrome extension", "Chrome eklentisini indir"), "setup": ("Setup", "Kurulum"),
    "delete_q": ("Delete?", "Silinsin mi?"), "delete": ("Delete", "Sil"),
    "delete_dl_q": ("Delete? (the file is deleted too)", "Silinsin mi? (dosya da silinir)"),
    "paste_video": ("Paste a video link → Enter", "Video linki yapıştır → Enter"),
    "search_dl": ("Search titles or links…", "Başlıkta veya linkte ara…"),
    "st_all": ("All statuses", "Tüm durumlar"), "st_done": ("Finished", "Tamamlanan"), "st_active": ("In progress", "Sürenler"), "st_error": ("Failed", "Hatalı"),
    "k_all": ("Video + audio", "Video + ses"), "k_video": ("Video", "Video"), "k_audio": ("Audio", "Ses"),
    "pf_all": ("All platforms", "Tüm platformlar"), "src_all": ("All sources", "Tüm kaynaklar"),
    "src_extension": ("Extension", "Eklenti"), "src_telegram": ("Telegram", "Telegram"), "src_web": ("Web", "Web"),
    "d_all": ("Any time", "Tüm zamanlar"), "d_today": ("Today", "Bugün"), "d_7": ("Last 7 days", "Son 7 gün"), "d_30": ("Last 30 days", "Son 30 gün"),
    "s_new": ("Newest first", "Yeniden eskiye"), "s_old": ("Oldest first", "Eskiden yeniye"), "s_size": ("Largest first", "Büyükten küçüğe"), "s_name": ("By name", "Ada göre"),
    "n_results": ("{} results", "{} sonuç"), "of_total": ("of {} downloads", "toplam {} indirme"),
    "queued": ("queued", "sırada"), "done": ("finished", "tamamlandı"), "error": ("failed", "hata"),
    "watch": ("Watch", "İzle"), "no_match": ("No downloads match these filters.", "Bu filtrelere uyan indirme yok."),
    "no_dl": ("No downloads yet.", "Henüz indirme yok."), "yesterday": ("Yesterday", "Dün"),
    "just_now": ("just now", "az önce"), "m_ago": ("{} min ago", "{} dk önce"), "h_ago": ("{} h ago", "{} sa önce"), "d_ago": ("{} days ago", "{} gün önce"),
    "lang_switch": ("Türkçe", "English"),
}
MONTHS = {"en": ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
          "tr": ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"]}
TRZ = dt.timezone(dt.timedelta(hours=3))
PLATFORMS = [("youtube.com", "YouTube"), ("youtu.be", "YouTube"), ("x.com", "X"), ("twitter.com", "X"),
             ("instagram.com", "Instagram"), ("tiktok.com", "TikTok"), ("facebook.com", "Facebook"), ("fb.watch", "Facebook"),
             ("vimeo.com", "Vimeo"), ("reddit.com", "Reddit"), ("twitch.tv", "Twitch"), ("linkedin.com", "LinkedIn"),
             ("threads.", "Threads"), ("bsky.app", "Bluesky"), ("dailymotion.com", "Dailymotion"), ("pinterest.", "Pinterest")]
SOURCE_IC = {"extension": "puzzle", "telegram": "send", "web": "globe"}


def lang_of(request: Request) -> str:
    c = request.cookies.get(COOKIE)
    if c in LANGS:
        return c
    al = (request.headers.get("accept-language") or "").lower()
    return "tr" if al.startswith("tr") or ",tr" in al.replace(" ", "") else "en"


def T(lang):
    i = 0 if lang == "en" else 1
    return lambda key, *a: S[key][i].format(*a) if a else S[key][i]


def esc(s):
    return html.escape(str(s or ""), quote=True)


def human(n):
    for u in ["B", "KB", "MB", "GB"]:
        if n < 1024: return f"{n:.0f} {u}" if u in ("B", "KB") else f"{n:.1f} {u}"
        n /= 1024
    return f"{n:.1f} TB"


def ago(ts, _):
    s = int(time.time() - ts)
    if s < 60: return _("just_now")
    if s < 3600: return _("m_ago", s // 60)
    if s < 86400: return _("h_ago", s // 3600)
    if s < 86400 * 30: return _("d_ago", s // 86400)
    return time.strftime("%d.%m.%Y", time.localtime(ts))


def fmt_dt(ts, lang):
    t = dt.datetime.fromtimestamp(ts, TRZ)
    m = MONTHS[lang][t.month - 1]
    return f"{m} {t.day}, {t.year} · {t:%H:%M}" if lang == "en" else f"{t.day} {m} {t.year}, {t:%H:%M}"


def day_label(ts, lang, _):
    t = dt.datetime.fromtimestamp(ts, TRZ).date(); today = dt.datetime.now(TRZ).date()
    if t == today: return _("today")
    if t == today - dt.timedelta(days=1): return _("yesterday")
    m = MONTHS[lang][t.month - 1]
    return f"{m} {t.day}, {t.year}" if lang == "en" else f"{t.day} {m} {t.year}"


def platform_of(url):
    host = urlparse(url).netloc.lower()
    for key, name in PLATFORMS:
        if key in host:
            return name
    return host.replace("www.", "") or "?"


def head(title, lang):
    return f'''<!doctype html><html lang="{lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>{esc(title)}</title>
<link rel="icon" href="/static/icon.svg"><link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" href="/static/apple-touch-icon.png">
<meta name="theme-color" content="#d9ccff"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Raf"><meta name="apple-mobile-web-app-status-bar-style" content="default">
<script>if("serviceWorker" in navigator)navigator.serviceWorker.register("/sw.js")</script><link rel="stylesheet" href="/static/style.css"></head><body>'''


def lang_btn(request, lang):
    other = "tr" if lang == "en" else "en"
    nxt = request.url.path + (("?" + request.url.query) if request.url.query else "")
    return f'<a class="langbtn" href="/lang/{other}?{urlencode({"next": nxt})}" title="{esc(S["lang_switch"][0 if lang == "en" else 1])}">{ic("globe")} {other.upper()}</a>'


@router.get("/lang/{code}")
def set_lang(code: str, next: str = "/"):
    if not next.startswith("/") or next.startswith("//"):
        next = "/"
    r = RedirectResponse(next, status_code=303)
    if code in LANGS:
        r.set_cookie(COOKIE, code, max_age=365 * 86400, samesite="lax")
    return r


def card(it, lang, _):
    host = urlparse(it["url"]).netloc.replace("www.", "")
    fav = esc(it["favicon"]) or f"https://www.google.com/s2/favicons?domain={esc(host)}&sz=64"
    tags = "".join(f'<a class="tag" href="/?{urlencode({"tag": t})}">#{esc(t)}</a>' for t in it["tags"])
    note = f'<p class="note">{ic("note")} {esc(it["note"])}</p>' if it["note"] else ""
    desc = f'<p class="desc">{esc(it["description"][:220])}</p>' if it["description"] else ""
    src = ic(SOURCE_IC[it["source"]]) if it["source"] in SOURCE_IC else ""
    shot = (f'<a class="shot" href="/shots/{esc(it["screenshot"])}" target="_blank"><img src="/shots/{esc(it["screenshot"])}" alt="" loading="lazy"></a>'
            if it.get("screenshot") else "")
    return f'''<article class="card">
  <img class="fav" src="{fav}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
  <div class="body">
    <a class="title" href="{esc(it['url'])}" target="_blank" rel="noreferrer">{esc(it['title'] or it['url'])}</a>
    <div class="meta">{esc(host)} · {ago(it['created_at'], _)} {src}</div>
    {desc}{note}<div class="tags">{tags}</div>
  </div>
  {shot}
  <form method="post" action="/ui/delete" onsubmit="return confirm('{esc(_('delete_q'))}')">
    <input type="hidden" name="id" value="{it['id']}"><button class="del" title="{esc(_('delete'))}" aria-label="{esc(_('delete'))}">{ic("x")}</button>
  </form>
</article>'''


@router.get("/", response_class=HTMLResponse)
def index(request: Request, q: str = "", tag: str = "", page: int = 1):
    lang = lang_of(request); _ = T(lang)
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
        prev = f'<a href="/?{urlencode({"q": q, "tag": tag, "page": page - 1})}">{_("newer")}</a>' if page > 1 else "<span></span>"
        nxt = f'<a href="/?{urlencode({"q": q, "tag": tag, "page": page + 1})}">{_("older")}</a>' if more else ""
        nav = f'<nav class="pager">{prev}{nxt}</nav>'
    heading = f"#{esc(tag)}" if tag else (_("results_for", esc(q)) if q else _("on_shelf"))
    empty = f'<div class="empty">{ic("inbox", "big")}<br>{_("empty_shelf")}</div>'
    return head("Raf", lang) + f'''
<header class="top">
  <a class="brand" href="/"><img src="/static/icon.svg" alt=""> Raf</a>
  <form class="search" action="/"><span class="field">{ic("search")}<input name="q" value="{esc(q)}" placeholder="{esc(_("search_shelf"))}"></span></form>
  <div class="stats"><span>{_("today")} <b>{today}</b></span><span>{_("total")} <b>{total}</b></span><a class="navbtn" href="/indirilenler">{ic("download")} {_("downloads")}</a>{lang_btn(request, lang)}</div>
</header>
<main>
  <form class="addform" method="post" action="/ui/save">
    <span class="field wide">{ic("link")}<input name="url" type="url" inputmode="url" placeholder="{esc(_("paste_link"))}" required></span>
    <div class="addrow">
      <span class="field">{ic("tag")}<input name="tags" placeholder="{esc(_("tags_ph"))}"></span>
      <label class="switch"><input type="checkbox" name="indir" value="1"><span class="track"></span>{ic("video")} {_("also_download")}</label>
      <button>{ic("plus")} {_("save")}</button>
    </div>
  </form>
  <div class="chips">{tags}</div>
  <h1>{heading}{f' <a class="clear" href="/">{_("clear")}</a>' if (q or tag) else ''}</h1>
  <section class="list">{"".join(card(i, lang, _) for i in items) or empty}</section>
  {nav}
  <footer><a href="/extension.zip">{ic("puzzle")} {_("get_ext")}</a> · <a href="/kurulum">{_("setup")}</a></footer>
</main></body></html>'''


def sel(name, value, options):
    opts = "".join(f'<option value="{esc(k)}"{" selected" if k == value else ""}>{esc(v)}</option>' for k, v in options)
    return f'<select name="{name}" onchange="this.form.submit()">{opts}</select>'


@router.get("/downloads", response_class=HTMLResponse)
@router.get("/indirilenler", response_class=HTMLResponse)
def downloads_page(request: Request, q: str = "", durum: str = "", tur: str = "", platform: str = "", kaynak: str = "",
                   tarih: str = "", sira: str = "yeni"):
    lang = lang_of(request); _ = T(lang)
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
    path = request.url.path
    filters = (
        f'<form class="filters" method="get" action="{path}">'
        f'<span class="field fsearch">{ic("search")}<input name="q" value="{esc(q)}" placeholder="{esc(_("search_dl"))}"></span>'
        + sel("durum", durum, [("", _("st_all")), ("done", _("st_done")), ("active", _("st_active")), ("error", _("st_error"))])
        + sel("tur", tur, [("", _("k_all")), ("video", _("k_video")), ("audio", _("k_audio"))])
        + sel("platform", platform, [("", _("pf_all"))] + [(p_, p_) for p_ in platforms])
        + sel("kaynak", kaynak, [("", _("src_all"))] + [(k, _("src_" + k)) for k in ("extension", "telegram", "web")])
        + sel("tarih", tarih, [("", _("d_all")), ("bugun", _("d_today")), ("7", _("d_7")), ("30", _("d_30"))])
        + sel("sira", sira, [("yeni", _("s_new")), ("eski", _("s_old")), ("boyut", _("s_size")), ("ad", _("s_name"))])
        + (f'<a class="clear" href="{path}">{_("clear")}</a>' if any([q, durum, tur, platform, kaynak, tarih]) or sira != "yeni" else "")
        + '</form>')
    total = sum(d["size"] for d in rows if d["status"] == "done")
    summary = (f'<p class="summary">{_("n_results", len(rows))}' + (f' · {human(total)}' if total else "")
               + (f' · {_("of_total", len(all_dl))}' if len(rows) != len(all_dl) else "") + '</p>')

    out, last_day = [], None
    for d in rows:
        if sira in ("yeni", "eski"):
            lbl = day_label(d["created_at"], lang, _)
            if lbl != last_day:
                out.append(f'<h2 class="day">{lbl}</h2>'); last_day = lbl
        st = {"queued": f'<span class="st q">{ic("clock")} {_("queued")}</span>',
              "running": f'<span class="st r">{ic("spinner", "spin")} {d["progress"]:.0f}%</span>',
              "done": f'<span class="st ok">{ic("check")} {_("done")}</span>',
              "error": f'<span class="st err">{ic("alert")} {_("error")}</span>'}[d["status"]]
        name = esc(d["title"] or d["url"])
        act = (f'<div class="acts"><a class="navbtn play" href="/files/{d["id"]}?izle=1" target="_blank">{ic("play")} {_("watch")}</a>'
               f'<a class="navbtn" href="/files/{d["id"]}" download>{ic("download")} {human(d["size"])}</a></div>' if d["status"] == "done" else "")
        err = f'<p class="note">{esc(d["error"])}</p>' if d["error"] else ""
        src = d["source"]
        out.append(f'''<article class="card dlcard"><div class="fav dl">{ic("music" if d["kind"] == "audio" else "video")}</div>
  <div class="body"><a class="title" href="{esc(d['url'])}" target="_blank" rel="noreferrer">{name}</a>
  <div class="meta"><span class="pill">{esc(d['platform'])}</span> {st}<span class="m">{ic("calendar")} {fmt_dt(d['created_at'], lang)} <span class="muted">· {ago(d['created_at'], _)}</span></span><span class="m">{ic(SOURCE_IC.get(src, "globe"))} {_("src_" + src) if src in SOURCE_IC else esc(src)}</span></div>{err}</div>{act}
  <form method="post" action="/ui/dl-delete" onsubmit="return confirm('{esc(_('delete_dl_q'))}')">
  <input type="hidden" name="id" value="{d['id']}"><button class="del" title="{esc(_('delete'))}" aria-label="{esc(_('delete'))}">{ic("x")}</button></form></article>''')
    busy = any(d["status"] in ("queued", "running") for d in all_dl)
    empty = f'<div class="empty">{_("no_match") if all_dl else _("no_dl")}</div>'
    return head(f"Raf · {_('downloads')}", lang) + f'''
<header class="top"><a class="brand" href="/"><img src="/static/icon.svg" alt=""> Raf</a>
<form class="search" method="post" action="/ui/dl-new"><span class="field">{ic("plus")}<input name="url" type="url" inputmode="url" placeholder="{esc(_("paste_video"))}"></span></form>
<div class="stats"><a class="navbtn" href="/">{ic("library")} Raf</a>{lang_btn(request, lang)}</div></header>
<main><h1>{ic("download")} {_("downloads")}</h1>{filters}{summary}<section class="list">{"".join(out) or empty}</section></main>
{'<script>setTimeout(function r(){var a=document.activeElement;if(a&&(a.tagName==="INPUT"||a.tagName==="SELECT"))return setTimeout(r,3000);location.reload()},3000)</script>' if busy else ''}
</body></html>'''


@router.post("/ui/dl-new")
def ui_dl_new(url: str = Form(...)):
    if url.startswith(("http://", "https://")):
        downloads.enqueue(url.strip(), "video", "web")
    return RedirectResponse("/indirilenler", status_code=303)


@router.post("/ui/dl-delete")
def ui_dl_delete(id: int = Form(...)):
    d = db.dl_get(id)
    if d:
        p = downloads.path_of(d)
        if p: os.remove(p)
        db.dl_delete(id)
    return RedirectResponse("/indirilenler", status_code=303)


@router.post("/ui/save")
def ui_save(url: str = Form(...), tags: str = Form(""), indir: str = Form("")):
    url = url.strip()
    if url.startswith(("http://", "https://")):
        title, desc = telegram.fetch_title(url)
        db.save(url, title=title, description=desc, tags=[t for t in re.split(r"[,\s#]+", tags) if t], source="web")
        if indir:
            downloads.enqueue(url, "video", "web")
            return RedirectResponse("/indirilenler", status_code=303)
    return RedirectResponse("/", status_code=303)


@router.get("/paylas")
def share_target(url: str = "", text: str = "", title: str = ""):
    """Android share target: save the shared link."""
    m = re.search(r"https?://\S+", url or text or "")
    if m:
        t, d = telegram.fetch_title(m.group(0))
        db.save(m.group(0), title=t or title, description=d, source="web")
    return RedirectResponse("/", status_code=303)


@router.post("/ui/delete")
def ui_delete(request: Request, id: int = Form(...)):
    db.delete(id)
    return RedirectResponse(request.headers.get("referer") or "/", status_code=303)


SETUP = {
    "en": '''<h1>Installing the Chrome extension</h1><ol>
<li>Download <a href="/extension.zip"><b>raf-eklenti.zip</b></a> and unzip it into a folder (e.g. <code>Documents\\raf</code>). Keep the folder — Chrome runs the extension from there.</li>
<li>Open <code>chrome://extensions</code> and turn on <b>Developer mode</b> (top right).</li>
<li><b>Load unpacked</b> → pick the folder you unzipped.</li>
<li><b>Pin</b> Raf from the puzzle icon. The server URL and token are already filled in.</li>
</ol><h2>Using it</h2><ul>
<li>Click the icon → add tags / a note → <b>Save to Raf</b>.</li>
<li>Quick save: <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> · fill a form with test data: <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd></li>
<li>Hover a video on YouTube, X, Instagram… → <b>Raf</b> → pick a quality.</li>
<li>On your phone: send the link to the Telegram bot.</li></ul>
<p>Updating: unzip the new zip over the same folder, then press ↻ on Raf in <code>chrome://extensions</code>.</p>''',
    "tr": '''<h1>Chrome eklentisi kurulumu</h1><ol>
<li><a href="/extension.zip"><b>raf-eklenti.zip</b></a> dosyasını indir ve bir klasöre çıkar (ör. <code>Belgeler\\raf</code>). Klasörü silme, Chrome oradan çalıştırır.</li>
<li>Chrome'da <code>chrome://extensions</code> adresini aç, sağ üstten <b>Geliştirici modu</b>nu aç.</li>
<li><b>Paketlenmemiş öğe yükle</b> → çıkardığın klasörü seç.</li>
<li>Yapboz simgesinden Raf'ı <b>sabitle</b>. Sunucu adresi ve anahtar hazır gelir, ayar gerekmez.</li>
</ol><h2>Kullanım</h2><ul>
<li>Simgeye tıkla → etiket/not ekle → <b>Rafa kaldır</b>.</li>
<li>Hızlı kayıt: <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> · formu test verisiyle doldur: <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd></li>
<li>YouTube, X, Instagram… videosunun üstüne gel → <b>Raf</b> → kalite seç.</li>
<li>Telefonda: linki Telegram botuna gönder.</li></ul>
<p>Güncelleme: yeni zip'i aynı klasöre çıkar, <code>chrome://extensions</code>'ta Raf'ın ↻ simgesine bas.</p>''',
}


@router.get("/setup", response_class=HTMLResponse)
@router.get("/kurulum", response_class=HTMLResponse)
def setup_page(request: Request):
    lang = lang_of(request); _ = T(lang)
    return head(f"Raf · {_('setup')}", lang) + f'''
<header class="top"><a class="brand" href="/"><img src="/static/icon.svg" alt=""> Raf</a><div class="stats">{lang_btn(request, lang)}</div></header>
<main class="prose">{SETUP[lang]}</main></body></html>'''
