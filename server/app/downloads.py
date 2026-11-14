"""Video/ses indirme kuyruğu (yt-dlp). Tek işçi: sırayla indirir, ilerlemeyi veritabanına yazar.
Dosyalar VIDEO_DIR'e (/videos → sunucuda /srv/media/Videos) kaydedilir.
Instagram / X gibi giriş isteyen siteler için /data/cookies.txt (Netscape biçimi) varsa kullanılır."""
import os
import threading
import time
import traceback

from . import db

VIDEO_DIR = os.environ.get("RAF_VIDEO_DIR", "/videos")
COOKIES = os.environ.get("RAF_COOKIES", "/data/cookies.txt")
MAX_HEIGHT = int(os.environ.get("RAF_MAX_HEIGHT", "1080"))
_wake = threading.Event()
_cookies = {}  # indirme id → Netscape çerez metni (sadece bellekte, iş bitince silinir)
on_finished = []  # (download_dict) -> None ; telegram bildirimi buraya kaydolur


def enqueue(url, kind="video", source="extension", cookies="", quality=0):
    kind = kind if kind in ("video", "audio") else "video"
    quality = int(quality or 0) if kind == "video" else 0
    same = db.dl_find_recent(url, kind, quality)
    if same and (same["status"] != "done" or path_of(same)):
        same["reused"] = True   # çift tıklama / tekrar isteme: aynı işi döndür, yeniden indirme
        return same
    d = db.dl_create(url, kind, source, quality)
    if cookies.strip():
        _cookies[d["id"]] = cookies
    _wake.set()
    return d


def _opts(dl_id, kind, cookiefile=None, quality=0):
    last = {"t": 0}

    def hook(h):
        if h.get("status") == "downloading" and time.time() - last["t"] > 1:
            last["t"] = time.time()
            total = h.get("total_bytes") or h.get("total_bytes_estimate") or 0
            pct = (h.get("downloaded_bytes", 0) / total * 100) if total else 0
            db.dl_update(dl_id, progress=round(min(pct, 99), 1))

    o = {
        "outtmpl": os.path.join(VIDEO_DIR, "%(title).90B [%(id)s].%(ext)s"),
        "windowsfilenames": True,          # Windows'ta sorunsuz açılsın
        "noplaylist": True,                # liste linkinde sadece o video
        "progress_hooks": [hook],
        "quiet": True, "no_warnings": True, "noprogress": True,
        "retries": 3, "fragment_retries": 3,
        "socket_timeout": 30,
    }
    if cookiefile:
        o["cookiefile"] = cookiefile
    elif os.path.exists(COOKIES):
        o["cookiefile"] = COOKIES
    if kind == "audio":
        o["format"] = "bestaudio/best"
        o["postprocessors"] = [{"key": "FFmpegExtractAudio", "preferredcodec": "mp3", "preferredquality": "192"}]
    else:
        h = int(quality) or MAX_HEIGHT
        # iPhone uyumu için önce H.264 (avc1); yoksa en iyisi alınır, sonra gerekirse dönüştürülür
        o["format"] = (f"bv*[height<={h}][vcodec^=avc1]+ba[ext=m4a]/b[height<={h}][vcodec^=avc1]/"
                       f"bv*[height<={h}][ext=mp4]+ba[ext=m4a]/b[height<={h}][ext=mp4]/"
                       f"bv*[height<={h}]+ba/b[height<={h}]/b")
        o["merge_output_format"] = "mp4"
    return o


def _codec(path):
    import subprocess
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name",
                        "-of", "csv=p=0", path], capture_output=True, text=True, timeout=60)
    return r.stdout.strip()


def _ensure_ios(dl_id, path):
    """VP9/AV1 gibi iPhone'un oynatamadığı/kaydedemediği videoları H.264'e çevir."""
    import subprocess
    codec = _codec(path)
    if not codec or codec in ("h264", "hevc"):
        return path
    import subprocess as _sp
    h = _sp.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=height", "-of", "csv=p=0", path],
                capture_output=True, text=True, timeout=60).stdout.strip()
    if h.isdigit() and int(h) > 1080:
        return path  # 2K/4K: keep VP9/AV1 (re-encoding would take hours on this CPU)
    tmp = os.path.splitext(path)[0] + ".h264.mp4"
    r = subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", path, "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
                        "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", "-threads", "2", tmp],
                       capture_output=True, text=True, timeout=3 * 3600)
    if r.returncode != 0 or not os.path.exists(tmp):
        if os.path.exists(tmp): os.remove(tmp)
        return path  # dönüştürülemezse orijinali bırak
    final = os.path.splitext(path)[0] + ".mp4"
    os.remove(path)
    os.replace(tmp, final)
    return final


