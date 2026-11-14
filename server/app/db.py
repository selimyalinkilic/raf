"""SQLite depolama: kayıtlar + tam metin arama (FTS5)."""
import json
import os
import sqlite3
import threading
import time

DB_PATH = os.environ.get("DB_PATH", "/data/raf.db")
_lock = threading.Lock()

SCHEMA = """
CREATE TABLE IF NOT EXISTS items (
  id          INTEGER PRIMARY KEY,
  url         TEXT NOT NULL UNIQUE,
  title       TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  note        TEXT NOT NULL DEFAULT '',
  tags        TEXT NOT NULL DEFAULT '[]',
  text        TEXT NOT NULL DEFAULT '',
  favicon     TEXT NOT NULL DEFAULT '',
  source      TEXT NOT NULL DEFAULT 'extension',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS items_created ON items(created_at DESC);
CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
  title, description, note, tags, text, url, tokenize='unicode61 remove_diacritics 2'
);
CREATE TRIGGER IF NOT EXISTS items_ai AFTER INSERT ON items BEGIN
  INSERT INTO items_fts(rowid, title, description, note, tags, text, url)
  VALUES (new.id, trfold(new.title), trfold(new.description), trfold(new.note), trfold(new.tags), trfold(new.text), new.url);
END;
CREATE TRIGGER IF NOT EXISTS items_ad AFTER DELETE ON items BEGIN
  DELETE FROM items_fts WHERE rowid = old.id;
END;
CREATE TRIGGER IF NOT EXISTS items_au AFTER UPDATE ON items BEGIN
  DELETE FROM items_fts WHERE rowid = old.id;
  INSERT INTO items_fts(rowid, title, description, note, tags, text, url)
  VALUES (new.id, trfold(new.title), trfold(new.description), trfold(new.note), trfold(new.tags), trfold(new.text), new.url);
END;
CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS downloads (
  id          INTEGER PRIMARY KEY,
  url         TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'video',   -- video | audio
  status      TEXT NOT NULL DEFAULT 'queued',  -- queued | running | done | error
  progress    REAL NOT NULL DEFAULT 0,
  title       TEXT NOT NULL DEFAULT '',
  file        TEXT NOT NULL DEFAULT '',
  size        INTEGER NOT NULL DEFAULT 0,
  error       TEXT NOT NULL DEFAULT '',
  source      TEXT NOT NULL DEFAULT 'extension',
  created_at  INTEGER NOT NULL,
  finished_at INTEGER
);
"""

LIST_COLS = "id, url, title, description, note, tags, favicon, screenshot, source, created_at, updated_at"


_TR = str.maketrans("ıİIşŞğĞçÇöÖüÜâÂîÎûÛ", "iiissggccoouuaaiiuu")


def trfold(v):
    """Türkçe karakterleri aramada eşit say: 'bakım' = 'bakim', 'Şişli' = 'sisli'."""
    return (v or "").translate(_TR).lower()


def connect():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    con = sqlite3.connect(DB_PATH, check_same_thread=False)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    con.create_function("trfold", 1, trfold, deterministic=True)
    return con


_con = connect()
_con.executescript(SCHEMA)
# Geriye uyumlu şema güncellemeleri
_cols = {r[1] for r in _con.execute("PRAGMA table_info(items)")}
_dcols = {r[1] for r in _con.execute("PRAGMA table_info(downloads)")}
if "quality" not in _dcols:
    _con.execute("ALTER TABLE downloads ADD COLUMN quality INTEGER NOT NULL DEFAULT 0")  # 0 = default (1080p cap)
    _con.commit()
if "screenshot" not in _cols:
    _con.execute("ALTER TABLE items ADD COLUMN screenshot TEXT NOT NULL DEFAULT ''")
    _con.commit()


def _row(r):
    d = dict(r)
    d["tags"] = json.loads(d.get("tags") or "[]")
    return d


def clean_tags(tags):
    out = []
    for t in tags or []:
        t = str(t).strip().lstrip("#").lower()
        if t and t not in out:
            out.append(t[:40])
    return out[:20]


def set_screenshot(item_id, name):
    with _lock:
        _con.execute("UPDATE items SET screenshot=? WHERE id=?", (name, item_id)); _con.commit()


# ---------- indirmeler ----------
def dl_create(url, kind="video", source="extension", quality=0):
    with _lock:
        cur = _con.execute("INSERT INTO downloads(url, kind, source, quality, created_at) VALUES (?,?,?,?,?)",
                           (url, kind, source, int(quality or 0), int(time.time())))
        _con.commit()
    return dl_get(cur.lastrowid)


