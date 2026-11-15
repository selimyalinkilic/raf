// Raf hub — a shared Telegram bot for the Raf extension.
//
// The extension never sees a bot token. It gets a random secret, the user taps "Start" in Telegram, and from then on:
//   POST /send   {secret, text, parse_mode?, link_preview_options?}  → the bot messages that user
//   POST /inbox  {secret, offset}                                     → messages the user sent to the bot (Telegram-like updates)
// Telegram → POST /tg (webhook, checked with the secret token header). Messages wait here only until the browser
// fetches them (then deleted; anything older than 14 days is purged daily).
const TG = (env) => env.TG_API || "https://api.telegram.org";
const J = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...CORS } });
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
const now = () => Math.floor(Date.now() / 1000);
const today = () => new Date().toISOString().slice(0, 10);

async function sha(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function rand(n, abc = "abcdefghijkmnpqrstuvwxyz23456789") {
  const b = crypto.getRandomValues(new Uint8Array(n));
  return [...b].map((x) => abc[x % abc.length]).join("");
}
async function tg(env, method, params) {
  const r = await fetch(`${TG(env)}/bot${env.BOT_TOKEN}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(params) });
  return r.json().catch(() => ({ ok: false }));
}
const say = (env, chat_id, text) => tg(env, "sendMessage", { chat_id, text, parse_mode: "HTML", link_preview_options: { is_disabled: true } });

async function user(env, secret) {
  if (typeof secret !== "string" || secret.length < 32) return null;
  const h = await sha(secret);
  const u = await env.DB.prepare("SELECT * FROM users WHERE secret_hash = ?").bind(h).first();
  return u ? { ...u, h } : null;
}

// Texts the bot says on its own (the extension answers everything else in the user's language)
const L = (code) => (/^tr/i.test(code || "") ? {
  hello: "✅ Bağlandı! Artık Raf bu sohbete sayfa gönderebilir.\n\nBana bir link at, rafına kaydedeyim (#etiket ve not ekleyebilirsin). /son /bugun /ara da çalışır.",
  noCode: "Merhaba! Bu bot Raf tarayıcı eklentisiyle çalışır. Eklentide Ayarlar → Telegram → <b>Telegram'a bağlan</b>'a bas.",
  expired: "Bu bağlantı kodunun süresi dolmuş. Eklentide Ayarlar → Telegram'dan yeniden bağlan.",
  queued: "🕓 Aldım. Chrome açılınca rafına eklenecek.",
} : {
  hello: "✅ Connected! Raf can now send pages to this chat.\n\nSend me a link and I'll save it to your shelf (add #tags and a note). /last /today /search work too.",
  noCode: "Hi! This bot works with the Raf browser extension. In the extension open Settings → Telegram → <b>Connect Telegram</b>.",
  expired: "This connect code has expired. Connect again from Settings → Telegram in the extension.",
  queued: "🕓 Got it. It'll be added to your shelf when Chrome is open.",
});

async function webhook(req, env) {
  if (req.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.WEBHOOK_SECRET) return new Response("no", { status: 403 });
  const up = await req.json().catch(() => ({}));
  const m = up.message;
  if (!m || m.chat?.type !== "private" || typeof m.text !== "string") return J({ ok: true });
  const chat = m.chat.id, l = L(m.from?.language_code), text = m.text.slice(0, 4000);
  const start = text.match(/^\/start(?:\s+([a-z0-9]{6,16}))?/i);
  if (start) {
    if (!start[1]) {
      const linked = await env.DB.prepare("SELECT 1 FROM users WHERE chat_id = ?").bind(chat).first();
      await say(env, chat, linked ? l.hello : l.noCode); return J({ ok: true });
    }
    const p = await env.DB.prepare("SELECT * FROM pending WHERE code = ?").bind(start[1].toLowerCase()).first();
    if (!p || now() - p.created > 900) { await say(env, chat, l.expired); return J({ ok: true }); }
    const name = m.chat.first_name || m.chat.username || "";
    await env.DB.batch([
      env.DB.prepare("INSERT OR REPLACE INTO users (secret_hash, chat_id, name, created, seen, day, sent) VALUES (?, ?, ?, ?, ?, ?, 0)").bind(p.secret_hash, chat, name, now(), now(), today()),
      env.DB.prepare("DELETE FROM pending WHERE code = ?").bind(p.code),
    ]);
    await say(env, chat, l.hello);
    return J({ ok: true });
  }
  const { results: us } = await env.DB.prepare("SELECT secret_hash, seen FROM users WHERE chat_id = ?").bind(chat).all();
  if (!us.length) { await say(env, chat, l.noCode); return J({ ok: true }); }
  await env.DB.batch(us.map((u) => env.DB.prepare("INSERT INTO inbox (secret_hash, chat_id, text, created) VALUES (?, ?, ?, ?)").bind(u.secret_hash, chat, text, now())));
  // nobody's browser has checked in for a while → let them know it's waiting
  if (us.every((u) => now() - u.seen > 180) && /https?:\/\//i.test(text)) await say(env, chat, l.queued);
  return J({ ok: true });
}

async function api(path, req, env) {
  const b = await req.json().catch(() => ({}));
  if (path === "/link") {  // new connect code for a browser
    const secret = rand(40, "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"), code = rand(10);
    await env.DB.prepare("INSERT INTO pending (code, secret_hash, created) VALUES (?, ?, ?)").bind(code, await sha(secret), now()).run();
    return J({ ok: true, code, secret, bot: env.BOT_USERNAME, url: `https://t.me/${env.BOT_USERNAME}?start=${code}` });
  }
  const u = await user(env, b.secret);
  if (path === "/status") return J({ ok: true, linked: !!u, name: u?.name || "", chat_id: u?.chat_id || null, bot: env.BOT_USERNAME });
  if (!u) return J({ ok: false, error: "not_linked" }, 401);
  if (path === "/send") {
    const sent = u.day === today() ? u.sent : 0;
    if (sent >= Number(env.SEND_PER_DAY || 300)) return J({ ok: false, error: "daily_limit" }, 429);
    const params = { chat_id: u.chat_id, text: String(b.text || "").slice(0, 4096), parse_mode: b.parse_mode === "HTML" ? "HTML" : undefined };
    if (b.link_preview_options) params.link_preview_options = b.link_preview_options;
    const r = await tg(env, "sendMessage", params);
    await env.DB.prepare("UPDATE users SET day = ?, sent = ?, seen = ? WHERE secret_hash = ?").bind(today(), sent + 1, now(), u.h).run();
    return r.ok ? J({ ok: true, result: { message_id: r.result.message_id } }) : J({ ok: false, error: r.description || "telegram" }, 502);
  }
  if (path === "/inbox") {
    const off = Number(b.offset) || 0;
    const stmts = [env.DB.prepare("UPDATE users SET seen = ? WHERE secret_hash = ?").bind(now(), u.h)];
    if (off) stmts.push(env.DB.prepare("DELETE FROM inbox WHERE secret_hash = ? AND id < ?").bind(u.h, off));  // acknowledged
    await env.DB.batch(stmts);
    const { results } = await env.DB.prepare("SELECT id, chat_id, text, created FROM inbox WHERE secret_hash = ? AND id >= ? ORDER BY id LIMIT 50").bind(u.h, off).all();
    return J({ ok: true, result: results.map((x) => ({ update_id: x.id, message: { message_id: x.id, date: x.created, text: x.text, chat: { id: x.chat_id, type: "private" } } })) });
  }
  if (path === "/unlink") {
    await env.DB.batch([env.DB.prepare("DELETE FROM inbox WHERE secret_hash = ?").bind(u.h), env.DB.prepare("DELETE FROM users WHERE secret_hash = ?").bind(u.h)]);
    return J({ ok: true });
  }
  return J({ ok: false, error: "not_found" }, 404);
}

export default {
  async fetch(req, env) {
    const { pathname, origin, searchParams } = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (pathname === "/tg" && req.method === "POST") return webhook(req, env);
    // one-time: point the bot's webhook here (GET /setup?key=<WEBHOOK_SECRET>)
    if (pathname === "/setup" && searchParams.get("key") === env.WEBHOOK_SECRET) {
      const w = await tg(env, "setWebhook", { url: origin + "/tg", secret_token: env.WEBHOOK_SECRET, allowed_updates: ["message"], drop_pending_updates: true });
      const c1 = await tg(env, "setMyCommands", { commands: [{ command: "son", description: "Son kayıtlar" }, { command: "bugun", description: "Bugün kaydettiklerin" }, { command: "ara", description: "Rafta ara" }], language_code: "tr" });
      const c2 = await tg(env, "setMyCommands", { commands: [{ command: "last", description: "Latest saves" }, { command: "today", description: "Saved today" }, { command: "search", description: "Search your shelf" }] });
      return J({ webhook: w, commands: [c1.ok, c2.ok] });
    }
    if (req.method === "POST" && ["/link", "/status", "/send", "/inbox", "/unlink"].includes(pathname)) return api(pathname, req, env);
    if (pathname === "/") return new Response("Raf hub · https://github.com/selimyalinkilic/raf", { headers: CORS });
    return J({ ok: false, error: "not_found" }, 404);
  },
  async scheduled(_e, env) {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM pending WHERE created < ?").bind(now() - 86400),
      env.DB.prepare("DELETE FROM inbox WHERE created < ?").bind(now() - 14 * 86400),
      env.DB.prepare("DELETE FROM users WHERE seen < ?").bind(now() - 365 * 86400),
    ]);
  },
};