def _run(d):
    import yt_dlp
    db.dl_update(d["id"], status="running", progress=0)
    cookiefile = None
    if d["id"] in _cookies:
        import tempfile
        fd, cookiefile = tempfile.mkstemp(prefix="raf-ck-", suffix=".txt")
        with os.fdopen(fd, "w") as f:
            f.write(_cookies.pop(d["id"]))
    try:
        with yt_dlp.YoutubeDL(_opts(d["id"], d["kind"], cookiefile, d.get("quality") or 0)) as ydl:
            info = ydl.extract_info(d["url"], download=True)
            if info.get("_type") == "playlist" and info.get("entries"):
                info = info["entries"][0]
            path = (info.get("requested_downloads") or [{}])[0].get("filepath") or ydl.prepare_filename(info)
        if d["kind"] == "audio":
            path = os.path.splitext(path)[0] + ".mp3"
        if not os.path.exists(path):
            raise RuntimeError("Downloaded file not found")
        if d["kind"] == "video":
            db.dl_update(d["id"], progress=99)
            path = _ensure_ios(d["id"], path)
        db.dl_update(d["id"], status="done", progress=100, title=(info.get("title") or "")[:300],
                     file=os.path.basename(path), size=os.path.getsize(path), finished_at=int(time.time()))
    except Exception as e:
        msg = str(e).replace("\x1b", "")
        for marker in ("ERROR: ", "[0;31mERROR:[0m "):
            msg = msg.replace(marker, "")
        if "logged-in" in msg or "login" in msg.lower() or "empty media response" in msg:
            msg = "This site requires login — download it from the extension (it uses your browser session). " + msg
        db.dl_update(d["id"], status="error", error=msg[:500], finished_at=int(time.time()))
    finally:
        if cookiefile and os.path.exists(cookiefile):
            os.remove(cookiefile)
    for cb in on_finished:
        try:
            cb(db.dl_get(d["id"]))
        except Exception:
            traceback.print_exc()


def _worker():
    # Yeniden başlatmada yarım kalanları kuyruğa geri al
    for d in db.dl_list(200):
        if d["status"] == "running":
            db.dl_update(d["id"], status="queued", progress=0)
    while True:
        d = db.dl_next_queued()
        if not d:
            _wake.wait(30); _wake.clear(); continue
        _run(d)


def start():
    os.makedirs(VIDEO_DIR, exist_ok=True)
    threading.Thread(target=_worker, daemon=True).start()


def path_of(d):
    p = os.path.join(VIDEO_DIR, d["file"])
    return p if d.get("file") and os.path.isfile(p) else None


# ---------- available qualities (for the in-page menu) ----------
_fmt_cache = {}


def _label(h):
    return "4K" if h >= 2160 else "2K" if h >= 1440 else f"{h}p"


def formats(url, cookies=""):
    """Return title + the video heights available for this URL with an estimated size for each."""
    import tempfile
    import yt_dlp
    key = url
    hit = _fmt_cache.get(key)
    if hit and time.time() - hit[0] < 600:
        return hit[1]
    cookiefile = None
    if cookies.strip():
        fd, cookiefile = tempfile.mkstemp(prefix="raf-ck-", suffix=".txt")
        with os.fdopen(fd, "w") as f:
            f.write(cookies)
    try:
        o = {"quiet": True, "no_warnings": True, "noplaylist": True, "skip_download": True, "socket_timeout": 20}
        if cookiefile:
            o["cookiefile"] = cookiefile
        elif os.path.exists(COOKIES):
            o["cookiefile"] = COOKIES
        with yt_dlp.YoutubeDL(o) as ydl:
            info = ydl.extract_info(url, download=False)
        if info.get("_type") == "playlist" and info.get("entries"):
            info = next((e for e in info["entries"] if e), info)
    finally:
        if cookiefile and os.path.exists(cookiefile):
            os.remove(cookiefile)
    fmts = info.get("formats") or []
    dur = info.get("duration") or 0

    def size(f):
        return f.get("filesize") or f.get("filesize_approx") or (int((f.get("tbr") or 0) * dur * 125) if dur else 0)

    audios = [f for f in fmts if f.get("acodec") not in (None, "none") and f.get("vcodec") in (None, "none")]
    best_audio = max(audios, key=lambda f: (f.get("ext") == "m4a", f.get("abr") or 0), default=None)
    a_size = size(best_audio) if best_audio else 0
    by_h = {}
    for f in fmts:
        h = f.get("height")
        if not h or f.get("vcodec") in (None, "none"):
            continue
        h = {2160: 2160, 1440: 1440}.get(h, h)
        cur = by_h.get(h)
        # prefer H.264 (plays everywhere), then the biggest stream at that height
        score = ((f.get("vcodec") or "").startswith("avc1"), size(f))
        if not cur or score > cur[0]:
            by_h[h] = (score, f)
    opts = []
    for h in sorted(by_h, reverse=True):
        f = by_h[h][1]
        vs = size(f)
        muxed = f.get("acodec") not in (None, "none")
        opts.append({"kind": "video", "quality": h, "label": _label(h), "size": vs + (0 if muxed else a_size),
                     "codec": (f.get("vcodec") or "").split(".")[0]})
    # one entry per label (e.g. several 1080p variants), max 6
    seen, uniq = set(), []
    for o_ in opts:
        if o_["label"] not in seen:
            seen.add(o_["label"]); uniq.append(o_)
    uniq = uniq[:6]
    if not uniq:  # site gives a single muxed file without height info
        uniq = [{"kind": "video", "quality": 0, "label": "Video", "size": 0, "codec": ""}]
    uniq.append({"kind": "audio", "quality": 0, "label": "MP3", "size": a_size, "codec": "mp3"})
    res = {"title": info.get("title") or "", "duration": dur, "thumbnail": info.get("thumbnail") or "",
           "extractor": info.get("extractor_key") or "", "options": uniq}
    _fmt_cache[key] = (time.time(), res)
    return res