def dl_find_recent(url, kind, quality=0, within=600):
    r = _con.execute("""SELECT * FROM downloads WHERE url=? AND kind=? AND quality=? AND
        (status IN ('queued','running') OR (status='done' AND created_at >= ?)) ORDER BY id DESC LIMIT 1""",
                     (url, kind, int(quality or 0), int(time.time()) - within)).fetchone()
    return dict(r) if r else None


def dl_get(dl_id):
    r = _con.execute("SELECT * FROM downloads WHERE id=?", (dl_id,)).fetchone()
    return dict(r) if r else None


def dl_update(dl_id, **fields):
    if not fields: return
    with _lock:
        _con.execute(f"UPDATE downloads SET {', '.join(k + '=?' for k in fields)} WHERE id=?", (*fields.values(), dl_id))
        _con.commit()


def dl_list(limit=50):
    return [dict(r) for r in _con.execute("SELECT * FROM downloads ORDER BY id DESC LIMIT ?", (limit,))]


def dl_next_queued():
    r = _con.execute("SELECT * FROM downloads WHERE status='queued' ORDER BY id LIMIT 1").fetchone()
    return dict(r) if r else None


def dl_delete(dl_id):
    with _lock:
        _con.execute("DELETE FROM downloads WHERE id=?", (dl_id,)); _con.commit()


def save(url, title="", description="", note="", tags=None, text="", favicon="", source="extension"):
    """Aynı URL tekrar kaydedilirse günceller (not/etiketler birleşir)."""
    now = int(time.time())
    tags = clean_tags(tags)
    with _lock:
        old = _con.execute("SELECT * FROM items WHERE url=?", (url,)).fetchone()
        if old:
            merged = clean_tags(json.loads(old["tags"]) + tags)
            note_new = note if not old["note"] else (old["note"] + ("\n" + note if note and note not in old["note"] else ""))
            _con.execute(
                "UPDATE items SET title=?, description=?, note=?, tags=?, text=?, favicon=?, updated_at=? WHERE id=?",
                (title or old["title"], description or old["description"], note_new, json.dumps(merged, ensure_ascii=False),
                 text or old["text"], favicon or old["favicon"], now, old["id"]))
            _con.commit()
            return get(old["id"]), False
        cur = _con.execute(
            "INSERT INTO items(url,title,description,note,tags,text,favicon,source,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (url, title, description, note, json.dumps(tags, ensure_ascii=False), text[:200_000], favicon, source, now, now))
        _con.commit()
        return get(cur.lastrowid), True


def get(item_id):
    r = _con.execute(f"SELECT {LIST_COLS} FROM items WHERE id=?", (item_id,)).fetchone()
    return _row(r) if r else None


def by_url(url):
    r = _con.execute(f"SELECT {LIST_COLS} FROM items WHERE url=?", (url,)).fetchone()
    return _row(r) if r else None


def delete(item_id):
    with _lock:
        n = _con.execute("DELETE FROM items WHERE id=?", (item_id,)).rowcount
        _con.commit()
    return n > 0


def _fts_query(q):
    # Her kelimeyi önek araması yap: "kombi fat" → "kombi"* AND "fat"*
    words = [trfold(w).replace('"', "") for w in q.split() if w.strip()]
    return " ".join(f'"{w}"*' for w in words)


def search(q="", tag="", since=None, limit=50, offset=0):
    where, args = [], []
    if q.strip():
        where.append("id IN (SELECT rowid FROM items_fts WHERE items_fts MATCH ?)")
        args.append(_fts_query(q))
    if tag:
        where.append("EXISTS (SELECT 1 FROM json_each(items.tags) WHERE value=?)")
        args.append(tag.lower())
    if since:
        where.append("created_at >= ?")
        args.append(int(since))
    sql = f"SELECT {LIST_COLS} FROM items" + (" WHERE " + " AND ".join(where) if where else "")
    sql += " ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?"
    return [_row(r) for r in _con.execute(sql, (*args, limit, offset))]


def count(since=None):
    if since:
        return _con.execute("SELECT count(*) FROM items WHERE created_at >= ?", (int(since),)).fetchone()[0]
    return _con.execute("SELECT count(*) FROM items").fetchone()[0]


def tag_counts():
    return [dict(r) for r in _con.execute(
        "SELECT value AS tag, count(*) AS n FROM items, json_each(items.tags) GROUP BY value ORDER BY n DESC, tag LIMIT 50")]


def kv_get(k, default=None):
    r = _con.execute("SELECT v FROM kv WHERE k=?", (k,)).fetchone()
    return r[0] if r else default


def kv_set(k, v):
    with _lock:
        _con.execute("INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", (k, str(v)))
        _con.commit()
