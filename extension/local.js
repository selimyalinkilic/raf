// Local mode: when no Raf server is configured, the shelf lives in this browser (IndexedDB).
// rafLocal(path, opts) answers the same /api/... calls as the server, so the popup, background
// and sessions code don't care which one they talk to. Video download, Telegram and the web app
// need a server — those calls throw RafNeedsServer.

class RafNeedsServer extends Error {}

const RAF_DB = "raf", RAF_STORE = "items";
let rafDbP = null;
function rafDb() {
  return rafDbP ||= new Promise((ok, fail) => {
    const r = indexedDB.open(RAF_DB, 1);
    r.onupgradeneeded = () => {
      const s = r.result.createObjectStore(RAF_STORE, { keyPath: "id", autoIncrement: true });
      s.createIndex("url", "url", { unique: true });
      s.createIndex("created_at", "created_at");
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => { rafDbP = null; fail(r.error); };
  });
}
async function rafTx(mode, fn) {
  const db = await rafDb();
  return new Promise((ok, fail) => {
    const tx = db.transaction(RAF_STORE, mode), store = tx.objectStore(RAF_STORE);
    let out; Promise.resolve(fn(store)).then((v) => { out = v; }, fail);
    tx.oncomplete = () => ok(out); tx.onerror = () => fail(tx.error); tx.onabort = () => fail(tx.error);
  });
}
const rafReq = (r) => new Promise((ok, fail) => { r.onsuccess = () => ok(r.result); r.onerror = () => fail(r.error); });

// same rules as the server: lowercase (Turkish-aware) and fold diacritics, so "bakim" finds "bakım"
function rafFold(x) {
  return String(x || "").toLocaleLowerCase("tr").replace(/ı/g, "i").normalize("NFD").replace(/[̀-ͯ]/g, "");
}
function rafCleanTags(tags) {
  const out = [];
  for (const t of tags || []) { const v = String(t).trim().replace(/^#+/, "").toLowerCase().slice(0, 40); if (v && !out.includes(v)) out.push(v); }
  return out.slice(0, 20);
}
const rafPublic = (it) => it && { ...it, text: undefined };  // the page text stays in storage, lists don't need it

async function rafLocalAll() {
  const all = await rafTx("readonly", (s) => rafReq(s.getAll()));
  return all.sort((a, b) => b.created_at - a.created_at || b.id - a.id);
}

async function rafLocalSave(b) {
  const now = Math.floor(Date.now() / 1000), tags = rafCleanTags(b.tags);
  return rafTx("readwrite", async (s) => {
    const old = await rafReq(s.index("url").get(b.url));
    if (old) {
      const note = !old.note ? (b.note || "") : old.note + (b.note && !old.note.includes(b.note) ? "\n" + b.note : "");
      const it = { ...old, title: b.title || old.title, description: b.description || old.description, note,
        tags: rafCleanTags([...old.tags, ...tags]), text: b.text || old.text, favicon: b.favicon || old.favicon,
        screenshot: b.screenshot || old.screenshot, updated_at: now };
      await rafReq(s.put(it)); return { item: rafPublic(it), new: false };
    }
    const it = { url: b.url, title: b.title || "", description: b.description || "", note: b.note || "", tags,
      text: (b.text || "").slice(0, 200000), favicon: b.favicon || "", screenshot: b.screenshot || "",
      source: "extension", created_at: now, updated_at: now };
    it.id = await rafReq(s.add(it)); return { item: rafPublic(it), new: true };
  });
}

async function rafLocalSearch({ q = "", tag = "", limit = 20, offset = 0 } = {}) {
  const words = rafFold(q).split(/\s+/).filter(Boolean);
  let items = await rafLocalAll();
  if (tag) items = items.filter((x) => x.tags.includes(tag.toLowerCase()));
  if (words.length) items = items.filter((x) => {
    const hay = rafFold([x.title, x.description, x.note, x.url, x.tags.join(" "), x.text].join(" "));
    return words.every((w) => hay.includes(w));
  });
  return items.slice(offset, offset + limit).map(rafPublic);
}

async function rafLocalTags() {
  const n = {};
  for (const it of await rafLocalAll()) for (const t of it.tags) n[t] = (n[t] || 0) + 1;
  return Object.entries(n).map(([tag, c]) => ({ tag, n: c })).sort((a, b) => b.n - a.n || a.tag.localeCompare(b.tag)).slice(0, 50);
}

async function rafLocalDelete(id) { return rafTx("readwrite", (s) => rafReq(s.delete(+id))); }

async function rafLocalCount(since = 0) { return (await rafLocalAll()).filter((x) => x.created_at >= since).length; }

// Export / import (JSON) — the user's own backup, also the way to move a local shelf to a server later
async function rafLocalExport() {
  return { app: "raf", version: 1, exported_at: new Date().toISOString(), items: await rafLocalAll() };
}
async function rafLocalImport(data) {
  const items = Array.isArray(data) ? data : data?.items;
  if (!Array.isArray(items)) throw new Error("Not a Raf export file");
  let n = 0;
  for (const x of items) {
    if (!x || !/^https?:/.test(x.url || "")) continue;
    await rafLocalSave(x); n++;
  }
  return n;
}

async function rafLocal(path, opts = {}) {
  const u = new URL(path, "http://raf.local"), method = (opts.method || "GET").toUpperCase();
  const body = opts.body ? JSON.parse(opts.body) : {};
  const p = u.searchParams;
  if (u.pathname === "/api/items" && method === "POST") {
    if (!/^https?:\/\//.test(body.url || "")) throw new Error("Only http/https links can be saved");
    const r = await rafLocalSave(body);
    const d = new Date(); d.setHours(0, 0, 0, 0);
    return { ...r, today: await rafLocalCount(d.getTime() / 1000) };
  }
  if (u.pathname === "/api/items") return { items: await rafLocalSearch({ q: p.get("q") || "", tag: p.get("tag") || "", limit: Math.min(+p.get("limit") || 20, 100), offset: +p.get("offset") || 0 }) };
  if (u.pathname === "/api/lookup") { const it = await rafTx("readonly", (s) => rafReq(s.index("url").get(p.get("url")))); return { item: rafPublic(it) || null }; }
  if (u.pathname === "/api/tags") return { tags: await rafLocalTags() };
  const del = u.pathname.match(/^\/api\/items\/(\d+)$/);
  if (del && method === "DELETE") { await rafLocalDelete(del[1]); return { ok: true }; }
  throw new RafNeedsServer(t("needsServer"));
}
